import { reportError } from "@effect-app/infra/errorReporter"
import { subHours } from "date-fns"
import { Cause, Context, copy, Duration, Effect, Exit, type Fiber, Layer, Option, S, Schedule } from "effect-app"
import { annotateLogscoped } from "effect-app/Effect"
import { dual, pipe } from "effect-app/Function"
import { Operation, OperationFailure, OperationId, type OperationProgress, OperationSuccess } from "effect-app/Operations"
import { NonEmptyString2k } from "effect-app/Schema"
import * as Scope from "effect/Scope"
import { setupRequestContextFromCurrent } from "./api/setupRequest.js"
import { MainFiberSet } from "./MainFiberSet.js"
import { where } from "./Model/query.js"
import { OperationsRepo } from "./OperationsRepo.js"
import { batch } from "./rateLimit.js"
import { RequestFiberSet } from "./RequestFiberSet.js"

const reportAppError = reportError("Operations.Cleanup")

const make = Effect.gen(function*() {
  const repo = yield* OperationsRepo
  const reqFiberSet = yield* RequestFiberSet
  const makeOp = Effect.sync(() => OperationId.make())

  const register = (title: NonEmptyString2k) =>
    Effect.tap(
      makeOp,
      (id) =>
        Effect.andThen(
          annotateLogscoped("operationId", id),
          Effect.acquireRelease(addOp(id, title), (_, exit) => finishOp(id, exit))
        )
    )

  const cleanup = Effect.sync(() => subHours(new Date(), 1)).pipe(
    Effect.andThen((before) => repo.query(where("updatedAt", "lt", before.toISOString()))),
    Effect.andThen((ops) => pipe(ops, batch(100, Effect.succeed, (items) => repo.removeAndPublish(items)))),
    setupRequestContextFromCurrent("Operations.cleanup")
  )

  function addOp(id: OperationId, title: NonEmptyString2k) {
    return repo.save(new Operation({ id, title })).pipe(Effect.orDie)
  }
  function findOp(id: OperationId) {
    return repo.find(id)
  }
  function finishOp(id: OperationId, exit: Exit<unknown, unknown>) {
    return Effect
      .flatMap(repo.get(id).pipe(Effect.orDie), (_) =>
        repo
          .save(
            copy(_, {
              updatedAt: new Date(),
              result: Exit.isSuccess(exit)
                ? new OperationSuccess()
                : new OperationFailure({
                  message: Cause.isInterrupted(exit.cause)
                    ? NonEmptyString2k("Interrupted")
                    : Cause.isDie(exit.cause)
                    ? NonEmptyString2k("Unknown error")
                    : Cause
                      .failureOption(exit.cause)
                      .pipe(
                        Option.flatMap((_) =>
                          typeof _ === "object" && _ !== null && "message" in _ && S.is(NonEmptyString2k)(_.message)
                            ? Option.some(_.message)
                            : Option.none()
                        ),
                        Option.getOrNull
                      )
                })
            })
          )
          .pipe(Effect.orDie))
  }
  function update(id: OperationId, progress: OperationProgress) {
    return Effect.flatMap(
      repo.get(id).pipe(Effect.orDie),
      (_) => repo.save(copy(_, { updatedAt: new Date(), progress })).pipe(Effect.orDie)
    )
  }

  function fork<R, R2, E, E2, A, A2>(
    self: (id: OperationId) => Effect<A, E, R>,
    fnc: (id: OperationId) => Effect<A2, E2, R2>,
    title: NonEmptyString2k
  ): Effect<
    RunningOperation<A, E>,
    never,
    Exclude<R, Scope.Scope> | Exclude<R2, Scope.Scope>
  > {
    return Effect
      .flatMap(
        Scope.make(),
        (scope) =>
          register(title)
            .pipe(
              Scope.extend(scope),
              Effect.flatMap((id) =>
                reqFiberSet
                  .forkDaemonReportUnexpected(Scope.use(
                    self(id).pipe(Effect.withSpan(title, { captureStackTrace: false })),
                    scope
                  ))
                  .pipe(Effect.map((fiber): RunningOperation<A, E> => ({ fiber, id })))
              ),
              Effect.tap(({ id }) =>
                Effect.interruptible(fnc(id)).pipe(
                  Effect.forkScoped,
                  Scope.extend(scope)
                )
              )
            )
      )
  }

  const fork2: {
    (title: NonEmptyString2k): <R, E, A>(
      self: (opId: OperationId) => Effect<A, E, R>
    ) => Effect<RunningOperation<A, E>, never, Exclude<R, Scope.Scope>>
    <R, E, A>(
      self: (opId: OperationId) => Effect<A, E, R>,
      title: NonEmptyString2k
    ): Effect<RunningOperation<A, E>, never, Exclude<R, Scope.Scope>>
  } = dual(
    2,
    <R, E, A>(self: (opId: OperationId) => Effect<A, E, R>, title: NonEmptyString2k) =>
      Effect.flatMap(
        Scope.make(),
        (scope) =>
          register(title)
            .pipe(
              Scope.extend(scope),
              Effect
                .flatMap((id) =>
                  reqFiberSet
                    .forkDaemonReportUnexpected(Scope.use(
                      self(id).pipe(Effect.withSpan(title, { captureStackTrace: false })),
                      scope
                    ))
                    .pipe(Effect.map((fiber): RunningOperation<A, E> => ({ fiber, id })))
                )
            )
      )
  )

  const forkOperation: {
    (title: NonEmptyString2k): <R, E, A>(
      self: Effect<A, E, R>
    ) => Effect<RunningOperation<A, E>, never, Exclude<R, Scope.Scope>>
    <R, E, A>(
      self: Effect<A, E, R>,
      title: NonEmptyString2k
    ): Effect<RunningOperation<A, E>, never, Exclude<R, Scope.Scope>>
  } = dual(
    2,
    <R, E, A>(self: Effect<A, E, R>, title: NonEmptyString2k) =>
      Effect.flatMap(
        Scope.make(),
        (scope) =>
          register(title)
            .pipe(
              Scope.extend(scope),
              Effect
                .flatMap((id) =>
                  reqFiberSet
                    .forkDaemonReportUnexpected(Scope.use(
                      self.pipe(Effect.withSpan(title, { captureStackTrace: false })),
                      scope
                    ))
                    .pipe(Effect.map((fiber): RunningOperation<A, E> => ({ fiber, id })))
                )
            )
      )
  )

  function forkOperationFunction<R, E, A, Inp>(fnc: (inp: Inp) => Effect<A, E, R>, title: NonEmptyString2k) {
    return (inp: Inp) => fnc(inp).pipe((_) => forkOperation(_, title))
  }

  return {
    cleanup,
    register,
    fork,
    fork2,
    forkOperation,
    forkOperationFunction,
    all: repo.all,
    find: findOp,
    update
  }
})

export class Operations extends Context.TagMakeId("effect-app/Operations", make)<Operations>() {
  private static readonly CleanupLive = this
    .use((_) =>
      _.cleanup.pipe(
        Effect.exit,
        Effect
          .flatMap((_) => {
            if (Exit.isSuccess(_)) {
              return Effect.void
            } else {
              return reportAppError(_.cause)
            }
          }),
        Effect.schedule(Schedule.fixed(Duration.minutes(20))),
        Effect.map((_) => _ as never),
        MainFiberSet.run
      )
    )
    .pipe(Layer.effectDiscard, Layer.provide(MainFiberSet.Live))

  static readonly Live = this.CleanupLive.pipe(Layer.provideMerge(this.toLayer()), Layer.provide(RequestFiberSet.Live))

  static readonly forkOperation = (title: NonEmptyString2k) => <R, E, A>(self: Effect<A, E, R>) =>
    this.use((_) => _.forkOperation(self, title))
  static readonly forkOperationFunction =
    <R, E, A, Inp>(fnc: (inp: Inp) => Effect<A, E, R>, title: NonEmptyString2k) => (inp: Inp) =>
      this.use((_) => _.forkOperationFunction(fnc, title)(inp))
  static readonly fork = <R, R2, E, E2, A, A2>(
    self: (id: OperationId) => Effect<A, E, R>,
    fnc: (id: OperationId) => Effect<A2, E2, R2>,
    title: NonEmptyString2k
  ) => this.use((_) => _.fork(self, fnc, title))

  static readonly fork2 = (title: NonEmptyString2k) => <R, E, A>(self: (opId: OperationId) => Effect<A, E, R>) =>
    this.use((_) => _.fork2(self, title))
}

export interface RunningOperation<A, E> {
  id: OperationId
  fiber: Fiber.RuntimeFiber<A, E>
}

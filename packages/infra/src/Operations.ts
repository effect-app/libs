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

  const addOp = Effect.fnUntraced(function*(id: OperationId, title: NonEmptyString2k) {
    return yield* repo.save(Operation.make({ id, title })).pipe(Effect.orDie)
  })

  const finishOp = Effect.fnUntraced(function*(id: OperationId, exit: Exit.Exit<unknown, unknown>) {
    const op = yield* repo.get(id).pipe(Effect.orDie)
    const result = Exit.isSuccess(exit)
      ? OperationSuccess.make({})
      : OperationFailure.make({
        message: Cause.hasInterruptsOnly(exit.cause)
          ? NonEmptyString2k("Interrupted")
          : Cause.hasDies(exit.cause)
          ? NonEmptyString2k("Unknown error")
          : Cause
            .findErrorOption(exit.cause)
            .pipe(
              Option.flatMap((_) =>
                typeof _ === "object" && _ !== null && "message" in _ && S.is(NonEmptyString2k)(_.message)
                  ? Option.some(_.message)
                  : Option.none()
              ),
              Option.getOrNull
            )
      })
    return yield* repo.save(copy(op, { updatedAt: new Date(), result })).pipe(Effect.orDie)
  })

  const register = (title: NonEmptyString2k) =>
    Effect.tap(
      makeOp,
      (id) =>
        Effect.andThen(
          annotateLogscoped("operationId", id),
          Effect.acquireRelease(addOp(id, title), (_, exit) => finishOp(id, exit))
        )
    )

  const cleanup = Effect
    .gen(function*() {
      const before = subHours(new Date(), 1)
      const ops = yield* repo.query(where("updatedAt", "lt", before.toISOString()))
      return yield* pipe(ops, batch(100, Effect.succeed, (items) => repo.removeAndPublish(items)))
    })
    .pipe(setupRequestContextFromCurrent("Operations.cleanup"))

  const findOp = (id: OperationId) => repo.find(id)

  const update = Effect.fnUntraced(function*(id: OperationId, progress: OperationProgress) {
    const op = yield* repo.get(id).pipe(Effect.orDie)
    return yield* repo.save(copy(op, { updatedAt: new Date(), progress })).pipe(Effect.orDie)
  })

  function fork<R, R2, E, E2, A, A2>(
    self: (id: OperationId) => Effect.Effect<A, E, R>,
    fnc: (id: OperationId) => Effect.Effect<A2, E2, R2>,
    title: NonEmptyString2k
  ): Effect.Effect<
    RunningOperation<A, E>,
    never,
    Exclude<R, Scope.Scope> | Exclude<R2, Scope.Scope>
  > {
    return Effect.gen(function*() {
      const scope = yield* Scope.make()
      const id = yield* Scope.provide(register(title), scope)
      const fiber = yield* reqFiberSet.forkDaemonReportUnexpected(
        Scope.use(
          self(id).pipe(Effect.withSpan(title, {}, { captureStackTrace: false })),
          scope
        )
      )
      yield* Scope.provide(Effect.forkScoped(Effect.interruptible(fnc(id))), scope)
      return { fiber, id } satisfies RunningOperation<A, E>
    })
  }

  const fork2: {
    (title: NonEmptyString2k): <R, E, A>(
      self: (opId: OperationId) => Effect.Effect<A, E, R>
    ) => Effect.Effect<RunningOperation<A, E>, never, Exclude<R, Scope.Scope>>
    <R, E, A>(
      self: (opId: OperationId) => Effect.Effect<A, E, R>,
      title: NonEmptyString2k
    ): Effect.Effect<RunningOperation<A, E>, never, Exclude<R, Scope.Scope>>
  } = dual(
    2,
    Effect.fnUntraced(function*<R, E, A>(
      self: (opId: OperationId) => Effect.Effect<A, E, R>,
      title: NonEmptyString2k
    ) {
      const scope = yield* Scope.make()
      const id = yield* Scope.provide(register(title), scope)
      const fiber = yield* reqFiberSet.forkDaemonReportUnexpected(
        Scope.use(
          self(id).pipe(Effect.withSpan(title, {}, { captureStackTrace: false })),
          scope
        )
      )
      return { fiber, id } satisfies RunningOperation<A, E>
    })
  )

  const forkOperation: {
    (title: NonEmptyString2k): <R, E, A>(
      self: Effect.Effect<A, E, R>
    ) => Effect.Effect<RunningOperation<A, E>, never, Exclude<R, Scope.Scope>>
    <R, E, A>(
      self: Effect.Effect<A, E, R>,
      title: NonEmptyString2k
    ): Effect.Effect<RunningOperation<A, E>, never, Exclude<R, Scope.Scope>>
  } = dual(
    2,
    Effect.fnUntraced(function*<R, E, A>(self: Effect.Effect<A, E, R>, title: NonEmptyString2k) {
      const scope = yield* Scope.make()
      const id = yield* Scope.provide(register(title), scope)
      const fiber = yield* reqFiberSet.forkDaemonReportUnexpected(
        Scope.use(
          self.pipe(Effect.withSpan(title, {}, { captureStackTrace: false })),
          scope
        )
      )
      return { fiber, id } satisfies RunningOperation<A, E>
    })
  )

  function forkOperationFunction<R, E, A, Inp>(fnc: (inp: Inp) => Effect.Effect<A, E, R>, title: NonEmptyString2k) {
    return (inp: Inp) => forkOperation(fnc(inp), title)
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

export class Operations extends Context.Opaque<Operations>()("effect-app/Operations", { make }) {
  private static readonly CleanupLive = this
    .use((_) =>
      _.cleanup.pipe(
        Effect.exit,
        Effect.flatMap((exit) => Exit.isSuccess(exit) ? Effect.void : reportAppError(exit.cause)),
        Effect.schedule(Schedule.fixed(Duration.minutes(20))),
        Effect.map((_) => _ as never),
        MainFiberSet.run
      )
    )
    .pipe(Layer.effectDiscard, Layer.provide(MainFiberSet.Live))

  static readonly Live = this.CleanupLive.pipe(
    Layer.provideMerge(this.toLayer(this.make)),
    Layer.provide(RequestFiberSet.Live)
  )

  static readonly forkOperation = (title: NonEmptyString2k) => <R, E, A>(self: Effect.Effect<A, E, R>) =>
    this.use((_) => _.forkOperation(self, title))
  static readonly forkOperationFunction =
    <R, E, A, Inp>(fnc: (inp: Inp) => Effect.Effect<A, E, R>, title: NonEmptyString2k) => (inp: Inp) =>
      this.use((_) => _.forkOperationFunction(fnc, title)(inp))
  static readonly fork = <R, R2, E, E2, A, A2>(
    self: (id: OperationId) => Effect.Effect<A, E, R>,
    fnc: (id: OperationId) => Effect.Effect<A2, E2, R2>,
    title: NonEmptyString2k
  ) => this.use((_) => _.fork(self, fnc, title))

  static readonly fork2 = (title: NonEmptyString2k) => <R, E, A>(self: (opId: OperationId) => Effect.Effect<A, E, R>) =>
    this.use((_) => _.fork2(self, title))
}

export interface RunningOperation<A, E> {
  id: OperationId
  fiber: Fiber.Fiber<A, E>
}

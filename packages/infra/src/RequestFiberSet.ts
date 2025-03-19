/* eslint-disable @typescript-eslint/no-explicit-any */
import { Context, Effect, Fiber, FiberSet, Option, type Tracer } from "effect-app"
import { reportRequestError, reportUnknownRequestError } from "./api/reportError.js"
import { InfraLogger } from "./logger.js"

const getRootParentSpan = Effect.gen(function*() {
  let span: Tracer.AnySpan | null = yield* Effect.currentSpan.pipe(
    Effect.catchTag("NoSuchElementException", () => Effect.succeed(null))
  )
  if (!span) return span
  while (span._tag === "Span" && Option.isSome(span.parent)) {
    span = span.parent.value
  }
  return span
})

export const setRootParentSpan = <A, E, R>(self: Effect<A, E, R>) =>
  getRootParentSpan.pipe(Effect.andThen((span) => span ? Effect.withParentSpan(self, span) : self))

const make = Effect.gen(function*() {
  const set = yield* FiberSet.make<any, any>()
  const add = (...fibers: Fiber.RuntimeFiber<any, any>[]) =>
    Effect.sync(() => fibers.forEach((_) => FiberSet.unsafeAdd(set, _)))
  const addAll = (fibers: readonly Fiber.RuntimeFiber<any, any>[]) =>
    Effect.sync(() => fibers.forEach((_) => FiberSet.unsafeAdd(set, _)))
  const join = FiberSet.size(set).pipe(
    Effect.andThen((count) => InfraLogger.logInfo(`Joining ${count} current fibers on the RequestFiberSet`)),
    Effect.andThen(FiberSet.join(set))
  )
  const run = FiberSet.run(set)
  const register = <A, E, R>(self: Effect<A, E, R>) =>
    self.pipe(Effect.fork, Effect.tap(add), Effect.andThen(Fiber.join))

  // const waitUntilEmpty = Effect.gen(function*() {
  //   const currentSize = yield* FiberSet.size(set)
  //   if (currentSize === 0) {
  //     return
  //   }
  //   yield* Effect.logInfo("Waiting RequestFiberSet to be empty: " + currentSize)
  //   while ((yield* FiberSet.size(set)) > 0) yield* Effect.sleep("250 millis")
  //   yield* Effect.logDebug("RequestFiberSet is empty")
  // })
  // TODO: loop and interrupt all fibers in the set continuously?
  const interrupt = Fiber.interruptAll(set)

  /**
   * Forks the effect into a new fiber attached to the RequestFiberSet scope. Because the
   * new fiber isn't attached to the parent, when the fiber executing the
   * returned effect terminates, the forked fiber will continue running.
   * The fiber will be interrupted when the RequestFiberSet scope is closed.
   *
   * Reports errors.
   */
  function forkDaemonReport<R, E, A>(self: Effect<A, E, R>) {
    return self.pipe(
      reportRequestError,
      Effect.uninterruptible,
      run
    )
  }

  /**
   * Forks the effect into a new fiber attached to the RequestFiberSet scope. Because the
   * new fiber isn't attached to the parent, when the fiber executing the
   * returned effect terminates, the forked fiber will continue running.
   * The fiber will be interrupted when the RequestFiberSet scope is closed.
   *
   * Reports unexpected errors.
   */
  function forkDaemonReportUnexpected<R, E, A>(self: Effect<A, E, R>) {
    return self
      .pipe(
        reportUnknownRequestError,
        Effect.uninterruptible,
        run
      )
  }

  return {
    interrupt,
    join,
    run,
    add,
    addAll,
    register,
    forkDaemonReport,
    forkDaemonReportUnexpected
  }
})

/**
 * Whenever you fork a fiber for a Request, and you want to prevent dependent services to close prematurely on interruption,
 * like the ServiceBus Sender, you should register these fibers in this FiberSet.
 */
export class RequestFiberSet extends Context.TagMakeId("RequestFiberSet", make)<RequestFiberSet>() {
  static readonly Live = this.toLayerScoped()
  static readonly register = <A, E, R>(self: Effect<A, E, R>) => this.use((_) => _.register(self))
  static readonly run = <A, E, R>(self: Effect<A, E, R>) => this.use((_) => _.run(self))
  static readonly forkDaemonReport = <R, E, A>(self: Effect<A, E, R>) => this.use((_) => _.forkDaemonReport(self))
  static readonly forkDaemonReportUnexpected = <R, E, A>(self: Effect<A, E, R>) =>
    this.use((_) => _.forkDaemonReportUnexpected(self))
}

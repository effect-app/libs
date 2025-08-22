import { Context, Effect, Fiber, FiberSet, Layer } from "effect-app"
import type {} from "effect/Scope"
import type {} from "effect/Context"
import { InfraLogger } from "./logger.js"
import { reportNonInterruptedFailureCause } from "./QueueMaker/errors.js"
import { setRootParentSpan } from "./RequestFiberSet.js"

const make = Effect.gen(function*() {
  const set = yield* FiberSet.make<unknown, never>()
  const add = (...fibers: Fiber.RuntimeFiber<never, never>[]) =>
    Effect.sync(() => fibers.forEach((_) => FiberSet.unsafeAdd(set, _)))
  const addAll = (fibers: readonly Fiber.RuntimeFiber<never, never>[]) =>
    Effect.sync(() => fibers.forEach((_) => FiberSet.unsafeAdd(set, _)))
  const join = FiberSet.size(set).pipe(
    Effect.andThen((count) => InfraLogger.logDebug(`Joining ${count} current fibers on the MainFiberSet`)),
    Effect.andThen(FiberSet.join(set))
  )
  const run = FiberSet.run(set)

  // const waitUntilEmpty = Effect.gen(function*() {
  //   const currentSize = yield* FiberSet.size(set)
  //   if (currentSize === 0) {
  //     return
  //   }
  //   yield* InfraLogger.logInfo("Waiting MainFiberSet to be empty: " + currentSize)
  //   while ((yield* FiberSet.size(set)) > 0) yield* Effect.sleep("250 millis")
  //   yield* InfraLogger.logDebug("MainFiberSet is empty")
  // })

  // TODO: loop and interrupt all fibers in the set continuously?
  const interrupt = Fiber.interruptAll(set)

  /**
   * Forks the effect into a new fiber attached to the MainFiberSet scope. Because the
   * new fiber isn't attached to the parent, when the fiber executing the
   * returned effect terminates, the forked fiber will continue running.
   * The fiber will be interrupted when the MainFiberSet scope is closed.
   *
   * The parent span is set to the root span of the current fiber.
   * Reports and then swallows errors.
   */
  function forkDaemonReport<A, E, R>(self: Effect.Effect<A, E, R>) {
    return self.pipe(
      Effect.asVoid,
      Effect.catchAllCause(reportNonInterruptedFailureCause({})),
      setRootParentSpan,
      Effect.uninterruptible,
      run
    )
  }
  return {
    interrupt,
    join,
    forkDaemonReport,
    run,
    add,
    addAll
  }
})

/**
 * Whenever you fork long running (e.g worker) fibers via e.g `Effect.forkScoped` or `Effect.forkDaemon`
 * you should register these long running fibers in a FiberSet, and join them at the end of your main program.
 * This way any errors will blow up the main program instead of fibers dying unknowingly.
 */
export class MainFiberSet extends Context.TagMakeId("MainFiberSet", make)<MainFiberSet>() {
  static readonly Live = this.toLayerScoped()
  static readonly JoinLive = this.pipe(Effect.andThen((_) => _.join), Layer.effectDiscard, Layer.provide(this.Live))
  static readonly run = <A, R>(self: Effect.Effect<A, never, R>) => this.use((_) => _.run(self))
  static readonly forkDaemonReport = <A, E, R>(self: Effect.Effect<A, E, R>) =>
    this.use((_) => _.forkDaemonReport(self))
}

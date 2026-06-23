import * as Context from "effect-app/Context"
import * as Effect from "effect-app/Effect"
import * as Layer from "effect-app/Layer"
import * as Option from "effect-app/Option"
import * as Fiber from "effect/Fiber"
import * as FiberSet from "effect/FiberSet"
import type * as Tracer from "effect/Tracer"

import { InfraLogger } from "./logger.ts"
import { reportNonInterruptedFailureCause } from "./QueueMaker/errors.ts"

// Walk to the root span so a daemon fiber's spans aren't parented to a span that
// may already be closing (e.g. the originating request).
const getRootParentSpan = Effect.gen(function*() {
  let span: Tracer.AnySpan | null = yield* Effect.currentSpan.pipe(
    Effect.catchTag("NoSuchElementError", () => Effect.succeed(null))
  )
  if (!span) return span
  while (span._tag === "Span" && Option.isSome(span.parent)) {
    span = span.parent.value
  }
  return span
})

export const setRootParentSpan = <A, E, R>(self: Effect.Effect<A, E, R>) =>
  getRootParentSpan.pipe(Effect.andThen((span) => span ? Effect.withParentSpan(self, span) : self))

const make = Effect.gen(function*() {
  const set = yield* FiberSet.make<unknown, never>()
  const add = (...fibers: Fiber.Fiber<never>[]) => Effect.sync(() => fibers.forEach((_) => FiberSet.addUnsafe(set, _)))
  const addAll = (fibers: readonly Fiber.Fiber<never>[]) =>
    Effect.sync(() => fibers.forEach((_) => FiberSet.addUnsafe(set, _)))
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
      Effect.catchCause(reportNonInterruptedFailureCause({})),
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
export class MainFiberSet extends Context.Service<MainFiberSet>()("MainFiberSet", { make }) {
  static readonly Live = Layer.effect(this, this.make)
  static readonly JoinLive = this.pipe(
    Effect.andThen((_) => _.join),
    Layer.effectDiscard,
    Layer.provide(this.Live)
  )
  static readonly run = <A, R>(self: Effect.Effect<A, never, R>) => this.pipe(Effect.andThen((_) => _.run(self)))
  static readonly forkDaemonReport = <A, E, R>(self: Effect.Effect<A, E, R>) =>
    this.pipe(Effect.andThen((_) => _.forkDaemonReport(self)))
}

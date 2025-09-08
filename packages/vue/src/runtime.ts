import { ManagedRuntime } from "effect"
import { Effect, Layer, Logger } from "effect-app"

export function makeAppRuntime<A, E>(layer: Layer.Layer<A, E>) {
  return Effect.gen(function*() {
    layer = layer.pipe(
      Layer.provide(Logger.replace(Logger.defaultLogger, Logger.withSpanAnnotations(Logger.prettyLogger())))
    )
    const mrt = ManagedRuntime.make(layer)
    yield* mrt.runtimeEffect
    return mrt as ManagedRuntime.ManagedRuntime<A, never> // as we initialise here, there is no more error left.
  })
}

export function initializeSync<A, E>(layer: Layer.Layer<A, E, never>) {
  const runtime = Effect.runSync(makeAppRuntime(layer))
  return runtime
}

export function initializeAsync<A, E>(layer: Layer.Layer<A, E, never>) {
  return Effect
    .runPromise(makeAppRuntime(layer))
}

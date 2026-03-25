import { ManagedRuntime } from "effect"
import { Effect, Layer, Logger } from "effect-app"

export function makeAppRuntime<A, E>(layer: Layer.Layer<A, E>) {
  return Effect.gen(function*() {
    const l = layer.pipe(
      Layer.provide(Logger.layer([Logger.consolePretty()]))
    ) as Layer.Layer<A, never>
    const mrt = ManagedRuntime.make(l)
    yield* mrt.servicesEffect
    return Object.assign(mrt, {
      [Symbol.dispose]() {
        return Effect.runSync(mrt.disposeEffect)
      },

      [Symbol.asyncDispose]() {
        return mrt.dispose()
      }
    }) // as we initialise here, there is no more error left.
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

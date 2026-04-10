import { Exit, flow, ManagedRuntime } from "effect"
import { Effect, Layer, Logger } from "effect-app"
import { CauseException } from "effect-app/client/errors"
import { type Context } from "effect-app/Context"

export function makeAppRuntime<A, E>(layer: Layer.Layer<A, E>) {
  return Effect.gen(function*() {
    const l = layer.pipe(
      Layer.provide(Logger.layer([Logger.consolePretty()]))
    ) as Layer.Layer<A, never>
    const mrt = ManagedRuntime.make(l)
    yield* mrt.contextEffect
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

// we wrap into CauseException because we want to keep the full cause of the failure.
export const makeRunPromise = <T>(services: Context<T>) =>
  flow(Effect.runPromiseExitWith(services), (_) =>
    _.then(
      Exit.match({
        onFailure: (cause) => Promise.reject(new CauseException(cause, "runPromise")),
        onSuccess: (value) => Promise.resolve(value)
      })
    ))

export const makeRunSync = <T>(services: Context<T>) =>
  flow(
    Effect.runSyncExitWith(services),
    Exit.match({
      onFailure: (cause) => {
        throw new CauseException(cause, "runSync")
      },
      onSuccess: (value) => value
    })
  )

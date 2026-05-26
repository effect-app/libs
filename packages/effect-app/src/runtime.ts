import * as Exit from "effect/Exit"
import { flow } from "effect/Function"
import * as Logger from "effect/Logger"
import * as ManagedRuntime from "effect/ManagedRuntime"
import { CauseException } from "./client/errors.js"
import { type Context } from "./Context.js"
import * as Effect from "./Effect.js"
import * as Layer from "./Layer.js"

export const makeAppRuntime = Effect.fnUntraced(function*<A, E>(layer: Layer.Layer<A, E>) {
  const l = layer.pipe(
    Layer.provide(Logger.layer([Logger.consolePretty()]))
  ) as Layer.Layer<A>
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

export function initializeSync<A, E>(layer: Layer.Layer<A, E>) {
  const runtime = Effect.runSync(makeAppRuntime(layer))
  return runtime
}

export function initializeAsync<A, E>(layer: Layer.Layer<A, E>) {
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

import { Exit, Runtime } from "effect"
import { Effect, Layer, Logger } from "effect-app"
import * as Scope from "effect/Scope"

export function makeAppRuntime<A, E, R>(layer: Layer.Layer<A, E, R>) {
  return Effect.gen(function*() {
    layer = layer.pipe(
      Layer.provide(Logger.replace(Logger.defaultLogger, Logger.withSpanAnnotations(Logger.prettyLogger())))
    )
    const scope = yield* Scope.make()
    const env = yield* layer.pipe(Layer.buildWithScope(scope))
    const runtime = yield* Effect.runtime<A>().pipe(Effect.scoped, Effect.provide(env))

    return {
      runtime: Object.assign(runtime, {
        runPromise: Runtime.runPromise(runtime),
        runPromiseExit: Runtime.runPromiseExit(runtime),
        runSync: Runtime.runSync(runtime),
        runSyncExit: Runtime.runSyncExit(runtime),
        runFork: Runtime.runFork(runtime)
      }),
      clean: Scope.close(scope, Exit.void)
    }
  })
}

export function initializeSync<A, E>(layer: Layer.Layer<A, E, never>) {
  const { clean, runtime } = Effect.runSync(makeAppRuntime(layer))
  return {
    runtime,
    clean: () => Effect.runSync(clean)
  }
}

export function initializeAsync<A, E>(layer: Layer.Layer<A, E, never>) {
  return Effect
    .runPromise(makeAppRuntime(layer))
    .then(({ clean, runtime }) => {
      return {
        runtime,
        clean: () => Effect.runPromise(clean)
      }
    })
}

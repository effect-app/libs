import * as Context from "effect-app/Context"
import * as Effect from "effect-app/Effect"
import * as Layer from "effect-app/Layer"
import { ContextMap } from "effect-app/Store"
import * as Data from "effect/Data"

// TODO: we have to create a new contextmap on every request.
// we want to share one map during startup
// but we want to make sure we don't re-use the startup map after startup
// we can call another start after startup. but it would be even better if we could Die on accessing rootmap
// we could also make the ContextMap optional, and when missing, issue a warning instead?

export class ContextMapContainer extends Context.Reference("ContextMapContainer", {
  defaultValue: (): ContextMap | "root" => "root"
}) {
  static readonly layer = Layer.effect(this, ContextMap.make.pipe(Effect.map(ContextMap.of)))
}

export class ContextMapNotStartedError extends Data.TaggedError("ContextMapNotStartedError") {}

export const getContextMap = ContextMapContainer.pipe(
  Effect.filterOrFail((_) => _ !== "root", () => new ContextMapNotStartedError())
)

/**
 * Runs `make` at most once per ContextMap (i.e. per request) and caches the
 * resulting value in the ContextMap under a fresh symbol. Subsequent calls of
 * the returned Effect within the same ContextMap return the cached value.
 *
 * Uses the ContextMap's shared semaphore for safe single initialization.
 */
export const cachedPerRequest = <A, E, R>(
  make: Effect.Effect<A, E, R>
): Effect.Effect<A, E | ContextMapNotStartedError, R> => {
  const cacheKey = Symbol()
  return getContextMap.pipe(
    Effect.flatMap((ctxMap) => ctxMap.getOrCreateStoreEffect(cacheKey, make))
  )
}

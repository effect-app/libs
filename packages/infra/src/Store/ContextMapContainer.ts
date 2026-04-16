import { Context, Data, Effect, Layer, RequestResolver } from "effect-app"
import { dual } from "effect/Function"
import type * as Request from "effect/Request"
import { ContextMap } from "./service.js"

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

export const getContextMap = ContextMapContainer.asEffect().pipe(
  Effect.filterOrFail((_) => _ !== "root", () => new ContextMapNotStartedError())
)

/**
 * Uses the official `RequestResolver.withCache` internally,
 * creating one cached resolver per ContextMap (i.e. per request).
 * Uses a shared semaphore in the ContextMap to ensure safe single initialization.
 */
export const withRequestResolverCache: {
  <A extends Request.Request<any, any>>(options: {
    readonly capacity: number
    readonly strategy?: "lru" | "fifo" | undefined
  }): (
    self: RequestResolver.RequestResolver<A>
  ) => Effect.Effect<RequestResolver.RequestResolver<A>, ContextMapNotStartedError>
  <A extends Request.Request<any, any>>(
    self: RequestResolver.RequestResolver<A>,
    options: {
      readonly capacity: number
      readonly strategy?: "lru" | "fifo" | undefined
    }
  ): Effect.Effect<RequestResolver.RequestResolver<A>, ContextMapNotStartedError>
} = dual(2, <A extends Request.Request<any, any>>(
  self: RequestResolver.RequestResolver<A>,
  options: {
    readonly capacity: number
    readonly strategy?: "lru" | "fifo" | undefined
  }
): Effect.Effect<RequestResolver.RequestResolver<A>, ContextMapNotStartedError> => {
  const cacheKey = Symbol()
  return getContextMap.pipe(
    Effect.flatMap((ctxMap) =>
      ctxMap.getOrCreateStoreEffect(
        cacheKey,
        RequestResolver.withCache(self, options)
      )
    )
  )
})

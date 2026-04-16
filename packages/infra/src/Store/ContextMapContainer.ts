import { Context, Data, Effect, type Exit, Layer, RequestResolver } from "effect-app"
import type { NonEmptyArray } from "effect/Array"
import { dual } from "effect/Function"
import * as MutableHashMap from "effect/MutableHashMap"
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

export const withRequestResolverCache: {
  <A extends Request.Request<any, any>>(options: {
    readonly capacity: number
    readonly strategy?: "lru" | "fifo" | undefined
  }): (self: RequestResolver.RequestResolver<A>) => RequestResolver.RequestResolver<A>
  <A extends Request.Request<any, any>>(
    self: RequestResolver.RequestResolver<A>,
    options: {
      readonly capacity: number
      readonly strategy?: "lru" | "fifo" | undefined
    }
  ): RequestResolver.RequestResolver<A>
} = dual(2, <A extends Request.Request<any, any>>(
  self: RequestResolver.RequestResolver<A>,
  options: {
    readonly capacity: number
    readonly strategy?: "lru" | "fifo" | undefined
  }
): RequestResolver.RequestResolver<A> => {
  const cacheKey = Symbol()
  const strategy = options.strategy ?? "lru"
  type CacheEntry = {
    readonly entry: Request.Entry<A>
    exit: Exit.Exit<Request.Success<A>, Request.Error<A>> | undefined
  }
  const getCache = (entry: Request.Entry<A>) => {
    const container = Context.get(entry.context as Context.Context<ContextMapContainer>, ContextMapContainer)
    if (container === "root") throw new Error("withRequestResolverCache: no active ContextMap")
    return container.getOrCreateStore<MutableHashMap.MutableHashMap<A, CacheEntry>>(
      cacheKey,
      () => MutableHashMap.empty()
    )
  }
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
  return RequestResolver.makeWith({
    ...(self as any),
    runAll(entries: NonEmptyArray<Request.Entry<A>>, key: unknown) {
      return Effect.onExit(
        (self as any).runAll(entries, key),
        () => {
          const cache = getCache(entries[0])
          let toRemove = MutableHashMap.size(cache) - options.capacity
          if (toRemove <= 0) return Effect.void
          for (const k of MutableHashMap.keys(cache)) {
            MutableHashMap.remove(cache, k)
            toRemove--
            if (toRemove <= 0) break
          }
          return Effect.void
        }
      )
    },
    preCheck(entry: Request.Entry<A>) {
      const cache = getCache(entry)
      const ocached = MutableHashMap.get(cache, entry.request)
      if (ocached._tag === "None") {
        const cached: CacheEntry = { entry, exit: undefined }
        MutableHashMap.set(cache, entry.request, cached)
        const prevComplete = entry.completeUnsafe
        entry.completeUnsafe = function(exit) {
          cached.exit = exit as any
          prevComplete(exit)
        }
        return true
      }
      const cached = ocached.value
      if (cached.exit) {
        if (strategy === "lru") {
          MutableHashMap.remove(cache, cached.entry.request)
          MutableHashMap.set(cache, cached.entry.request, cached)
        }
        entry.completeUnsafe(cached.exit as any)
      } else {
        cached.entry.uninterruptible = true
        const prevComplete = cached.entry.completeUnsafe
        cached.entry.completeUnsafe = function(exit) {
          prevComplete(exit)
          entry.completeUnsafe(exit)
        }
      }
      return false
    }
  })
})

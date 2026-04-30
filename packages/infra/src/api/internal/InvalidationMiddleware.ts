import { Effect, Ref } from "effect-app"
import { Invalidation } from "effect-app/rpc"
import { HttpMiddleware, HttpServerResponse } from "effect-app/http"

/**
 * HTTP middleware that provides a request-scoped `InvalidationSet` and appends an
 * `x-invalidate` response header when any RPC handler (or the `InvalidationMiddleware`)
 * adds invalidation keys during the request.
 *
 * Mount this middleware around the RPC router to enable server-driven cache invalidation.
 *
 * @example
 * ```ts
 * HttpRouter.unwrapped
 *   .pipe(Layer.provide(InvalidationSetMiddlewareLive))
 * ```
 */
export const InvalidationSetMiddleware = HttpMiddleware.make((app) =>
  Effect.gen(function*() {
    const ref = yield* Ref.make<ReadonlyArray<Invalidation.InvalidationKey>>([])
    const service = Invalidation.makeInvalidationSet(ref)

    const res = yield* Effect.provideService(app, Invalidation.InvalidationSet, service)

    const keys = yield* Ref.get(ref)
    if (!keys.length) return res
    return HttpServerResponse.setHeader(res, "x-invalidate", JSON.stringify(keys))
  })
)

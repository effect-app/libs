/* eslint-disable @typescript-eslint/no-explicit-any */
import { type Array, Effect } from "effect-app"
import { type HttpHeaders, type HttpRouter } from "effect-app/http"
import { type ContextTagWithDefault } from "../../layerUtils.js"

export interface GenericMiddlewareOptions<A, E> {
  // Effect rpc middleware does not support changing payload or headers, but we do..
  readonly next: Effect.Effect<A, E, HttpRouter.HttpRouter.Provided>
  readonly payload: unknown
  readonly headers: HttpHeaders.Headers
  // readonly clientId: number
  // readonly rpc: Rpc.AnyWithProps
}

export type GenericMiddlewareMaker = <A, E>(
  options: GenericMiddlewareOptions<A, E>
) => Effect.Effect<A, E, HttpRouter.HttpRouter.Provided>

export const genericMiddleware = (i: GenericMiddlewareMaker) => i

export const genericMiddlewareMaker = <
  T extends Array<
    ContextTagWithDefault.Base<GenericMiddlewareMaker>
  >
>(...middlewares: T): {
  dependencies: { [K in keyof T]: T[K]["Default"] }
  effect: Effect.Effect<GenericMiddlewareMaker>
} => {
  return {
    dependencies: middlewares.map((_) => _.Default),
    effect: Effect.gen(function*() {
      const middlewaresInstances = yield* Effect.all(middlewares)

      return <A, E>(
        options: GenericMiddlewareOptions<A, E>
      ) => {
        let next = options.next
        for (const middleware of (middlewaresInstances as any[]).toReversed()) {
          next = middleware({ ...options, next })
        }
        return next
      }
    })
  } as any
}

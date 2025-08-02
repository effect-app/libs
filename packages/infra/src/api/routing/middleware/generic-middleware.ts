/* eslint-disable @typescript-eslint/no-explicit-any */
import { type RpcMiddleware } from "@effect/rpc"
import { type TagClassAny } from "@effect/rpc/RpcMiddleware"
import { type Array, Effect, type Layer } from "effect-app"
import { type HttpHeaders, type HttpRouter } from "effect-app/http"

export interface GenericMiddlewareOptions<A, E> {
  // Effect rpc middleware does not support changing payload or headers, but we do..
  readonly next: Effect.Effect<A, E, HttpRouter.HttpRouter.Provided>
  readonly payload: unknown
  readonly headers: HttpHeaders.Headers
  // readonly clientId: number
  readonly rpc: { _tag: string } // Rpc.AnyWithProps
}

export type GenericMiddlewareMaker = TagClassAny & { Default: Layer.Layer.Any } // todo; and Layer..

export const genericMiddleware = (i: GenericMiddlewareMaker) => i

export const genericMiddlewareMaker = <
  T extends Array<GenericMiddlewareMaker>
>(...middlewares: T): {
  dependencies: { [K in keyof T]: T[K]["Default"] }
  effect: Effect.Effect<RpcMiddleware.RpcMiddlewareWrap<any, any>>
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

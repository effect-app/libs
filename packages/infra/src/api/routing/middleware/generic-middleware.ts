/* eslint-disable @typescript-eslint/no-explicit-any */
import { type Rpc, type RpcMiddleware } from "@effect/rpc"
import { type SuccessValue, type TagClassAny } from "@effect/rpc/RpcMiddleware"
import { type Array, Context, Effect, type Layer } from "effect-app"
import { type HttpHeaders, type HttpRouter } from "effect-app/http"

export interface GenericMiddlewareOptions<E> {
  // Effect rpc middleware does not support changing payload or headers, but we do..
  readonly next: Effect.Effect<SuccessValue, E, HttpRouter.HttpRouter.Provided>
  readonly payload: unknown
  readonly headers: HttpHeaders.Headers
  readonly clientId: number
  readonly rpc: Rpc.AnyWithProps
}

export type GenericMiddlewareMaker = TagClassAny & { Default: Layer.Layer.Any } // todo; and Layer..

export namespace GenericMiddlewareMaker {
  export type Provided<T> = T extends TagClassAny
    ? T extends { provides: Context.Tag<any, any> } ? Context.Tag.Identifier<T["provides"]> : never
    : never
}

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
      const context = yield* Effect.context()
      // const middlewares: readonly (RpcMiddlewareWrap<any, any> | RpcMiddleware.RpcMiddleware<any, any>)[] =
      //   (yield* Effect.all(
      //     middlewares
      //   )) as any

      return <E>(
        options: GenericMiddlewareOptions<E>
      ) => {
        let handler = options.next
        // copied from RpcMiddleare
        for (const tag of middlewares) {
          if (tag.wrap) {
            const middleware = Context.unsafeGet(context, tag)
            handler = middleware({ ...options, next: handler as any })
          } else if (tag.optional) {
            const middleware = Context.unsafeGet(context, tag) as RpcMiddleware.RpcMiddleware<any, any>
            const previous = handler
            handler = Effect.matchEffect(middleware(options), {
              onFailure: () => previous,
              onSuccess: tag.provides !== undefined
                ? (value) => Effect.provideService(previous, tag.provides as any, value)
                : (_) => previous
            })
          } else {
            const middleware = Context.unsafeGet(context, tag) as RpcMiddleware.RpcMiddleware<any, any>
            handler = tag.provides !== undefined
              ? Effect.provideServiceEffect(handler, tag.provides as any, middleware(options))
              : Effect.zipRight(middleware(options), handler)
          }
        }
        // let next = options.next
        // for (const middleware of middlewaresInstances.toReversed()) {
        //   next = middleware({ ...options, next })
        // }
        // return next
      }
    })
  } as any
}

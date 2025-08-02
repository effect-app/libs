/* eslint-disable @typescript-eslint/no-explicit-any */
import { type Rpc, type RpcMiddleware } from "@effect/rpc"
import { type SuccessValue, type TagClassAny } from "@effect/rpc/RpcMiddleware"
import { type Array, Context, Effect, type Layer } from "effect-app"
import { type HttpHeaders, type HttpRouter } from "effect-app/http"
import { InfraLogger } from "../../../logger.js"

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
  // we want to run them in reverse order
  middlewares = middlewares.toReversed() as any
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
            handler = InfraLogger.logDebug("Applying middleware " + tag.key).pipe(
              Effect.zipRight(middleware({ ...options, next: handler as any }))
            ) as any
          } else if (tag.optional) {
            const middleware = Context.unsafeGet(context, tag) as RpcMiddleware.RpcMiddleware<any, any>
            const previous = handler
            handler = InfraLogger.logDebug("Applying middleware " + tag.key).pipe(
              Effect.zipRight(Effect.matchEffect(middleware(options), {
                onFailure: () => previous,
                onSuccess: tag.provides !== undefined
                  ? (value) => Effect.provideService(previous, tag.provides as any, value)
                  : (_) => previous
              }))
            )
          } else {
            const middleware = Context.unsafeGet(context, tag) as RpcMiddleware.RpcMiddleware<any, any>
            handler = InfraLogger.logDebug("Applying middleware " + tag.key).pipe(
              Effect.zipRight(
                tag.provides !== undefined
                  ? Effect.provideServiceEffect(handler, tag.provides as any, middleware(options))
                  : Effect.zipRight(middleware(options), handler)
              )
            )
          }
        }
        return handler
      }
    })
  } as any
}

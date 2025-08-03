/* eslint-disable @typescript-eslint/no-explicit-any */
import { type Rpc, type RpcMiddleware } from "@effect/rpc"
import { type SuccessValue, type TypeId } from "@effect/rpc/RpcMiddleware"
import { type Array, Context, Effect, type Layer, type Schema, type Scope } from "effect-app"
import { type RPCContextMap } from "effect-app/client"
import { type HttpHeaders } from "effect-app/http"
import { InfraLogger } from "../../../logger.js"
import { type TagClassDynamicAny } from "./DynamicMiddleware.js"

// TODO: instead, consider support NonEmptyArray of Tags - so that we keep Identifiers and Services
export interface ContextRepr<A> {
  readonly A: A
}
export const ContextRepr = <A>(): ContextRepr<A> => ({ A: undefined as A })
export type GetContextRepr<A> = A extends ContextRepr<infer B> ? B : never

export interface TagClassAny extends Context.Tag<any, any> {
  readonly [TypeId]: TypeId
  readonly optional: boolean
  readonly provides?: Context.Tag<any, any> | ContextRepr<any> | undefined
  readonly failure: Schema.Schema.All
  readonly requiredForClient: boolean
  readonly wrap: boolean
}

export interface GenericMiddlewareOptions<E> {
  // Effect rpc middleware does not support changing payload or headers, but we do..
  readonly next: Effect.Effect<SuccessValue, E, Scope.Scope>
  readonly payload: unknown
  readonly headers: HttpHeaders.Headers
  readonly clientId: number
  readonly rpc: Rpc.AnyWithProps
}

export type GenericMiddlewareMaker = TagClassAny & { Default: Layer.Layer.Any } // todo; and Layer..
export type DynamicMiddlewareMaker<RequestContext extends Record<string, RPCContextMap.Any>> =
  & TagClassDynamicAny<RequestContext>
  & { Default: Layer.Layer.Any } // todo; and Layer..

export namespace GenericMiddlewareMaker {
  export type Provided<T> = T extends TagClassAny
    ? T extends { provides: Context.Tag<any, any> } ? Context.Tag.Identifier<T["provides"]>
    : T extends { provides: ContextRepr<any> } ? GetContextRepr<T["provides"]>
    : never
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
                  ? (value) =>
                    Context.isContext(value)
                      ? Effect.provide(previous, value)
                      : Effect.provideService(previous, tag.provides as any, value)
                  : (_) => previous
              }))
            )
          } else {
            const middleware = Context.unsafeGet(context, tag) as RpcMiddleware.RpcMiddleware<any, any>
            const previous = handler
            handler = InfraLogger.logDebug("Applying middleware " + tag.key).pipe(
              Effect.zipRight(
                tag.provides !== undefined
                  ? middleware(options).pipe(
                    Effect.flatMap((value) =>
                      Context.isContext(value)
                        ? Effect.provide(previous, value)
                        : Effect.provideService(previous, tag.provides as any, value)
                    )
                  )
                  : Effect.zipRight(middleware(options), previous)
              )
            )
          }
        }
        return handler
      }
    })
  } as any
}

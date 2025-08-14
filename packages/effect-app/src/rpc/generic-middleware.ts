/* eslint-disable @typescript-eslint/no-explicit-any */
import { type RpcMiddleware } from "@effect/rpc"
import { Context, Effect, type Layer, type NonEmptyReadonlyArray, type S } from "effect-app"
import { type GetContextConfig, type RPCContextMap } from "effect-app/client"
import { type Tag } from "effect/Context"
import { type Simplify } from "effect/Types"
import { PreludeLogger } from "../logger.js"
import { type MakeTags, type MiddlewareMakerId } from "./middleware-api.js"
import { type RpcMiddlewareWrap, type TagClassAny } from "./RpcMiddleware.js"

// Effect rpc middleware does not support changing payload or headers, but we do..

export interface MiddlewareMaker<
  RequestContextMap extends Record<string, RPCContextMap.Any>,
  MiddlewareProviders extends ReadonlyArray<MiddlewareMaker.Any>
> extends
  RpcMiddleware.TagClass<
    MiddlewareMakerId,
    "MiddlewareMaker",
    Simplify<
      & { readonly wrap: true }
      & (Exclude<
        MiddlewareMaker.ManyRequired<MiddlewareProviders>,
        MiddlewareMaker.ManyProvided<MiddlewareProviders>
      > extends never ? {} : {
        readonly requires: MakeTags<
          Exclude<
            MiddlewareMaker.ManyRequired<MiddlewareProviders>,
            MiddlewareMaker.ManyProvided<MiddlewareProviders>
          >
        >
      })
      & (MiddlewareMaker.ManyErrors<MiddlewareProviders> extends never ? {}
        : {
          readonly failure: S.Schema<MiddlewareMaker.ManyErrors<MiddlewareProviders>>
        })
      & (MiddlewareMaker.ManyProvided<MiddlewareProviders> extends never ? {}
        : { readonly provides: MakeTags<MiddlewareMaker.ManyProvided<MiddlewareProviders>> })
    >
  >
{
  readonly layer: Layer.Layer<MiddlewareMakerId, never, Tag.Identifier<MiddlewareProviders[number]>>
  readonly requestContext: RequestContextTag<RequestContextMap>
  readonly requestContextMap: RequestContextMap
}

export interface RequestContextTag<RequestContextMap extends Record<string, RPCContextMap.Any>>
  extends Context.Tag<"RequestContextConfig", GetContextConfig<RequestContextMap>>
{}

export namespace MiddlewareMaker {
  export type Any = TagClassAny

  export type ApplyServices<A extends TagClassAny, R> = Exclude<R, Provided<A>> | Required<A>

  export type ApplyManyServices<A extends NonEmptyReadonlyArray<TagClassAny>, R> =
    | Exclude<R, { [K in keyof A]: Provided<A[K]> }[number]>
    | { [K in keyof A]: Required<A[K]> }[number]

  export type ManyProvided<A extends ReadonlyArray<TagClassAny>> = A extends NonEmptyReadonlyArray<TagClassAny>
    ? { [K in keyof A]: Provided<A[K]> }[number]
    : Provided<A[number]>
  export type ManyRequired<A extends ReadonlyArray<TagClassAny>> = A extends NonEmptyReadonlyArray<TagClassAny>
    ? { [K in keyof A]: Required<A[K]> }[number]
    : Required<A[number]>
  export type ManyErrors<A extends ReadonlyArray<TagClassAny>> = A extends NonEmptyReadonlyArray<TagClassAny>
    ? { [K in keyof A]: Errors<A[K]> }[number]
    : Errors<A[number]>

  export type Provided<T> = T extends TagClassAny ? T extends { provides: infer _P } ? _P
    : never
    : never

  export type Errors<T> = T extends TagClassAny ? T extends { failure: S.Schema.Any } ? S.Schema.Type<T["failure"]>
    : never
    : never

  export type Required<T> = T extends TagClassAny ? T extends { requires: infer _R } ? _R
    : never
    : never
}

export const middlewareMaker = <
  MiddlewareProviders extends ReadonlyArray<MiddlewareMaker.Any>
>(middlewares: MiddlewareProviders): Effect.Effect<
  RpcMiddlewareWrap<
    MiddlewareMaker.ManyProvided<MiddlewareProviders>,
    MiddlewareMaker.ManyErrors<MiddlewareProviders>,
    Exclude<
      MiddlewareMaker.ManyRequired<MiddlewareProviders>,
      MiddlewareMaker.ManyProvided<MiddlewareProviders>
    > extends never ? never
      : Exclude<MiddlewareMaker.ManyRequired<MiddlewareProviders>, MiddlewareMaker.ManyProvided<MiddlewareProviders>>
  >
> => {
  // we want to run them in reverse order because latter middlewares will provide context to former ones
  middlewares = middlewares.toReversed() as any

  return Effect.gen(function*() {
    const context = yield* Effect.context()

    // returns a Effect/RpcMiddlewareWrap with Scope in requirements
    return (
      _options: Parameters<
        RpcMiddleware.RpcMiddlewareWrap<
          MiddlewareMaker.ManyProvided<MiddlewareProviders>,
          never
        >
      >[0]
    ) => {
      const { next, ...options } = _options
      // we start with the actual handler
      let handler = next

      // inspired from Effect/RpcMiddleware
      for (const tag of middlewares) {
        // use the tag to get the middleware from context
        const middleware = Context.unsafeGet(context, tag)

        // wrap the current handler, allowing the middleware to run before and after it
        handler = PreludeLogger.logDebug("Applying middleware wrap " + tag.key).pipe(
          Effect.zipRight(middleware(handler, options))
        ) as any
      }
      return handler
    }
  }) as any
}

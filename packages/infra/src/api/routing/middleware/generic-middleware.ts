/* eslint-disable @typescript-eslint/no-explicit-any */
import { type Rpc, type RpcMiddleware } from "@effect/rpc"
import { type SuccessValue } from "@effect/rpc/RpcMiddleware"
import { type Array, Context, Effect, type Layer, type NonEmptyReadonlyArray, Option, type Scope } from "effect-app"
import { type ContextTagArray } from "effect-app/client"
import { type HttpHeaders } from "effect-app/http"
import { InfraLogger } from "../../../logger.js"
import { type TagClassAny } from "./RpcMiddleware.js"

// Effect rpc middleware does not support changing payload or headers, but we do..

// it's like an Effect/rpc wrap middleware, but with fixed R to Scope.Scope
export interface GenericMiddlewareOptions<E> {
  readonly clientId: number
  readonly rpc: Rpc.AnyWithProps
  readonly payload: unknown
  readonly headers: HttpHeaders.Headers
  readonly next: Effect.Effect<SuccessValue, E, Scope.Scope>
}

export type GenericMiddlewareMaker = TagClassAny & { Default: Layer.Layer.Any } // todo; and Layer..

export namespace GenericMiddlewareMaker {
  export type ApplyServices<A extends TagClassAny, R> = Exclude<R, Provided<A>> | Required<A>

  export type ApplyManyServices<A extends NonEmptyReadonlyArray<TagClassAny>, R> =
    | Exclude<R, { [K in keyof A]: Provided<A[K]> }[number]>
    | { [K in keyof A]: Required<A[K]> }[number]

  export type Provided<T> = T extends TagClassAny
    ? T extends { provides: Context.Tag<any, any> } ? Context.Tag.Identifier<T["provides"]>
    : T extends { provides: ContextTagArray } ? ContextTagArray.Identifier<T["provides"]>
    : never
    : never

  export type Required<T> = T extends TagClassAny
    ? T extends { requires: Context.Tag<any, any> } ? Context.Tag.Identifier<T["requires"]>
    : T extends { requires: ContextTagArray } ? ContextTagArray.Identifier<T["requires"]>
    : never
    : never
}

export const genericMiddlewareMaker = <
  T extends Array<GenericMiddlewareMaker>
>(...middlewares: T): {
  dependencies: { [K in keyof T]: T[K]["Default"] }
  effect: Effect.Effect<RpcMiddleware.RpcMiddlewareWrap<any, any>>
} => {
  // we want to run them in reverse order because latter middlewares will provide context to former ones
  middlewares = middlewares.toReversed() as any

  return {
    dependencies: middlewares.map((_) => _.Default),
    effect: Effect.gen(function*() {
      const context = yield* Effect.context()

      // returns a Effect/RpcMiddlewareWrap with Scope in requirements
      return <E>(
        options: GenericMiddlewareOptions<E>
      ) => {
        // we start with the actual handler
        let handler = options.next

        // inspired from Effect/RpcMiddleware
        for (const tag of middlewares) {
          if (tag.wrap) {
            // use the tag to get the middleware from context
            const middleware = Context.unsafeGet(context, tag)

            // wrap the current handler, allowing the middleware to run before and after it
            handler = InfraLogger.logDebug("Applying middleware wrap " + tag.key).pipe(
              Effect.zipRight(middleware({ ...options, next: handler }))
            ) as any
          } else if (tag.optional) {
            // use the tag to get the middleware from context
            // if the middleware fails to run, we will ignore the error
            const middleware = Context.unsafeGet(context, tag) as RpcMiddleware.RpcMiddleware<any, any>

            const previous = handler

            // set the previous handler to run after the middleware
            // if the middleware is not present, we just return the previous handler
            // otherwise the middleware will provide some context to be provided to the previous handler
            handler = InfraLogger.logDebug("Applying middleware optional " + tag.key).pipe(
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
          } else if (tag.dynamic) {
            // use the tag to get the middleware from context
            const middleware = Context.unsafeGet(context, tag) as RpcMiddleware.RpcMiddleware<any, any>

            const previous = handler

            // set the previous handler to run after the middleware
            // we do expect the middleware to be present, but the context might not be available
            // if it is, we provide it to the previous handler
            handler = InfraLogger.logDebug("Applying middleware dynamic " + tag.key, tag.dynamic).pipe(
              Effect.zipRight(
                middleware(options).pipe(
                  Effect.flatMap((o) =>
                    Option.isSome(o)
                      ? Context.isContext(o.value)
                        ? Effect.provide(previous, o.value)
                        : Effect.provideService(previous, tag.dynamic!.settings.service!, /* TODO */ o.value)
                      : previous
                  )
                )
              )
            )
          } else {
            // use the tag to get the middleware from context
            const middleware = Context.unsafeGet(context, tag) as RpcMiddleware.RpcMiddleware<any, any>

            const previous = handler

            // set the previous handler to run after the middleware
            // we do expect both the middleware and the context to be present
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

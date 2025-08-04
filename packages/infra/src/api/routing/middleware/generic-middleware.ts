/* eslint-disable @typescript-eslint/no-explicit-any */
import { type Rpc, type RpcMiddleware } from "@effect/rpc"
import { type SuccessValue, type TypeId } from "@effect/rpc/RpcMiddleware"
import { type Array, Context, Effect, type Layer, type NonEmptyReadonlyArray, Option, type Schema, type Scope } from "effect-app"
import { type ContextRepr, type RPCContextMap } from "effect-app/client"
import { type HttpHeaders } from "effect-app/http"
import { InfraLogger } from "../../../logger.js"
import { type RpcDynamic } from "./DynamicMiddleware.js"

export interface TagClassAny extends Context.Tag<any, any> {
  readonly [TypeId]: TypeId
  readonly optional: boolean
  readonly provides?: Context.Tag<any, any> | ContextRepr | undefined
  readonly requires?: Context.Tag<any, any> | ContextRepr | undefined
  readonly failure: Schema.Schema.All
  readonly requiredForClient: boolean
  readonly wrap: boolean
  readonly dynamic?: RpcDynamic<any, any> | undefined
  readonly dependsOn?: any
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

export type IsDynamicMiddleware<T, RequestContext extends Record<string, RPCContextMap.Any>> = T extends
  { dynamic: RpcDynamic<any, RequestContext[keyof RequestContext]> } ? true
  : false

export namespace GenericMiddlewareMaker {
  export type ApplyServices<A extends TagClassAny, R> = Exclude<R, Provided<A>> | Required<A>
  export type ApplyManyServices<A extends NonEmptyReadonlyArray<TagClassAny>, R> =
    | Exclude<R, { [K in keyof A]: Provided<A[K]> }[number]>
    | { [K in keyof A]: Required<A[K]> }[number]
  export type Provided<T> = T extends TagClassAny
    ? T extends { provides: Context.Tag<any, any> } ? Context.Tag.Identifier<T["provides"]>
    : T extends { provides: ContextRepr } ? ContextRepr.Identifier<T["provides"]>
    : never
    : never

  export type Required<T> = T extends TagClassAny
    ? T extends { requires: Context.Tag<any, any> } ? Context.Tag.Identifier<T["requires"]>
    : T extends { requires: ContextRepr } ? ContextRepr.Identifier<T["requires"]>
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

      // TODO: tree sort dynamic middlewares?
      // or should we just handle it on the type level?

      return <E>(
        options: GenericMiddlewareOptions<E>
      ) => {
        let handler = options.next
        // copied from RpcMiddleare
        for (const tag of middlewares) {
          if (tag.wrap) {
            const middleware = Context.unsafeGet(context, tag)
            handler = InfraLogger.logDebug("Applying middleware wrap " + tag.key).pipe(
              Effect.zipRight(middleware({ ...options, next: handler as any }))
            ) as any
          } else if (tag.optional) {
            const middleware = Context.unsafeGet(context, tag) as RpcMiddleware.RpcMiddleware<any, any>
            const previous = handler
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
            const middleware = Context.unsafeGet(context, tag) as RpcMiddleware.RpcMiddleware<any, any>
            const previous = handler
            handler = InfraLogger.logDebug("Applying middleware dynamic " + tag.key, tag.dynamic).pipe(
              Effect.zipRight(
                middleware(options).pipe(
                  Effect.flatMap((value) =>
                    Option.isSome(value)
                      ? Context.isContext(value.value)
                        ? Effect.provide(previous, value.value)
                        : Effect.provideService(previous, tag.dynamic!.settings.service!, /* TODO */ value.value)
                      : previous
                  )
                )
              )
            )
            // const moreContext = Context.isContext(ctx) ? Option.some(ctx) : ctx
            // yield* InfraLogger.logDebug(
            //   "Built dynamic context for middleware" + (mw.maker.key ?? mw.maker),
            //   Option.map(moreContext, (c) => (c as any).toJSON().services)
            // )
            // if (moreContext.value) {
            //   context = Context.merge(context, moreContext.value)
            // }
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

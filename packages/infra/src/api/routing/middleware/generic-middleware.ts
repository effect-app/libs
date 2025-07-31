/* eslint-disable @typescript-eslint/no-explicit-any */
import { type Array, type Context, Effect, type Layer } from "effect-app"
import { type HttpHeaders, type HttpRouter } from "effect-app/http"

export type ContextTagWithDefault<Id, Tag, A, LayerE, LayerR> = Context.Tag<Id, { _tag: Tag } & A> & {
  Default: Layer.Layer<Id, LayerE, LayerR>
}

export namespace ContextTagWithDefault {
  export type Base<A> = ContextTagWithDefault<any, any, A, any, any>
}

type ContextMakerA = <A, E>(
  handle: (input: any, headers: HttpHeaders.Headers) => Effect.Effect<A, E, HttpRouter.HttpRouter.Provided>,
  moduleName: string
) => (input: any, headers: HttpHeaders.Headers) => Effect.Effect<A, E, HttpRouter.HttpRouter.Provided>

export const genericMiddlewareMaker = <
  T extends Array<
    ContextTagWithDefault.Base<ContextMakerA>
  >
>(...middlewares: T): {
  dependencies: { [K in keyof T]: T[K]["Default"] }
  effect: Effect.Effect<ContextMakerA>
} => {
  return {
    dependencies: middlewares.map((_) => _.Default),
    effect: Effect.gen(function*() {
      const middlewaresInstances = yield* Effect.all(middlewares)

      return <A, E, R>(
        handle: (input: any, headers: HttpHeaders.Headers) => Effect.Effect<A, E, R>,
        moduleName: string
      ) => {
        return (input: any, headers: HttpHeaders.Headers) => {
          let effect = handle
          for (const middleware of (middlewaresInstances as any[]).toReversed()) {
            effect = middleware(effect, moduleName)
          }
          return effect(input, headers)
        }
      }
    })
  } as any
}

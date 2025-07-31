/* eslint-disable @typescript-eslint/no-explicit-any */
import { type Array, Effect } from "effect-app"
import { type HttpHeaders, type HttpRouter } from "effect-app/http"
import { type ContextTagWithDefault } from "../../layerUtils.js"

export type GenericMiddlewareMaker = <A, E>(
  handle: (input: any, headers: HttpHeaders.Headers) => Effect.Effect<A, E, HttpRouter.HttpRouter.Provided>,
  moduleName: string
) => (input: any, headers: HttpHeaders.Headers) => Effect.Effect<A, E, HttpRouter.HttpRouter.Provided>

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

import { type Array, type Context, Effect, type Layer } from "effect-app"
import { type HttpHeaders, type HttpRouter } from "effect-app/http"

export const genericMiddlewareMaker = <
  T extends Array<
    Context.Tag<
      any,
      & { _tag: any }
      & (<A, E>(
        handle: (input: any, headers: HttpHeaders.Headers) => Effect.Effect<A, E, HttpRouter.HttpRouter.Provided>,
        moduleName: string
      ) => (input: any, headers: HttpHeaders.Headers) => Effect.Effect<A, E, HttpRouter.HttpRouter.Provided>)
    > & { Default: Layer.Layer<any, any, any> }
  >
>(...middlewares: T): {
  dependencies: { [K in keyof T]: T[K]["Default"] }
  effect: Effect.Effect<
    (<A, E>(
      handle: (input: any, headers: HttpHeaders.Headers) => Effect.Effect<A, E, HttpRouter.HttpRouter.Provided>,
      moduleName: string
    ) => (input: any, headers: HttpHeaders.Headers) => Effect.Effect<A, E, HttpRouter.HttpRouter.Provided>)
  >
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
        // (middlewaresInstances as any[]).reduceRight(
        //   (prev, cur) => cur(prev, moduleName)(input, headers),
        //   handle(input, headers)
        // )
      }
    })
  } as any
}

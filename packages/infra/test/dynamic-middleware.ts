/* eslint-disable @typescript-eslint/no-explicit-any */
import { Context, Effect, type Layer, type Option, type S } from "effect-app"
import { type GetEffectContext, type RPCContextMap } from "effect-app/client"
import { type Tag } from "effect-app/Context"
import { typedValuesOf } from "effect-app/utils"
import { type RequestContextMap } from "./controller.test.js"
import { sort } from "./tsort.js"

export type ContextWithLayer<
  Config,
  Id,
  Service,
  E,
  R,
  MakeE,
  MakeR,
  Tag extends string,
  Args extends [config: Config, headers: Record<string, string>],
  Dependencies extends any[]
> =
  & Context.Tag<
    Id,
    { handle: (...args: Args) => Effect<Option<Context<Service>>, E, R>; _tag: Tag }
  >
  & {
    Default: Layer.Layer<Id, MakeE, MakeR>
    dependsOn?: Dependencies
  }

export type AnyContextWithLayer<Config, Service, Error> =
  | ContextWithLayer<
    Config,
    any,
    Service,
    Error,
    any,
    any,
    any,
    string,
    any,
    any
  >
  | ContextWithLayer<
    Config,
    any,
    Service,
    Error,
    never,
    any,
    never,
    any,
    any,
    any
  >
  | ContextWithLayer<
    Config,
    any,
    Service,
    Error,
    any,
    any,
    never,
    any,
    any,
    any
  >
  | ContextWithLayer<
    Config,
    any,
    Service,
    Error,
    never,
    any,
    any,
    any,
    any,
    any
  >

export const implementMiddleware = <T extends Record<string, RPCContextMap.Any>>() =>
<
  TI extends {
    [K in keyof T]: AnyContextWithLayer<
      { [K in keyof T]?: T[K]["contextActivation"] },
      T[K]["service"],
      S.Schema.Type<T[K]["error"]>
    >
  }
>(implementations: TI) => ({
  dependencies: typedValuesOf(implementations).map((_) => _.Default) as {
    [K in keyof TI]: TI[K]["Default"]
  }[keyof TI][],
  effect: Effect.gen(function*() {
    return Effect.fn(
      function*(config: { [K in keyof T]?: T[K]["contextActivation"] }, headers: Record<string, string>) {
        let context = Context.empty()
        const sorted = sort(typedValuesOf(implementations))
        for (const mw of sorted) {
          const middleware = yield* mw
          const moreContext = yield* middleware.handle(config, headers).pipe(Effect.provide(context))
          if (moreContext.value) {
            context = Context.merge(context, moreContext.value)
          }
        }
        return context as Context.Context<GetEffectContext<RequestContextMap, typeof config>>
      }
    ) as (
      config: { [K in keyof T]?: T[K]["contextActivation"] },
      headers: Record<string, string>
    ) => Effect.Effect<
      Context.Context<GetEffectContext<RequestContextMap, typeof config>>,
      Effect.Error<ReturnType<Tag.Service<TI[keyof TI]>["handle"]>>,
      Effect.Context<ReturnType<Tag.Service<TI[keyof TI]>["handle"]>>
    >
  })
})

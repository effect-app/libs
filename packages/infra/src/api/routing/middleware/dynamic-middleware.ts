/* eslint-disable @typescript-eslint/no-explicit-any */
import { Array, type Context, Effect, type Option, type S } from "effect-app"
import { type GetEffectContext, type RPCContextMap } from "effect-app/client"
import { type Tag } from "effect-app/Context"
import { typedValuesOf } from "effect-app/utils"
import { type ContextTagWithDefault, mergeOptionContexts } from "../../layerUtils.js"
import { sort } from "../tsort.js"

export type ContextWithLayer<
  Config,
  Service,
  Error,
  Dependencies,
  Id,
  LayerE,
  LayerR
> =
  & (
    | ContextTagWithDefault<
      Id,
      {
        _tag: any
        handle: (
          config: Config,
          headers: Record<string, string>
        ) => Effect<Option<Context<Service>>, Error, any>
      },
      LayerE,
      LayerR
    >
    | ContextTagWithDefault<
      Id,
      {
        _tag: any
        handle: (
          config: Config,
          headers: Record<string, string>
        ) => Effect<Option<Context<Service>>, Error, never>
      },
      LayerE,
      LayerR
    >
  )
  & {
    dependsOn?: Dependencies
  }

export namespace ContextWithLayer {
  export type Base<Config, Service, Error> = ContextWithLayer<
    Config,
    Service,
    Error,
    any,
    any,
    any,
    any
  >
}

// Effect Rpc Middleware: no substitute atm. though maybe something could be achieved with Wrap, we just don't have type safety on the Request input etc.
export const implementMiddleware = <T extends Record<string, RPCContextMap.Any>>() =>
<
  TI extends {
    [K in keyof T]: ContextWithLayer.Base<
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
    const sorted = sort(typedValuesOf(implementations))

    const makers = yield* Effect.all(sorted)
    return Effect.fnUntraced(
      function*(config: { [K in keyof T]?: T[K]["contextActivation"] }, headers: Record<string, string>) {
        const ctx = yield* mergeOptionContexts(
          Array.map(
            makers,
            (_, i) => ({ maker: sorted[i], handle: (_ as any).handle(config, headers) as any }) as any
          )
        )
        return ctx as Context.Context<
          GetEffectContext<T, typeof config>
        >
      }
    )
  }) as unknown as Effect<
    (
      config: { [K in keyof T]?: T[K]["contextActivation"] },
      headers: Record<string, string>
    ) => Effect.Effect<
      Context.Context<GetEffectContext<T, typeof config>>,
      Effect.Error<ReturnType<Tag.Service<TI[keyof TI]>["handle"]>>,
      Effect.Context<ReturnType<Tag.Service<TI[keyof TI]>["handle"]>>
    >,
    never,
    Tag.Identifier<{ [K in keyof TI]: TI[K] }[keyof TI]>
  >
})

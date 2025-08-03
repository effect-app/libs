/* eslint-disable @typescript-eslint/no-explicit-any */
import { Array, type Context, Effect, type S } from "effect-app"
import { type GetEffectContext, type RPCContextMap } from "effect-app/client"
import { type Tag } from "effect-app/Context"
import { type HttpHeaders } from "effect-app/http"
import { typedValuesOf } from "effect-app/utils"
import { type ContextTagWithDefault, mergeOptionContexts } from "../../layerUtils.js"
import { sort } from "../tsort.js"
import { type RpcMiddlewareDynamic } from "./DynamicMiddleware.js"

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
      // todo
      RpcMiddlewareDynamic<Service, Error, any, Config>,
      LayerE,
      LayerR
    >
    | ContextTagWithDefault<
      Id,
      // todo
      RpcMiddlewareDynamic<Service, Error, never, Config>,
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
      function*(options: { config: { [K in keyof T]?: T[K]["contextActivation"] }; headers: HttpHeaders.Headers }) {
        const ctx = yield* mergeOptionContexts(
          Array.map(
            makers,
            (_, i) => ({ maker: sorted[i], handle: (_ as any)(options) as any }) as any
          )
        )
        return ctx as Context.Context<
          GetEffectContext<T, typeof options["config"]>
        >
      }
    )
  }) as unknown as Effect<
    (
      options: { config: { [K in keyof T]?: T[K]["contextActivation"] }; headers: HttpHeaders.Headers }
    ) => Effect.Effect<
      Context.Context<GetEffectContext<T, typeof options["config"]>>,
      Effect.Error<ReturnType<Tag.Service<TI[keyof TI]>>>,
      Effect.Context<ReturnType<Tag.Service<TI[keyof TI]>>>
    >,
    never,
    Tag.Identifier<{ [K in keyof TI]: TI[K] }[keyof TI]>
  >
})

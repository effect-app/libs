/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Array, Layer, Request, S } from "effect-app"
import { Effect } from "effect-app"
import type { RPCContextMap } from "effect-app/client/req"
import type * as EffectRequest from "effect/Request"

export interface Middleware<
  Context,
  CTXMap extends Record<string, RPCContextMap.Any>,
  R,
  Layers extends Array<Layer.Layer.Any>
> {
  dependencies?: Layers
  contextMap: CTXMap
  context: Context
  execute: Effect<
    <
      T extends {
        config?: { [K in keyof CTXMap]?: any }
      },
      Req extends S.TaggedRequest.All,
      R
    >(
      schema: T & S.Schema<Req, any, never>,
      handler: (
        request: Req,
        headers: any
      ) => Effect.Effect<EffectRequest.Request.Success<Req>, EffectRequest.Request.Error<Req>, R>,
      moduleName?: string
    ) => (
      req: Req,
      headers: any
    ) => Effect.Effect<
      Request.Request.Success<Req>,
      Request.Request.Error<Req>,
      any // smd
    >,
    never,
    R
  >
}

export const makeRpc = <
  Context,
  CTXMap extends Record<string, RPCContextMap.Any>,
  R,
  Layers extends Array<Layer.Layer.Any>
>(
  middleware: Middleware<Context, CTXMap, R, Layers>
) =>
  middleware.execute.pipe(Effect.map((execute) => ({
    effect: <T extends { config?: { [K in keyof CTXMap]?: any } }, Req extends S.TaggedRequest.All, R>(
      schema: T & S.Schema<Req, any, never>,
      handler: (
        request: Req,
        headers: any
      ) => Effect.Effect<
        EffectRequest.Request.Success<Req>,
        EffectRequest.Request.Error<Req>,
        R
      >,
      moduleName?: string
    ) => {
      return execute(schema, handler, moduleName)
    }
  })))

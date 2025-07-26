/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { type Array, Effect, type Layer, type Request, type S } from "effect-app"
import type { RPCContextMap } from "effect-app/client/req"

import type * as EffectRequest from "effect/Request"

export type RPCHandlerFactory<CTXMap extends Record<string, RPCContextMap.Any>> = <
  T extends {
    config?: Partial<Record<keyof CTXMap, any>>
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
>

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
    RPCHandlerFactory<CTXMap>,
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
    effect: <T extends { config?: Partial<Record<keyof CTXMap, any>> }, Req extends S.TaggedRequest.All, R>(
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
      const h = execute(schema, handler, moduleName)
      return (req: Req, headers: any) =>
        h(req, headers).pipe(
          Effect.uninterruptible // TODO: make this depend on query/command, and consider if middleware also should be affected or not.
        )
    }
  })))

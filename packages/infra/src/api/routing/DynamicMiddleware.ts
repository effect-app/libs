/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { type Array, type Context, Effect, type Layer, type Request, type S } from "effect-app"
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

export type ContextProviderOut<RRet> = Effect<Context.Context<RRet>> & { _tag: "ContextMaker" }

export interface Middleware<
  MiddlewareContext,
  CTXMap extends Record<string, RPCContextMap.Any>,
  R,
  Layers extends Array<Layer.Layer.Any>,
  CtxId,
  RRet,
  RErr,
  RCtx
> {
  dependencies?: Layers
  contextMap: CTXMap
  context: MiddlewareContext
  contextProvider: Context.Tag<CtxId, ContextProviderOut<RRet>> & {
    Default: Layer.Layer<CtxId, RErr, RCtx>
  }
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
  Layers extends Array<Layer.Layer.Any>,
  CtxId,
  RRet,
  RErr,
  RCtx
>(
  middleware: Middleware<Context, CTXMap, R, Layers, CtxId, RRet, RErr, RCtx>
) =>
  Effect
    .all({
      execute: middleware.execute,
      contextProvider: middleware.contextProvider
    })
    .pipe(Effect.map(({ contextProvider, execute }) => ({
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
          Effect.gen(function*() {
            const ctx = yield* contextProvider
            return yield* h(req, headers).pipe(
              Effect.provide(ctx),
              Effect.uninterruptible // TODO: make this depend on query/command, and consider if middleware also should be affected or not.
            )
          })
      }
    })))

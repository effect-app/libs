/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { type Array, type Context, Effect, type Layer, type Request, type S, type Scope } from "effect-app"
import type { GetEffectContext, RPCContextMap } from "effect-app/client/req"

import type * as EffectRequest from "effect/Request"

export type RPCHandlerFactory<CTXMap extends Record<string, RPCContextMap.Any>, MiddlewareContext> = <
  T extends {
    config?: Partial<Record<keyof CTXMap, any>>
  },
  Req extends S.TaggedRequest.All,
  HandlerR
>(
  schema: T & S.Schema<Req, any, never>,
  handler: (
    request: Req,
    headers: any
  ) => Effect.Effect<EffectRequest.Request.Success<Req>, EffectRequest.Request.Error<Req>, HandlerR>,
  moduleName?: string
) => (
  req: Req,
  headers: any
) => Effect.Effect<
  Request.Request.Success<Req>,
  Request.Request.Error<Req>,
  | MiddlewareContext
  | Exclude<HandlerR, GetEffectContext<CTXMap, T["config"]> // the middleware may remove something from HandlerR (e.g. the dynamic context), but may also add something (e.g. MiddlewareContext)
  >
>

export type ContextProviderShape<RRet> = Effect<Context.Context<RRet>, never, Scope>

export interface Middleware<
  MiddlewareContext, // added to what the handler already requires
  CTXMap extends Record<string, RPCContextMap.Any>, // dynamic services provided to the handler
  R, // to execute the middleware itself
  Layers extends Array<Layer.Layer.Any>, // guess that was the old way to provide dependencies (?)
  // additional context built just once and provided to the handler at each request
  CtxId,
  CtxTag extends string,
  RRet,
  RErr,
  RCtx
> {
  contextMap: CTXMap
  dependencies?: Layers
  context: MiddlewareContext
  contextProvider: Context.Tag<CtxId, CtxId & ContextProviderShape<RRet> & { _tag: CtxTag }> & {
    Default: Layer.Layer<CtxId, RErr, RCtx>
  }
  execute: Effect<
    RPCHandlerFactory<CTXMap, MiddlewareContext>,
    never,
    R
  >
}

// identity factory for Middleware
export const makeMiddleware =
  // <
  //   CTXMap extends Record<string, RPCContextMap.Any>,
  //   MiddlewareContext,
  //   MiddlewareR,
  //   Layers extends NonEmptyReadonlyArray<Layer.Layer.Any> | never[],
  //   CtxId,
  //   CtxTag extends string,
  //   RRet,
  //   RErr,
  //   RCtx
  // >
  <M extends Middleware<any, any, any, any, any, any, any, any, any>>(
    content: M
  ): M => content

export const makeRpc = <
  MiddlewareContext,
  CTXMap extends Record<string, RPCContextMap.Any>,
  R,
  Layers extends Array<Layer.Layer.Any>,
  CtxId,
  CtxTag extends string,
  RRet,
  RErr,
  RCtx
>(
  middleware: Middleware<MiddlewareContext, CTXMap, R, Layers, CtxId, CtxTag, RRet, RErr, RCtx>
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

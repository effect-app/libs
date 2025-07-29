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
  ) => Effect.Effect<
    EffectRequest.Request.Success<Req>,
    EffectRequest.Request.Error<Req>,
    HandlerR
  >,
  moduleName?: string
) => (
  req: Req,
  headers: any
) => Effect.Effect<
  Request.Request.Success<Req>,
  Request.Request.Error<Req>,
  // the middleware will remove from HandlerR the dynamic context, but will also add the MiddlewareContext
  | MiddlewareContext
  // & S.Schema<Req, any, never> is useless here but useful when creating the middleware
  | Exclude<HandlerR, GetEffectContext<CTXMap, (T & S.Schema<Req, any, never>)["config"]>>
>

function makeRpcHandler<CTXMap extends Record<string, RPCContextMap.Any>, MiddlewareContext>() {
  return (cb: RPCHandlerFactory<CTXMap, MiddlewareContext>) => cb
}

export type ContextProviderShape<RRet> = Effect<Context.Context<RRet>, never, Scope>

export interface Middleware<
  MiddlewareContext, // added to what the handler already requires
  CTXMap extends Record<string, RPCContextMap.Any>, // dynamic services provided to the handler
  MiddlewareR, // to execute the middleware itself
  Layers extends Array<Layer.Layer.Any>, // guess that was the old way to provide dependencies (?)
  //
  // additional context built just once and provided to the handler at each request
  CtxId, // it is the context provider itself
  CtxTag extends string, // tag for the context provider
  RRet, // what the context provider provides
  RErr, // what the context provider can fail with
  RCtx // needed for building the context provider
> {
  contextMap?: CTXMap
  dependencies?: Layers
  context?: MiddlewareContext
  contextProvider: Context.Tag<CtxId, CtxId & ContextProviderShape<RRet> & { _tag: CtxTag }> & {
    Default: Layer.Layer<CtxId, RErr, RCtx>
  }
  execute?: Effect<
    RPCHandlerFactory<CTXMap, MiddlewareContext>,
    never,
    MiddlewareR
  >
  // better DX because types are contextually provided
  executeContextual?: (
    maker: (cb: RPCHandlerFactory<CTXMap, MiddlewareContext>) => RPCHandlerFactory<CTXMap, MiddlewareContext>
  ) => Effect<
    RPCHandlerFactory<CTXMap, MiddlewareContext>,
    never,
    MiddlewareR
  >
}

// identity factory for Middleware
export const makeMiddlewareContextual =
  // by setting MiddlewareContext and CTXMap beforehand, executeContextual contextual typing does not fuck up itself to anys
  <CTXMap extends Record<string, RPCContextMap.Any>, MiddlewareContext>() =>
  <M extends Middleware<MiddlewareContext, CTXMap, any, any, any, any, any, any, any>>(
    content: M
  ): M => content

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

// it just provides the right types without cluttering the implementation with them
function makeRpcEffect<CTXMap extends Record<string, RPCContextMap.Any>, MiddlewareContext, RRet>() {
  return (
    cb: <
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
      ) => Effect.Effect<
        EffectRequest.Request.Success<Req>,
        EffectRequest.Request.Error<Req>,
        HandlerR
      >,
      moduleName?: string
    ) => (
      req: Req,
      headers: any
    ) => Effect.Effect<
      Request.Request.Success<Req>,
      Request.Request.Error<Req>,
      | Scope.Scope // the context provider may require a Scope to run
      | Exclude<MiddlewareContext, RRet> // for sure RRet is provided, so it can be removed from the MiddlewareContext
      | Exclude<Exclude<HandlerR, GetEffectContext<CTXMap, (T & S.Schema<Req, any, never>)["config"]>>, RRet> // it can also be removed from HandlerR
    >
  ) => cb
}

export const makeRpc = <
  MiddlewareContext,
  CTXMap extends Record<string, RPCContextMap.Any>,
  MiddlewareR,
  Layers extends Array<Layer.Layer.Any>,
  CtxId,
  CtxTag extends string,
  RRet,
  RErr,
  RCtx
>(
  middleware: Middleware<MiddlewareContext, CTXMap, MiddlewareR, Layers, CtxId, CtxTag, RRet, RErr, RCtx>
) =>
  Effect
    .all({
      execute: middleware.execute ?? Effect.void,
      executeContextual: middleware.executeContextual
        ? middleware.executeContextual(makeRpcHandler<CTXMap, MiddlewareContext>())
        : Effect.void,
      contextProvider: middleware.contextProvider // uses the middleware.contextProvider tag to get the context provider service
    })
    .pipe(Effect.map(({ contextProvider, execute, executeContextual }) => ({
      effect: makeRpcEffect<CTXMap, MiddlewareContext, RRet>()((schema, handler, moduleName) => {
        if (!execute && !executeContextual) {
          throw new Error("No execute or executeContextual provided in middleware")
        }
        const h = (executeContextual! ?? execute!)(schema, handler, moduleName)
        return (req, headers) =>
          // the contextProvider is an Effect that builds the context for the request
          contextProvider.pipe(
            Effect.flatMap((ctx) =>
              h(req, headers)
                .pipe(
                  Effect.provide(ctx),
                  // TODO: make this depend on query/command, and consider if middleware also should be affected or not.
                  Effect.uninterruptible
                )
            )
          )
      })
    })))

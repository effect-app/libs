/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { type Array, type Context, Effect, type Layer, type Request, type S, type Scope } from "effect-app"
import type { GetEffectContext, RPCContextMap } from "effect-app/client/req"

import type * as EffectRequest from "effect/Request"

export type RPCHandlerFactory<RequestContextMap extends Record<string, RPCContextMap.Any>, MiddlewareR> = <
  T extends {
    config?: Partial<Record<keyof RequestContextMap, any>>
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
  // the middleware will remove from HandlerR the dynamic context, but will also add the MiddlewareR
  | MiddlewareR
  // & S.Schema<Req, any, never> is useless here but useful when creating the middleware
  | Exclude<HandlerR, GetEffectContext<RequestContextMap, (T & S.Schema<Req, any, never>)["config"]>>
>

function makeRpcHandler<RequestContextMap extends Record<string, RPCContextMap.Any>, MiddlewareR>() {
  return (cb: RPCHandlerFactory<RequestContextMap, MiddlewareR>) => cb
}

export type ContextProviderShape<ContextProviderA> = Effect<Context.Context<ContextProviderA>, never, Scope>

export interface Middleware<
  MiddlewareR, // what the middlware requires to execute
  RequestContextMap extends Record<string, RPCContextMap.Any>, // what services will the middlware provide dynamically to the handler, or raise errors.
  MakeMiddlewareR, // what the middlware requires to be constructed
  MiddlewareDependencies extends Array<Layer.Layer.Any>, // layers provided for the middlware to be constructed
  //
  // ContextProvider is a service that builds additional context for each request.
  ContextProviderId, // it is the context provider itself
  ContextProviderKey extends string, // tag for the context provider
  ContextProviderA, // what the context provider provides
  MakeContextProviderE, // what the context provider construction can fail with
  MakeContextProviderR // what the context provider construction requires
> {
  contextMap?: RequestContextMap
  dependencies?: MiddlewareDependencies
  context?: MiddlewareR
  contextProvider:
    & Context.Tag<
      ContextProviderId,
      ContextProviderId & ContextProviderShape<ContextProviderA> & { _tag: ContextProviderKey }
    >
    & {
      Default: Layer.Layer<ContextProviderId, MakeContextProviderE, MakeContextProviderR>
    }
  execute?: Effect<
    RPCHandlerFactory<RequestContextMap, MiddlewareR>,
    never,
    MakeMiddlewareR
  >
  // better DX because types are contextually provided
  executeContextual?: (
    maker: (cb: RPCHandlerFactory<RequestContextMap, MiddlewareR>) => RPCHandlerFactory<RequestContextMap, MiddlewareR>
  ) => Effect<
    RPCHandlerFactory<RequestContextMap, MiddlewareR>,
    never,
    MakeMiddlewareR
  >
}

// identity factory for Middleware
export const makeMiddlewareContextual =
  // by setting MiddlewareR and RequestContextMap beforehand, executeContextual contextual typing does not fuck up itself to anys
  <RequestContextMap extends Record<string, RPCContextMap.Any>, MiddlewareR>() =>
  <M extends Middleware<MiddlewareR, RequestContextMap, any, any, any, any, any, any, any>>(
    content: M
  ): M => content

// identity factory for Middleware
export const makeMiddleware =
  // <
  //   RequestContextMap extends Record<string, RPCContextMap.Any>,
  //   MiddlewareR,
  //   MakeMiddlewareR,
  //   MiddlewareDependencies extends NonEmptyReadonlyArray<Layer.Layer.Any> | never[],
  //   ContextProviderId,
  //   ContextProviderKey extends string,
  //   ContextProviderA,
  //   MakeContextProviderE,
  //   MakeContextProviderR
  // >
  <M extends Middleware<any, any, any, any, any, any, any, any, any>>(
    content: M
  ): M => content

// it just provides the right types without cluttering the implementation with them
function makeRpcEffect<RequestContextMap extends Record<string, RPCContextMap.Any>, MiddlewareR, ContextProviderA>() {
  return (
    cb: <
      T extends {
        config?: Partial<Record<keyof RequestContextMap, any>>
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
      | Exclude<MiddlewareR, ContextProviderA> // for sure ContextProviderA is provided, so it can be removed from the MiddlewareR
      | Exclude<
        Exclude<HandlerR, GetEffectContext<RequestContextMap, (T & S.Schema<Req, any, never>)["config"]>>,
        ContextProviderA
      > // it can also be removed from HandlerR
    >
  ) => cb
}

export const makeRpc = <
  MiddlewareR,
  RequestContextMap extends Record<string, RPCContextMap.Any>,
  MakeMiddlewareR,
  MiddlewareDependencies extends Array<Layer.Layer.Any>,
  ContextProviderId,
  ContextProviderKey extends string,
  ContextProviderA,
  MakeContextProviderE,
  MakeContextProviderR
>(
  middleware: Middleware<
    MiddlewareR,
    RequestContextMap,
    MakeMiddlewareR,
    MiddlewareDependencies,
    ContextProviderId,
    ContextProviderKey,
    ContextProviderA,
    MakeContextProviderE,
    MakeContextProviderR
  >
) =>
  Effect
    .all({
      execute: middleware.execute ?? Effect.void,
      executeContextual: middleware.executeContextual
        ? middleware.executeContextual(makeRpcHandler<RequestContextMap, MiddlewareR>())
        : Effect.void,
      contextProvider: middleware.contextProvider // uses the middleware.contextProvider tag to get the context provider service
    })
    .pipe(Effect.map(({ contextProvider, execute, executeContextual }) => ({
      effect: makeRpcEffect<RequestContextMap, MiddlewareR, ContextProviderA>()((schema, handler, moduleName) => {
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

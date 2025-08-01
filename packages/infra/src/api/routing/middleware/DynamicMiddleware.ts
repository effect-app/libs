/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { Context, Effect, Layer, type NonEmptyArray, type Request, type S, type Scope } from "effect-app"
import type { GetEffectContext, RPCContextMap } from "effect-app/client/req"
import { HttpHeaders, type HttpRouter, HttpServerRequest } from "effect-app/http"
import type * as EffectRequest from "effect/Request"
import { type ContextTagWithDefault, type LayerUtils } from "../../layerUtils.js"
import { type ContextProviderId, type ContextProviderShape } from "./ContextProvider.js"
import { type ContextWithLayer, implementMiddleware } from "./dynamic-middleware.js"
import { type GenericMiddlewareMaker, genericMiddlewareMaker } from "./generic-middleware.js"

// module:
//
export type MakeRPCHandlerFactory<
  RequestContextMap extends Record<string, RPCContextMap.Any>,
  MiddlewareR
> = <
  T extends {
    config?: Partial<Record<keyof RequestContextMap, any>>
  },
  Req extends S.TaggedRequest.All,
  HandlerR
>(
  schema: T & S.Schema<Req, any, never>,
  next: (
    request: Req,
    headers: any
  ) => Effect.Effect<
    EffectRequest.Request.Success<Req>,
    EffectRequest.Request.Error<Req>,
    // dynamic middlewares removes the dynamic context from HandlerR
    Exclude<HandlerR, GetEffectContext<RequestContextMap, (T & S.Schema<Req, any, never>)["config"]>>
  >,
  moduleName: string
) => (
  req: Req,
  headers: any
) => Effect.Effect<
  Request.Request.Success<Req>,
  Request.Request.Error<Req> | RequestContextMapErrors<RequestContextMap>,
  // the middleware will remove from HandlerR the dynamic context, but will also add some requirements
  | MiddlewareR
  // & S.Schema<Req, any, never> is useless here but useful when creating the middleware
  | Exclude<HandlerR, GetEffectContext<RequestContextMap, (T & S.Schema<Req, any, never>)["config"]>>
>

export type RPCHandlerFactory<
  RequestContextMap extends Record<string, RPCContextMap.Any>,
  ContextProviderA
> = <
  T extends {
    config?: Partial<Record<keyof RequestContextMap, any>>
  },
  Req extends S.TaggedRequest.All,
  HandlerR
>(
  schema: T & S.Schema<Req, any, never>,
  next: (
    request: Req,
    headers: any
  ) => Effect.Effect<
    EffectRequest.Request.Success<Req>,
    EffectRequest.Request.Error<Req>,
    HandlerR
  >,
  moduleName: string
) => (
  req: Req,
  headers: any
) => Effect.Effect<
  Request.Request.Success<Req>,
  Request.Request.Error<Req> | RequestContextMapErrors<RequestContextMap>,
  | HttpRouter.HttpRouter.Provided // because of the context provider and the middleware (Middleware)
  | Exclude<
    // the middleware will remove from HandlerR the dynamic context
    // & S.Schema<Req, any, never> is useless here but useful when creating the middleware
    Exclude<HandlerR, GetEffectContext<RequestContextMap, (T & S.Schema<Req, any, never>)["config"]>>,
    // the context provider provides additional stuff both to the middleware and the next
    ContextProviderA
  >
>

type RequestContextMapProvider<RequestContextMap extends Record<string, RPCContextMap.Any>> = {
  [K in keyof RequestContextMap]: ContextWithLayer.Base<
    { [K in keyof RequestContextMap]?: RequestContextMap[K]["contextActivation"] },
    RequestContextMap[K]["service"],
    S.Schema.Type<RequestContextMap[K]["error"]>
  >
}

export interface MiddlewareMake<
  RequestContextMap extends Record<string, RPCContextMap.Any>, // what services will the middleware provide dynamically to the next, or raise errors.
  //
  // ContextProvider is a service that builds additional context for each request.
  ContextProviderA, // what the context provider provides
  ContextProviderR extends HttpRouter.HttpRouter.Provided, // what the context provider requires
  MakeContextProviderE, // what the context provider construction can fail with
  MakeContextProviderR, // what the context provider construction requires
  DynamicMiddlewareProviders extends RequestContextMapProvider<RequestContextMap>, // how to resolve the dynamic middleware
  GenericMiddlewareProviders extends Array<
    ContextTagWithDefault.Base<GenericMiddlewareMaker>
  >,
  MakeMiddlewareE, // what the middleware construction can fail with
  MakeMiddlewareR, // what the middleware requires to be constructed
  MiddlewareDependencies extends NonEmptyArray<Layer.Layer.Any> // layers provided for the middleware to be constructed
> {
  /* dynamic middlewares to be applied based on Request Configuration */
  dynamicMiddlewares: DynamicMiddlewareProviders
  /** generic middlewares are those which follow the (next) => (input, headers) => pattern */
  genericMiddlewares: GenericMiddlewareProviders
  /** static context providers */
  contextProvider: ContextTagWithDefault<
    ContextProviderId,
    ContextProviderShape<ContextProviderA, ContextProviderR>,
    MakeContextProviderE,
    MakeContextProviderR
  >

  /* dependencies for the main middleware running just before the next is called */
  dependencies?: MiddlewareDependencies
  // this actually builds "the middleware", i.e. returns the augmented next factory when yielded...
  execute?: (
    maker: (
      // MiddlewareR is set to ContextProviderA | HttpRouter.HttpRouter.Provided because that's what, at most
      // a middleware can additionally require to get executed
      cb: MakeRPCHandlerFactory<RequestContextMap, ContextProviderA | HttpRouter.HttpRouter.Provided>
    ) => MakeRPCHandlerFactory<RequestContextMap, ContextProviderA | HttpRouter.HttpRouter.Provided>
  ) => Effect<
    MakeRPCHandlerFactory<RequestContextMap, ContextProviderA | HttpRouter.HttpRouter.Provided>,
    MakeMiddlewareE,
    MakeMiddlewareR | Scope // ...that's why MakeMiddlewareR is here
  >
}

export interface MiddlewareMakerId {
  _tag: "MiddlewareMaker"
}

export type Middleware<
  RequestContextMap extends Record<string, RPCContextMap.Any>, // what services will the middlware provide dynamically to the next, or raise errors.
  MakeMiddlewareE, // what the middleware construction can fail with
  MakeMiddlewareR, // what the middlware requires to be constructed
  ContextProviderA // what the context provider provides
> = ContextTagWithDefault<
  MiddlewareMakerId,
  {
    effect: RPCHandlerFactory<RequestContextMap, ContextProviderA>
  },
  MakeMiddlewareE,
  MakeMiddlewareR,
  "MiddlewareMaker"
>

export type RequestContextMapErrors<RequestContextMap extends Record<string, RPCContextMap.Any>> = S.Schema.Type<
  RequestContextMap[keyof RequestContextMap]["error"]
>

// factory for middlewares
export const makeMiddleware =
  // by setting RequestContextMap beforehand, execute contextual typing does not fuck up itself to anys
  <
    RequestContextMap extends Record<string, RPCContextMap.Any>
  >() =>
  <
    //
    // ContextProvider is a service that builds additional context for each request.
    ContextProviderA, // what the context provider provides
    ContextProviderR extends HttpRouter.HttpRouter.Provided, // what the context provider requires
    MakeContextProviderE, // what the context provider construction can fail with
    MakeContextProviderR, // what the context provider construction requires
    RequestContextProviders extends RequestContextMapProvider<RequestContextMap>, // how to resolve the dynamic middleware
    GenericMiddlewareProviders extends Array<
      ContextTagWithDefault.Base<GenericMiddlewareMaker>
    >,
    MiddlewareDependencies extends NonEmptyArray<Layer.Layer.Any>, // layers provided for the middlware to be constructed
    MakeMiddlewareE = never, // what the middleware construction can fail with
    MakeMiddlewareR = never // what the middlware requires to be constructed
  >(
    make: MiddlewareMake<
      RequestContextMap,
      ContextProviderA,
      ContextProviderR,
      MakeContextProviderE,
      MakeContextProviderR,
      RequestContextProviders,
      GenericMiddlewareProviders,
      MakeMiddlewareE,
      MakeMiddlewareR,
      MiddlewareDependencies
    >
  ) => {
    const MiddlewareMaker = Context.GenericTag<
      MiddlewareMakerId,
      {
        effect: RPCHandlerFactory<RequestContextMap, ContextProviderA>
        _tag: "MiddlewareMaker"
      }
    >(
      "MiddlewareMaker"
    )

    const dynamicMiddlewares = implementMiddleware<RequestContextMap>()(make.dynamicMiddlewares)
    const middlewares = genericMiddlewareMaker(...make.genericMiddlewares)

    const l = Layer.scoped(
      MiddlewareMaker,
      Effect
        .all({
          dynamicMiddlewares: dynamicMiddlewares.effect,
          generic: middlewares.effect,
          middleware: make.execute
            ? make.execute((
              cb: MakeRPCHandlerFactory<RequestContextMap, HttpRouter.HttpRouter.Provided | ContextProviderA>
            ) => cb)
            : Effect.succeed<
              MakeRPCHandlerFactory<RequestContextMap, ContextProviderA | HttpRouter.HttpRouter.Provided>
            >((_schema, next) => (payload, headers) => next(payload, headers)),
          contextProvider: make.contextProvider // uses the middleware.contextProvider tag to get the context provider service
        })
        .pipe(
          Effect.map(({ contextProvider, dynamicMiddlewares, generic, middleware }) => ({
            _tag: "MiddlewareMaker" as const,
            effect: makeRpcEffect<RequestContextMap, ContextProviderA>()(
              (schema, next, moduleName) => {
                const h = middleware(schema, next as any, moduleName)
                return (payload, rpcHeaders) =>
                  Effect.gen(function*() {
                    // TODO: perhaps this should be part of Protocol instead.
                    // the alternative is that UserProfile handling is part of Http Middleware instead of Rpc Middleware..
                    // the Rpc Middleware then just needs to confirm if it's there..
                    const req = yield* HttpServerRequest.HttpServerRequest
                    const headers = HttpHeaders.merge(req.headers, rpcHeaders)
                    return yield* generic({
                      payload,
                      headers,
                      rpc: { _tag: `${moduleName}.${payload._tag}` }, // todo: make moduleName part of the tag on S.Req creation.
                      next: Effect.gen(function*() {
                        yield* Effect.annotateCurrentSpan(
                          "request.name",
                          moduleName ? `${moduleName}.${payload._tag}` : payload._tag
                        )

                        // the contextProvider is an Effect that builds the context for the request
                        return yield* contextProvider.pipe(
                          Effect.flatMap((contextProviderContext) =>
                            // the dynamicMiddlewares is an Effect that builds the dynamiuc context for the request
                            dynamicMiddlewares(schema.config ?? {}, headers).pipe(
                              Effect.flatMap((dynamicContext) =>
                                h(payload, headers).pipe(Effect.provide(dynamicContext))
                              ),
                              Effect.provide(contextProviderContext)
                            )
                          )
                        )
                      }) as any
                    })
                  }) as any // why?
              }
            )
          }))
        )
    )

    const middlewareLayer = l
      .pipe(
        Layer.provide(
          Layer.mergeAll(
            make.dependencies ? make.dependencies as any : Layer.empty,
            ...(dynamicMiddlewares.dependencies as any),
            make.contextProvider.Default,
            ...middlewares.dependencies
          )
        )
      ) as Layer.Layer<
        MiddlewareMakerId,
        | MakeMiddlewareE // what the middleware construction can fail with
        | LayerUtils.GetLayersContext<typeof dynamicMiddlewares.dependencies>
        | LayerUtils.GetLayersContext<typeof middlewares.dependencies> // what could go wrong when building the dynamic middleware provider
        | Layer.Error<typeof make.contextProvider.Default>, // what could go wrong when building the context provider
        | LayerUtils.GetLayersContext<MiddlewareDependencies> // what's needed to build layers
        | LayerUtils.GetLayersContext<typeof middlewares.dependencies>
        | LayerUtils.GetLayersContext<typeof dynamicMiddlewares.dependencies> // what's needed to build dynamic middleware layers
        | Exclude<MakeMiddlewareR, LayerUtils.GetLayersSuccess<MiddlewareDependencies>> // what layers provides
        | Layer.Context<typeof make.contextProvider.Default> // what's needed to build the contextProvider
      >

    return Object.assign(MiddlewareMaker, { Default: middlewareLayer })
  }

// it just provides the right types without cluttering the implementation with them
function makeRpcEffect<
  RequestContextMap extends Record<string, RPCContextMap.Any>,
  ContextProviderA
>() {
  return (
    cb: <
      T extends {
        config?: Partial<Record<keyof RequestContextMap, any>>
      },
      Req extends S.TaggedRequest.All,
      HandlerR
    >(
      schema: T & S.Schema<Req, any, never>,
      next: (
        request: Req,
        headers: any
      ) => Effect.Effect<
        EffectRequest.Request.Success<Req>,
        EffectRequest.Request.Error<Req>,
        HandlerR
      >,
      moduleName: string
    ) => (
      req: Req,
      headers: any
    ) => Effect.Effect<
      Request.Request.Success<Req>,
      Request.Request.Error<Req> | RequestContextMapErrors<RequestContextMap>,
      | HttpRouter.HttpRouter.Provided // the context provider may require HttpRouter.Provided to run
      | Exclude<
        // it can also be removed from HandlerR
        Exclude<HandlerR, GetEffectContext<RequestContextMap, (T & S.Schema<Req, any, never>)["config"]>>,
        ContextProviderA
      >
    >
  ) => cb
}

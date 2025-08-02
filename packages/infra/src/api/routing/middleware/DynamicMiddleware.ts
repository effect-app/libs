/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { Rpc, RpcMiddleware } from "@effect/rpc"
import { Context, Effect, Layer, type NonEmptyReadonlyArray, Option, type Request, type S, type Schema, type Scope, Unify } from "effect-app"
import type { GetEffectContext, RPCContextMap } from "effect-app/client/req"
import { type HttpRouter } from "effect-app/http"
import type * as EffectRequest from "effect/Request"
import { type ContextTagWithDefault, type LayerUtils } from "../../layerUtils.js"
import { type ContextProviderId, type ContextProviderShape } from "./ContextProvider.js"
import { type ContextWithLayer, implementMiddleware } from "./dynamic-middleware.js"
import { type GenericMiddlewareMaker, genericMiddlewareMaker } from "./generic-middleware.js"

/* eslint-disable @typescript-eslint/no-explicit-any */
import { type RpcMiddlewareWrap } from "@effect/rpc/RpcMiddleware"
import { type TagUnify, type TagUnifyIgnore } from "effect/Context"

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
  GenericMiddlewareProviders extends NonEmptyReadonlyArray<GenericMiddlewareMaker>,
  MakeMiddlewareE, // what the middleware construction can fail with
  MakeMiddlewareR, // what the middleware requires to be constructed
  MiddlewareDependencies extends NonEmptyReadonlyArray<Layer.Layer.Any> // layers provided for the middleware to be constructed
> {
  /* dynamic middlewares to be applied based on Request Configuration */
  dynamicMiddlewares: DynamicMiddlewareProviders
  /** generic middlewares are those which follow the (next) => (input, headers) => pattern */
  genericMiddlewares: GenericMiddlewareProviders
  /** static context providers */
  contextProvider?: ContextTagWithDefault<
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
    _tag: "MiddlewareMaker"
    effect: RPCHandlerFactory<RequestContextMap, ContextProviderA>
  },
  MakeMiddlewareE,
  MakeMiddlewareR
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
    RequestContextProviders extends RequestContextMapProvider<RequestContextMap>, // how to resolve the dynamic middleware
    GenericMiddlewareProviders extends NonEmptyReadonlyArray<GenericMiddlewareMaker>,
    MiddlewareDependencies extends NonEmptyReadonlyArray<Layer.Layer.Any>, // layers provided for the middlware to be constructed
    //
    // ContextProvider is a service that builds additional context for each request.
    ContextProviderA = never, // what the context provider provides
    ContextProviderR extends HttpRouter.HttpRouter.Provided = never, // what the context provider requires
    MakeContextProviderE = never, // what the context provider construction can fail with
    MakeContextProviderR = never, // what the context provider construction requires
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
          contextProvider: make.contextProvider
            ? make.contextProvider.pipe(Effect.map(Effect.map(Option.some)))
            : Effect.succeed(Effect.succeed(Option.none())) // uses the middleware.contextProvider tag to get the context provider service
        })
        .pipe(
          Effect.map(({ contextProvider, dynamicMiddlewares, generic, middleware }) => ({
            _tag: "MiddlewareMaker" as const,
            effect: makeRpcEffect<RequestContextMap, ContextProviderA>()(
              (schema, next, moduleName) => {
                const h = middleware(schema, next as any, moduleName)
                return (payload, headers) =>
                  Effect.gen(function*() {
                    return yield* generic({
                      payload,
                      headers,
                      clientId: 0, // TODO: get the clientId from the request context
                      rpc: {
                        ...Rpc.fromTaggedRequest(schema as any),
                        // middlewares ? // todo: get from actual middleware flow?
                        annotations: Context.empty(), // TODO //Annotations(schema as any),
                        // successSchema: schema.success ?? Schema.Void,
                        // errorSchema: schema.failure ?? Schema.Never,
                        payloadSchema: schema,
                        _tag: `${moduleName}.${payload._tag}`,
                        key: `${moduleName}.${payload._tag}` /* ? */
                        // clientId: 0 as number /* ? */
                      }, // todo: make moduleName part of the tag on S.Req creation.
                      next:
                        // the contextProvider is an Effect that builds the context for the request
                        contextProvider.pipe(
                          Effect.flatMap((contextProviderContext) =>
                            // the dynamicMiddlewares is an Effect that builds the dynamiuc context for the request
                            dynamicMiddlewares(schema.config ?? {}, headers).pipe(
                              Effect.flatMap((dynamicContext) =>
                                h(payload, headers).pipe(Effect.provide(dynamicContext))
                              ),
                              Effect.provide(Option.getOrElse(contextProviderContext, () => Context.empty()))
                            )
                          )
                        ) as any
                    })
                  }) as any // why?
              }
            )
          }))
        )
    )

    const dependencies = [
      ...(make.dependencies ? make.dependencies : []),
      ...(dynamicMiddlewares.dependencies as any),
      ...(make.contextProvider?.Default ? [make.contextProvider.Default] : []),
      ...middlewares.dependencies
    ]
    const middlewareLayer = l
      .pipe(
        Layer.provide(dependencies as any)
      ) as Layer.Layer<
        MiddlewareMakerId,
        | MakeMiddlewareE // what the middleware construction can fail with
        | LayerUtils.GetLayersError<typeof dynamicMiddlewares.dependencies>
        | LayerUtils.GetLayersError<typeof middlewares.dependencies> // what could go wrong when building the dynamic middleware provider
        | MakeContextProviderE, // what could go wrong when building the context provider
        | LayerUtils.GetLayersContext<MiddlewareDependencies> // what's needed to build layers
        | LayerUtils.GetLayersContext<typeof middlewares.dependencies>
        | LayerUtils.GetLayersContext<typeof dynamicMiddlewares.dependencies> // what's needed to build dynamic middleware layers
        | Exclude<MakeMiddlewareR, LayerUtils.GetLayersSuccess<MiddlewareDependencies>> // what layers provides
        | MakeContextProviderR // what's needed to build the contextProvider
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

type RpcOptionsOriginal = {
  readonly wrap?: boolean
  readonly optional?: boolean
  readonly failure?: Schema.Schema.All
  readonly provides?: Context.Tag<any, any>
  readonly requiredForClient?: boolean
}

export const Tag = <Self>() =>
<
  const Name extends string,
  const Options extends RpcOptionsOriginal
>(
  id: Name,
  options?: Options | undefined
) =>
<E, R, L extends NonEmptyReadonlyArray<Layer.Layer.Any>>(opts: {
  effect: Effect.Effect<
    RpcMiddleware.TagClass.Wrap<Options> extends true ? RpcMiddlewareWrap<
        RpcMiddleware.TagClass.Provides<Options>,
        RpcMiddleware.TagClass.Failure<Options>
      >
      : RpcMiddleware.RpcMiddleware<
        RpcMiddleware.TagClass.Service<Options>,
        RpcMiddleware.TagClass.FailureService<Options>
      >
  >
  dependencies?: L
}): RpcMiddleware.TagClass<Self, Name, Options> & {
  Default: Layer.Layer<Self, E, Exclude<R, LayerUtils.GetLayersSuccess<L>>>
} =>
  class extends RpcMiddleware.Tag<Self>()(id, options) {
    static readonly Default = Layer.scoped(this, opts.effect as any).pipe(
      Layer.provide([Layer.empty, ...opts.dependencies ?? []])
    )
    static override [Unify.typeSymbol]?: unknown
    static override [Unify.unifySymbol]?: TagUnify<typeof this>
    static override [Unify.ignoreSymbol]?: TagUnifyIgnore
  } as any

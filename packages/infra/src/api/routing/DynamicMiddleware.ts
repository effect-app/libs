/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { type Array, Context, Effect, Layer, type NonEmptyArray, pipe, type Request, type S, type Scope } from "effect-app"
import type { GetEffectContext, RPCContextMap } from "effect-app/client/req"
import { type HttpRouter } from "effect-app/http"
import type * as EffectRequest from "effect/Request"
import { type LayersUtils } from "../routing.js"
import { type AnyContextWithLayer, implementMiddleware, mergeContexts } from "./dynamic-middleware.js"

// utils:
//
type GetContext<T> = T extends Context.Context<infer Y> ? Y : never

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
  handler: (
    request: Req,
    headers: any
  ) => Effect.Effect<
    EffectRequest.Request.Success<Req>,
    EffectRequest.Request.Error<Req>,
    // dynamic middlewares removes the dynamic context from HandlerR
    Exclude<HandlerR, GetEffectContext<RequestContextMap, (T & S.Schema<Req, any, never>)["config"]>>
  >,
  moduleName?: string
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
  Request.Request.Error<Req> | RequestContextMapErrors<RequestContextMap>,
  | HttpRouter.HttpRouter.Provided // because of the context provider and the middleware (Middleware)
  | Exclude<
    // the middleware will remove from HandlerR the dynamic context
    // & S.Schema<Req, any, never> is useless here but useful when creating the middleware
    Exclude<HandlerR, GetEffectContext<RequestContextMap, (T & S.Schema<Req, any, never>)["config"]>>,
    // the context provider provides additional stuff both to the middleware and the handler
    ContextProviderA
  >
>

// the context provider provides additional stuff
export type ContextProviderShape<ContextProviderA, ContextProviderR extends HttpRouter.HttpRouter.Provided> = Effect<
  Context.Context<ContextProviderA>,
  never, // no errors are allowed
  ContextProviderR
>

export interface ContextProviderId {
  _tag: "ContextProvider"
}

type RequestContextMapProvider<RequestContextMap extends Record<string, RPCContextMap.Any>> = {
  [K in keyof RequestContextMap]: AnyContextWithLayer<
    { [K in keyof RequestContextMap]?: RequestContextMap[K]["contextActivation"] },
    RequestContextMap[K]["service"],
    S.Schema.Type<RequestContextMap[K]["error"]>
  >
}

export interface MiddlewareMake<
  RequestContextMap extends Record<string, RPCContextMap.Any>, // what services will the middleware provide dynamically to the handler, or raise errors.
  MakeMiddlewareE, // what the middleware construction can fail with
  MakeMiddlewareR, // what the middleware requires to be constructed
  MiddlewareDependencies extends NonEmptyArray<Layer.Layer.Any>, // layers provided for the middleware to be constructed
  //
  // ContextProvider is a service that builds additional context for each request.
  ContextProviderA, // what the context provider provides
  ContextProviderR extends HttpRouter.HttpRouter.Provided, // what the context provider requires
  MakeContextProviderE, // what the context provider construction can fail with
  MakeContextProviderR, // what the context provider construction requires
  TI extends RequestContextMapProvider<RequestContextMap> // how to resolve the dynamic middleware
> {
  dependencies?: MiddlewareDependencies
  dynamicMiddlewares: TI
  contextProvider:
    & Context.Tag<
      ContextProviderId,
      ContextProviderShape<ContextProviderA, ContextProviderR>
    >
    & {
      Default: Layer.Layer<ContextProviderId, MakeContextProviderE, MakeContextProviderR>
    }
  // this actually builds "the middleware", i.e. returns the augmented handler factory when yielded...
  execute: (
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

// Note: the type here must be aligned with MergedContextProvider
export const mergeContextProviders = <
  // TDeps is an array of services whit Default implementation
  // each service is an effect which builds some context for each request
  TDeps extends Array.NonEmptyReadonlyArray<
    & (
      // E = never => the context provided cannot trigger errors
      // can't put HttpRouter.HttpRouter.Provided as R here because of variance
      // (TDeps is an input type parameter so it's contravariant therefore Effect's R becomes contravariant too)
      | Context.Tag<any, Effect<Context.Context<any>, never, any> & { _tag: any }>
      | Context.Tag<any, Effect<Context.Context<any>, never, never> & { _tag: any }>
    )
    & {
      new(...args: any[]): any
      Default: Layer.Layer<Effect<Context.Context<any>> & { _tag: any }, any, any>
    }
  >
>(
  ...deps: {
    [K in keyof TDeps]: TDeps[K]["Service"] extends Effect<Context.Context<any>, never, HttpRouter.HttpRouter.Provided>
      ? TDeps[K]
      : `HttpRouter.HttpRouter.Provided are the only requirements ${TDeps[K]["Service"][
        "_tag"
      ]}'s returned effect can have`
  }
): {
  dependencies: { [K in keyof TDeps]: TDeps[K]["Default"] }
  effect: Effect.Effect<
    Effect.Effect<
      Context.Context<GetContext<Effect.Success<InstanceType<TDeps[number]>>>>,
      never,
      Effect.Context<InstanceType<TDeps[number]>>
    >,
    LayersUtils.GetLayersError<{ [K in keyof TDeps]: TDeps[K]["Default"] }>,
    LayersUtils.GetLayersSuccess<{ [K in keyof TDeps]: TDeps[K]["Default"] }>
  >
} => ({
  dependencies: deps.map((_) => _.Default) as any,
  effect: Effect.gen(function*() {
    const makers = yield* Effect.all(deps)
    return Effect
      .gen(function*() {
        const services = (makers as any[]).map((handle, i) => ({ maker: deps[i], handle }))
        // services are effects which return some Context.Context<...>
        const context = yield* mergeContexts(services as any)
        return context
      })
  }) as any
})

export interface MiddlewareMakerId {
  _tag: "MiddlewareMaker"
}

export const ContextProvider = <
  ContextProviderA,
  MakeContextProviderE,
  MakeContextProviderR,
  ContextProviderR extends HttpRouter.HttpRouter.Provided,
  Dependencies extends NonEmptyArray<Layer.Layer.Any>
>(
  input: {
    effect: Effect<
      Effect<ContextProviderA, never, ContextProviderR>,
      MakeContextProviderE,
      MakeContextProviderR | Scope
    >
    dependencies?: Dependencies
  }
) => {
  const ctx = Context.GenericTag<
    ContextProviderId,
    Effect<ContextProviderA, never, ContextProviderR>
  >(
    "ContextProvider"
  )
  const l = Layer.scoped(ctx, input.effect)
  return Object.assign(ctx, {
    Default: l.pipe(
      input.dependencies ? Layer.provide(input.dependencies) as any : (_) => _
    ) as Layer.Layer<
      ContextProviderId,
      | MakeContextProviderE
      | LayersUtils.GetLayersError<Dependencies>,
      | Exclude<MakeContextProviderR, LayersUtils.GetLayersSuccess<Dependencies>>
      | LayersUtils.GetLayersContext<Dependencies>
    >
  })
}

// Note: the type here must be aligned with mergeContextProviders
export const MergedContextProvider = <
  // TDeps is an array of services whit Default implementation
  // each service is an effect which builds some context for each request
  TDeps extends Array.NonEmptyReadonlyArray<
    & (
      // E = never => the context provided cannot trigger errors
      // can't put HttpRouter.HttpRouter.Provided as R here because of variance
      // (TDeps is an input type parameter so it's contravariant therefore Effect's R becomes contravariant too)
      | Context.Tag<any, Effect<Context.Context<any>, never, any> & { _tag: any }>
      | Context.Tag<any, Effect<Context.Context<any>, never, never> & { _tag: any }>
    )
    & {
      new(...args: any[]): any
      Default: Layer.Layer<Effect<Context.Context<any>> & { _tag: any }, any, any>
    }
  >
>(
  ...deps: {
    [K in keyof TDeps]: TDeps[K]["Service"] extends Effect<Context.Context<any>, never, HttpRouter.HttpRouter.Provided>
      ? TDeps[K]
      : `HttpRouter.HttpRouter.Provided are the only requirements ${TDeps[K]["Service"][
        "_tag"
      ]}'s returned effect can have`
  }
) =>
  pipe(
    deps as [Parameters<typeof mergeContextProviders>[0]],
    (_) => mergeContextProviders(..._),
    (_) => ContextProvider(_ as any)
  ) as unknown as
    & Context.Tag<
      ContextProviderId,
      Effect.Effect<
        Context.Context<GetContext<Effect.Success<InstanceType<TDeps[number]>>>>,
        never,
        Effect.Context<InstanceType<TDeps[number]>>
      >
    >
    & {
      Default: Layer.Layer<
        ContextProviderId,
        LayersUtils.GetLayersError<{ [K in keyof TDeps]: TDeps[K]["Default"] }>,
        | Exclude<
          InstanceType<TDeps[number]>,
          LayersUtils.GetLayersSuccess<{ [K in keyof TDeps]: TDeps[K]["Default"] }>
        >
        | LayersUtils.GetLayersContext<{ [K in keyof TDeps]: TDeps[K]["Default"] }>
      >
    }

export const EmptyContextProvider = ContextProvider({ effect: Effect.succeed(Effect.succeed(Context.empty())) })

export type Middleware<
  RequestContextMap extends Record<string, RPCContextMap.Any>, // what services will the middlware provide dynamically to the handler, or raise errors.
  MakeMiddlewareE, // what the middleware construction can fail with
  MakeMiddlewareR, // what the middlware requires to be constructed
  ContextProviderA // what the context provider provides
> =
  & Context.Tag<
    MiddlewareMakerId,
    MiddlewareMakerId & {
      effect: RPCHandlerFactory<RequestContextMap, ContextProviderA>
    }
  >
  & {
    Default: Layer.Layer<
      MiddlewareMakerId,
      MakeMiddlewareE,
      MakeMiddlewareR
    >
  }

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
    MakeMiddlewareE, // what the middleware construction can fail with
    MakeMiddlewareR, // what the middlware requires to be constructed
    MiddlewareDependencies extends NonEmptyArray<Layer.Layer.Any>, // layers provided for the middlware to be constructed
    //
    // ContextProvider is a service that builds additional context for each request.
    ContextProviderA, // what the context provider provides
    ContextProviderR extends HttpRouter.HttpRouter.Provided, // what the context provider requires
    MakeContextProviderE, // what the context provider construction can fail with
    MakeContextProviderR, // what the context provider construction requires
    TI extends RequestContextMapProvider<RequestContextMap> // how to resolve the dynamic middleware
  >(
    make: MiddlewareMake<
      RequestContextMap,
      MakeMiddlewareE,
      MakeMiddlewareR,
      MiddlewareDependencies,
      ContextProviderA,
      ContextProviderR,
      MakeContextProviderE,
      MakeContextProviderR,
      TI
    >
  ) => {
    // type Id = MiddlewareMakerId &
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

    const l = Layer.scoped(
      MiddlewareMaker,
      Effect
        .all({
          dynamicMiddlewares: dynamicMiddlewares.effect,
          middleware: make.execute((
            cb: MakeRPCHandlerFactory<RequestContextMap, HttpRouter.HttpRouter.Provided | ContextProviderA>
          ) => cb),
          contextProvider: make.contextProvider // uses the middleware.contextProvider tag to get the context provider service
        })
        .pipe(
          Effect.map(({ contextProvider, dynamicMiddlewares, middleware }) => ({
            _tag: "MiddlewareMaker" as const,
            effect: makeRpcEffect<RequestContextMap, ContextProviderA>()(
              (schema, handler, moduleName) => {
                const h = middleware(schema, handler as any, moduleName)
                return Effect.fnUntraced(function*(req, headers) {
                  yield* Effect.annotateCurrentSpan("request.name", moduleName ? `${moduleName}.${req._tag}` : req._tag)

                  // the contextProvider is an Effect that builds the context for the request
                  return yield* contextProvider.pipe(
                    Effect.flatMap((contextProviderContext) =>
                      // the dynamicMiddlewares is an Effect that builds the dynamiuc context for the request
                      dynamicMiddlewares(schema.config ?? {}, headers).pipe(
                        Effect.flatMap((dynamicContext) => h(req, headers).pipe(Effect.provide(dynamicContext))),
                        Effect.provide(contextProviderContext)
                      )
                    )
                  )
                }) as any
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
            make.contextProvider.Default
          )
        )
      ) as Layer.Layer<
        MiddlewareMakerId,
        | MakeMiddlewareE // what the middleware construction can fail with
        | LayersUtils.GetLayersContext<typeof dynamicMiddlewares.dependencies> // what could go wrong when building the dynamic middleware provider
        | Layer.Error<typeof make.contextProvider.Default>, // what could go wrong when building the context provider
        | LayersUtils.GetLayersContext<MiddlewareDependencies> // what's needed to build layers
        | LayersUtils.GetLayersContext<typeof dynamicMiddlewares.dependencies> // what's needed to build dynamic middleware layers
        | Exclude<MakeMiddlewareR, LayersUtils.GetLayersSuccess<MiddlewareDependencies>> // what layers provides
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

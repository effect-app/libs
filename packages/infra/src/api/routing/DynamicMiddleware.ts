/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { type Array, Context, Effect, Layer, type NonEmptyArray, type Request, type S } from "effect-app"
import type { GetEffectContext, RPCContextMap } from "effect-app/client/req"
import { type HttpRouter } from "effect-app/http"
import type * as EffectRequest from "effect/Request"
import { type LayersUtils } from "../routing.js"

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
    HandlerR
  >,
  moduleName?: string
) => (
  req: Req,
  headers: any
) => Effect.Effect<
  Request.Request.Success<Req>,
  Request.Request.Error<Req> | RequestContextMapErrors<RequestContextMap>,
  // the middleware will remove from HandlerR the dynamic context, but will also add the MiddlewareR
  | MiddlewareR
  // & S.Schema<Req, any, never> is useless here but useful when creating the middleware
  | Exclude<HandlerR, GetEffectContext<RequestContextMap, (T & S.Schema<Req, any, never>)["config"]>>
>

export type RPCHandlerFactory<
  RequestContextMap extends Record<string, RPCContextMap.Any>,
  MiddlewareR,
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
  | HttpRouter.HttpRouter.Provided
  // the middleware will remove from HandlerR the dynamic context, but will also add the MiddlewareR
  | Exclude<
    | MiddlewareR
    // & S.Schema<Req, any, never> is useless here but useful when creating the middleware
    | Exclude<HandlerR, GetEffectContext<RequestContextMap, (T & S.Schema<Req, any, never>)["config"]>>,
    ContextProviderA
  >
>

function makeRpcHandler<RequestContextMap extends Record<string, RPCContextMap.Any>, MiddlewareR>() {
  return (cb: MakeRPCHandlerFactory<RequestContextMap, MiddlewareR>) => cb
}

export type ContextProviderShape<ContextProviderA, ContextProviderR extends HttpRouter.HttpRouter.Provided> = Effect<
  Context.Context<ContextProviderA>,
  never,
  ContextProviderR
>

export interface MiddlewareMake<
  MiddlewareR, // what the middlware requires to execute
  RequestContextMap extends Record<string, RPCContextMap.Any>, // what services will the middlware provide dynamically to the handler, or raise errors.
  MakeMiddlewareE, // what the middleware construction can fail with
  MakeMiddlewareR, // what the middlware requires to be constructed
  MiddlewareDependencies extends NonEmptyArray<Layer.Layer.Any>, // layers provided for the middlware to be constructed
  //
  // ContextProvider is a service that builds additional context for each request.
  ContextProviderA, // what the context provider provides
  ContextProviderR extends HttpRouter.HttpRouter.Provided, // what the context provider requires
  MakeContextProviderE, // what the context provider construction can fail with
  MakeContextProviderR // what the context provider construction requires
> {
  dependencies?: MiddlewareDependencies
  contextProvider:
    & Context.Tag<
      ContextProviderId,
      ContextProviderShape<ContextProviderA, ContextProviderR>
    >
    & {
      Default: Layer.Layer<ContextProviderId, MakeContextProviderE, MakeContextProviderR>
    }
  execute: (
    maker: (
      cb: MakeRPCHandlerFactory<RequestContextMap, MiddlewareR>
    ) => MakeRPCHandlerFactory<RequestContextMap, MiddlewareR>
  ) => Effect<
    MakeRPCHandlerFactory<RequestContextMap, MiddlewareR>,
    MakeMiddlewareE,
    MakeMiddlewareR
  >
}

export interface MiddlewareMakerId {
  _tag: "MiddlewareMaker"
}

export interface ContextProviderId {
  _tag: "ContextProvider"
}

type GetContext<T> = T extends Context.Context<infer Y> ? Y : never

export const mergeContextProviders = <
  // TDeps is an array of services whit Default implementation
  // each service is an effect which builds some context for each request
  TDeps extends Array.NonEmptyReadonlyArray<
    & (
      | Context.Tag<any, Effect<Context.Context<any>, never, any> & { _tag: any }>
      | Context.Tag<any, Effect<Context.Context<any>, never, never> & { _tag: any }>
    )
    & {
      new(...args: any[]): any
      Default: Layer.Layer<Effect<Context.Context<any>> & { _tag: any }, any, any>
    }
  >
>(...deps: TDeps): {
  dependencies: { [K in keyof TDeps]: TDeps[K]["Default"] }
  effect: Effect.Effect<
    Effect.Effect<
      Context.Context<GetContext<Effect.Success<InstanceType<TDeps[number]>>>>,
      Effect.Error<InstanceType<TDeps[number]>>,
      Effect.Context<InstanceType<TDeps[number]>>
    >,
    never,
    InstanceType<TDeps[number]>
  >
} => ({
  dependencies: deps.map((_) => _.Default) as any,
  effect: Effect.gen(function*() {
    const services = yield* Effect.all(deps)
    // services are effects which return some Context.Context<...>
    return Effect.all(services as any[]).pipe(
      Effect.map((_) => Context.mergeAll(..._ as any))
    )
  }) as any
})

// TODO: andrea; how?
// export const MergedContextProvider = <
//   // TDeps is an array of services whit Default implementation
//   // each service is an effect which builds some context for each request
//   TDeps extends Array.NonEmptyReadonlyArray<
//     & (
//       | Context.Tag<any, Effect<Context.Context<any>, never, any> & { _tag: any }>
//       | Context.Tag<any, Effect<Context.Context<any>, never, never> & { _tag: any }>
//     )
//     & {
//       new(...args: any[]): any
//       Default: Layer.Layer<Effect<Context.Context<any>> & { _tag: any }, any, any>
//     }
//   >
// >(...deps: TDeps) => ContextProvider(mergeContextProviders(...deps))

export const ContextProvider = <A, E, R, ContextE, ContextR, Dependencies extends NonEmptyArray<Layer.Layer.Any>>(
  input: { effect: Effect<Effect<A, ContextE, ContextR>, E, R>; dependencies?: Dependencies }
) => {
  const ctx = Context.GenericTag<
    ContextProviderId,
    Effect<A, ContextE, ContextR>
  >(
    "ContextProvider"
  )
  const l = Layer.effect(ctx, input.effect)
  return Object.assign(ctx, {
    Default: l.pipe(
      input.dependencies ? Layer.provide(input.dependencies) as any : (_) => _
    ) as Layer.Layer<
      ContextProviderId,
      E | LayersUtils.GetLayersError<Dependencies>,
      Exclude<R, LayersUtils.GetLayersSuccess<Dependencies>> | LayersUtils.GetLayersContext<Dependencies>
    >
  })
}

export const EmptyContextProvider = ContextProvider({ effect: Effect.succeed(Effect.succeed(Context.empty())) })

export type Middleware<
  MiddlewareR, // what the middlware requires to execute
  RequestContextMap extends Record<string, RPCContextMap.Any>, // what services will the middlware provide dynamically to the handler, or raise errors.
  MakeMiddlewareE, // what the middleware construction can fail with
  MakeMiddlewareR, // what the middlware requires to be constructed
  ContextProviderA // what the context provider provides
> =
  & Context.Tag<
    MiddlewareMakerId,
    MiddlewareMakerId & {
      effect: RPCHandlerFactory<RequestContextMap, MiddlewareR, ContextProviderA>
    } & {
      _tag: "MiddlewareMaker"
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

// identity factory for Middleware
export const makeMiddleware =
  // by setting MiddlewareR and RequestContextMap beforehand, execute contextual typing does not fuck up itself to anys
  <RequestContextMap extends Record<string, RPCContextMap.Any>, MiddlewareR>() =>
  <
    MakeMiddlewareE, // what the middleware construction can fail with
    MakeMiddlewareR, // what the middlware requires to be constructed
    MiddlewareDependencies extends NonEmptyArray<Layer.Layer.Any>, // layers provided for the middlware to be constructed
    //
    // ContextProvider is a service that builds additional context for each request.
    ContextProviderA, // what the context provider provides
    ContextProviderR extends HttpRouter.HttpRouter.Provided, // what the context provider requires
    MakeContextProviderE, // what the context provider construction can fail with
    MakeContextProviderR // what the context provider construction requires
  >(
    make: MiddlewareMake<
      MiddlewareR,
      RequestContextMap,
      MakeMiddlewareE,
      MakeMiddlewareR,
      MiddlewareDependencies,
      ContextProviderA,
      ContextProviderR,
      MakeContextProviderE,
      MakeContextProviderR
    >
  ) => {
    // type Id = MiddlewareMakerId &
    const MiddlewareMaker = Context.GenericTag<
      MiddlewareMakerId,
      {
        effect: RPCHandlerFactory<RequestContextMap, MiddlewareR, ContextProviderA>
        _tag: "MiddlewareMaker"
      }
    >(
      "MiddlewareMaker"
    )

    const l = Layer.effect(
      MiddlewareMaker,
      Effect
        .all({
          middleware: make.execute(makeRpcHandler<RequestContextMap, MiddlewareR>()),
          contextProvider: make.contextProvider // uses the middleware.contextProvider tag to get the context provider service
        })
        .pipe(
          Effect.map(({ contextProvider, middleware }) => ({
            _tag: "MiddlewareMaker" as const,
            effect: makeRpcEffect<RequestContextMap, MiddlewareR, ContextProviderA>()(
              (schema, handler, moduleName) => {
                const h = middleware(schema, handler, moduleName)
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
              }
            )
          }))
        )
    )
    const middlewareLayer = l
      .pipe(
        make.dependencies ? Layer.provide(make.dependencies) as any : (_) => _,
        Layer.provide(make.contextProvider.Default)
      ) as Layer.Layer<
        MiddlewareMakerId,
        | MakeMiddlewareE
        | Layer.Error<typeof make.contextProvider.Default>,
        | LayersUtils.GetLayersContext<MiddlewareDependencies>
        | Exclude<MakeMiddlewareR, LayersUtils.GetLayersSuccess<MiddlewareDependencies>>
        | Layer.Context<typeof make.contextProvider.Default>
      >

    return Object.assign(MiddlewareMaker, { Default: middlewareLayer })
  }

// it just provides the right types without cluttering the implementation with them
function makeRpcEffect<
  RequestContextMap extends Record<string, RPCContextMap.Any>,
  MiddlewareR,
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
      | Exclude<MiddlewareR, ContextProviderA> // for sure ContextProviderA is provided, so it can be removed from the MiddlewareR\
      | Exclude<
        Exclude<HandlerR, GetEffectContext<RequestContextMap, (T & S.Schema<Req, any, never>)["config"]>>,
        ContextProviderA
      > // it can also be removed from HandlerR
    >
  ) => cb
}

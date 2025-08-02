/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { Rpc, RpcMiddleware } from "@effect/rpc"
import { type SuccessValue, type TagClass } from "@effect/rpc/RpcMiddleware"
import { Console, Context, Effect, Layer, type NonEmptyReadonlyArray, type Request, type S, type Schema, type Scope, Unify } from "effect-app"
import type { GetEffectContext, RPCContextMap } from "effect-app/client/req"
import { type HttpHeaders } from "effect-app/http"
import { type TagUnify, type TagUnifyIgnore } from "effect/Context"
import type * as EffectRequest from "effect/Request"
import { type ContextTagWithDefault, type LayerUtils } from "../../layerUtils.js"
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
  | Scope.Scope // because of the context provider and the middleware (Middleware)
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

  /* dependencies for the main middleware running just before the next is called */
  dependencies?: MiddlewareDependencies
  // this actually builds "the middleware", i.e. returns the augmented next factory when yielded...
  execute?: (
    maker: (
      // MiddlewareR is set to GenericMiddlewareProviders | Scope.Scope because that's what, at most
      // a middleware can additionally require to get executed
      cb: MakeRPCHandlerFactory<
        RequestContextMap,
        | GenericMiddlewareMaker.Provided<GenericMiddlewareProviders[number]>
        | Scope.Scope
      >
    ) => MakeRPCHandlerFactory<
      RequestContextMap,
      | GenericMiddlewareMaker.Provided<GenericMiddlewareProviders[number]>
      | Scope.Scope
    >
  ) => Effect<
    MakeRPCHandlerFactory<
      RequestContextMap,
      | GenericMiddlewareMaker.Provided<GenericMiddlewareProviders[number]>
      | Scope.Scope
    >,
    MakeMiddlewareE,
    MakeMiddlewareR | Scope // ...that's why MakeMiddlewareR is here
  >
}

export interface MiddlewareMakerId {
  _tag: "MiddlewareMaker"
}

export type RouterMiddleware<
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
    MakeMiddlewareE = never, // what the middleware construction can fail with
    MakeMiddlewareR = never // what the middlware requires to be constructed
  >(
    make: MiddlewareMake<
      RequestContextMap,
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
        effect: RPCHandlerFactory<
          RequestContextMap,
          GenericMiddlewareMaker.Provided<GenericMiddlewareProviders[number]>
        >
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
              cb: MakeRPCHandlerFactory<
                RequestContextMap,
                Scope.Scope | GenericMiddlewareMaker.Provided<GenericMiddlewareProviders[number]>
              >
            ) => cb)
            : Effect.succeed<
              MakeRPCHandlerFactory<
                RequestContextMap,
                Scope.Scope | GenericMiddlewareMaker.Provided<GenericMiddlewareProviders[number]>
              >
            >((_schema, next) => (payload, headers) => next(payload, headers))
        })
        .pipe(
          Effect.map(({ dynamicMiddlewares, generic, middleware }) => ({
            _tag: "MiddlewareMaker" as const,
            effect: makeRpcEffect<
              RequestContextMap,
              GenericMiddlewareMaker.Provided<GenericMiddlewareProviders[number]>
            >()(
              (schema, next, moduleName) => {
                const h = middleware(schema, next as any, moduleName)
                return (payload, headers) =>
                  Effect
                    .gen(function*() {
                      const gen = generic({
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
                          // the dynamicMiddlewares is an Effect that builds the dynamiuc context for the request
                          dynamicMiddlewares(schema.config ?? {}, headers).pipe(
                            Effect.flatMap((dynamicContext) => h(payload, headers).pipe(Effect.provide(dynamicContext)))
                          ) as any
                      })
                      console.log({ gen })

                      return yield* gen
                    })
                    .pipe(Effect.onExit(Console.log)) as any // why?
              }
            )
          })),
          Effect.onExit(Console.log)
        )
    )

    const dependencies = [
      ...(make.dependencies ? make.dependencies : []),
      ...(dynamicMiddlewares.dependencies as any),
      ...middlewares.dependencies
    ]
    const middlewareLayer = l
      .pipe(
        Layer.provide(dependencies as any)
      ) as Layer.Layer<
        MiddlewareMakerId,
        | MakeMiddlewareE // what the middleware construction can fail with
        | LayerUtils.GetLayersError<typeof dynamicMiddlewares.dependencies>
        | LayerUtils.GetLayersError<typeof middlewares.dependencies>, // what could go wrong when building the dynamic middleware provider
        | LayerUtils.GetLayersContext<MiddlewareDependencies> // what's needed to build layers
        | LayerUtils.GetLayersContext<typeof middlewares.dependencies>
        | LayerUtils.GetLayersContext<typeof dynamicMiddlewares.dependencies> // what's needed to build dynamic middleware layers
        | Exclude<MakeMiddlewareR, LayerUtils.GetLayersSuccess<MiddlewareDependencies>> // what layers provides
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
      | Scope.Scope // the context provider may require Scope to run
      | Exclude<
        // it can also be removed from HandlerR
        Exclude<HandlerR, GetEffectContext<RequestContextMap, (T & S.Schema<Req, any, never>)["config"]>>,
        ContextProviderA
      >
    >
  ) => cb
}

// updated to support Scope.Scope
export interface RpcMiddleware<Provides, E> {
  (options: {
    readonly clientId: number
    readonly rpc: Rpc.AnyWithProps
    readonly payload: unknown
    readonly headers: HttpHeaders.Headers
  }): Effect.Effect<Provides, E, Scope.Scope>
}
export interface RpcMiddlewareWrap<Provides, E> {
  (options: {
    readonly clientId: number
    readonly rpc: Rpc.AnyWithProps
    readonly payload: unknown
    readonly headers: HttpHeaders.Headers
    readonly next: Effect.Effect<SuccessValue, E, Provides | Scope.Scope>
  }): Effect.Effect<SuccessValue, E, Scope.Scope>
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
    TagClass.Wrap<Options> extends true ? RpcMiddlewareWrap<
        TagClass.Provides<Options>,
        TagClass.Failure<Options>
      >
      : RpcMiddleware<
        TagClass.Service<Options>,
        TagClass.FailureService<Options>
      >,
    E,
    R
  >
  dependencies?: L
}): RpcMiddleware.TagClass<Self, Name, Options> & {
  Default: Layer.Layer<Self, E | LayerUtils.GetLayersError<L>, Exclude<R, LayerUtils.GetLayersSuccess<L>>>
} =>
  class extends RpcMiddleware.Tag<Self>()(id, options) {
    static readonly Default = Layer.scoped(this, opts.effect as any).pipe(
      Layer.provide([Layer.empty, ...opts.dependencies ?? []])
    )
    static override [Unify.typeSymbol]?: unknown
    static override [Unify.unifySymbol]?: TagUnify<typeof this>
    static override [Unify.ignoreSymbol]?: TagUnifyIgnore
  } as any

// export const Tag = <Self>() =>
// <
//   const Name extends string,
//   const Options extends Omit<RpcOptionsOriginal, "wrap">
// >(
//   id: Name,
//   options?: Options | undefined
// ) =>
//   OurTag<Self>()(id, { ...options, wrap: true } as Options & { wrap: true }) as <
//     E,
//     R,
//     L extends NonEmptyReadonlyArray<Layer.Layer.Any>
//   >(opts: {
//     effect: Effect.Effect<
//       RpcMiddlewareWrap<
//         RpcMiddleware.TagClass.Provides<Options>,
//         RpcMiddleware.TagClass.Failure<Options>
//       >,
//       E,
//       R
//     >
//     dependencies?: L
//   }) => RpcMiddleware.TagClass<Self, Name, Options> & {
//     Default: Layer.Layer<Self, E | LayerUtils.GetLayersError<L>, Exclude<R, LayerUtils.GetLayersSuccess<L>>>
//   }

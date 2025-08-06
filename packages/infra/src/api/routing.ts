/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-empty-object-type */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { Rpc, RpcGroup, RpcServer } from "@effect/rpc"
import { type Array, Effect, Layer, type NonEmptyReadonlyArray, Predicate, S, Schema, type Scope } from "effect-app"
import type { GetEffectContext, GetEffectError, RPCContextMap } from "effect-app/client/req"
import { type HttpHeaders, HttpRouter } from "effect-app/http"
import { typedKeysOf, typedValuesOf } from "effect-app/utils"
import { type Service } from "effect/Effect"
import type { Contravariant } from "effect/Types"
import { type YieldWrap } from "effect/Utils"
import { type LayerUtils } from "./layerUtils.js"
import { DevMode, type RouterMiddleware } from "./routing/middleware.js"

export * from "./routing/middleware.js"

// it's the result of extending S.Req setting success, config
// it's a schema plus some metadata
export type AnyRequestModule = S.Schema.Any & {
  _tag: string // unique identifier for the request module
  config: any // ?
  success: S.Schema.Any // validates the success response
  failure: S.Schema.Any // validates the failure response
}

// builder pattern for adding actions to a router until all actions are added
export interface AddAction<Actions extends AnyRequestModule, Accum extends Record<string, any> = {}> {
  accum: Accum
  add<A extends Handler<Actions, any, any>>(
    a: A
  ): A extends Handler<infer M extends AnyRequestModule, any, any> ? Exclude<Actions, M> extends never ?
        & Accum
        & { [K in M["_tag"]]: A }
    :
      & AddAction<
        Exclude<Actions, M>,
        & Accum
        & { [K in M["_tag"]]: A }
      >
      & Accum
      & { [K in M["_tag"]]: A }
    : never
}

// note:
// "d" stands for decoded i.e. the Type
// "raw" stands for encoded i.e. the Encoded
namespace RequestTypes {
  export const DECODED = "d" as const
  export type DECODED = typeof DECODED
  export const TYPE = "raw" as const
  export type TYPE = typeof TYPE
}
type RequestType = typeof RequestTypes[keyof typeof RequestTypes]

type GetSuccess<T> = T extends { success: S.Schema.Any } ? T["success"] : typeof S.Void
type GetFailure<T extends { failure?: S.Schema.Any }> = T["failure"] extends never ? typeof S.Never : T["failure"]

type GetSuccessShape<Action extends { success?: S.Schema.Any }, RT extends RequestType> = {
  d: S.Schema.Type<GetSuccess<Action>>
  raw: S.Schema.Encoded<GetSuccess<Action>>
}[RT]

interface HandlerBase<Action extends AnyRequestModule, RT extends RequestType, A, E, R> {
  new(): {}
  _tag: RT
  stack: string
  handler: (req: S.Schema.Type<Action>, headers: HttpHeaders.Headers) => Effect<A, E, R>
}

export interface Handler<Action extends AnyRequestModule, RT extends RequestType, R> extends
  HandlerBase<
    Action,
    RT,
    GetSuccessShape<Action, RT>,
    S.Schema.Type<GetFailure<Action>> | S.ParseResult.ParseError,
    R
  >
{}

type AnyHandler<Action extends AnyRequestModule> = Handler<
  Action,
  RequestType,
  any // R
>

// a Resource is typically the whole module with all the exported sh*t
// this helper retrieves only the entities (classes) which are built by extending S.Req
type FilterRequestModules<T> = {
  [K in keyof T as T[K] extends AnyRequestModule ? K : never]: T[K]
}

export const RouterSymbol = Symbol()
export interface RouterShape<Resource> {
  [RouterSymbol]: Resource
}

type RPCRouteR<
  T extends [any, (req: any, headers: HttpHeaders.Headers) => Effect<any, any, any>]
> = T extends [
  any,
  (...args: any[]) => Effect<any, any, infer R>
] ? R
  : never

type Match<
  Resource extends Record<string, any>,
  RequestContextMap extends Record<string, any>,
  RT extends RequestType,
  Key extends keyof Resource
> = {
  // note: the defaults of = never prevent the whole router to error (??)
  <A extends GetSuccessShape<Resource[Key], RT>, R2 = never, E = never>(
    f: Effect<A, E, R2>
  ): Handler<
    Resource[Key],
    RT,
    Exclude<
      Exclude<R2, GetEffectContext<RequestContextMap, Resource[Key]["config"]>>,
      Scope.Scope
    >
  >

  <A extends GetSuccessShape<Resource[Key], RT>, R2 = never, E = never>(
    f: (req: S.Schema.Type<Resource[Key]>) => Effect<A, E, R2>
  ): Handler<
    Resource[Key],
    RT,
    Exclude<
      Exclude<R2, GetEffectContext<RequestContextMap, Resource[Key]["config"]>>,
      Scope.Scope
    >
  >
}

export type RouteMatcher<
  RequestContextMap extends Record<string, any>,
  Resource extends Record<string, any>
> = {
  // use Resource as Key over using Keys, so that the Go To on X.Action remain in tact in Controllers files
  /**
   * Requires the Type shape
   */
  [Key in keyof FilterRequestModules<Resource>]:
    & Match<Resource, RequestContextMap, RequestTypes.DECODED, Key>
    & {
      success: Resource[Key]["success"]
      successRaw: S.SchemaClass<S.Schema.Encoded<Resource[Key]["success"]>>
      failure: Resource[Key]["failure"]
      /**
       * Requires the Encoded shape (e.g directly undecoded from DB, so that we don't do multiple Decode/Encode)
       */
      raw: Match<Resource, RequestContextMap, RequestTypes.TYPE, Key>
    }
}

export class Router extends HttpRouter.Tag("@effect-app/Rpc")<Router>() {}

export const makeRouter = <
  RequestContextMap extends Record<string, RPCContextMap.Any>,
  MakeMiddlewareE,
  MakeMiddlewareR,
  ContextProviderA,
  ContextProviderE,
  ContextProviderR
>(
  middleware: RouterMiddleware<
    RequestContextMap,
    MakeMiddlewareE,
    MakeMiddlewareR,
    ContextProviderA,
    ContextProviderE,
    ContextProviderR
  >,
  devMode: boolean
) => {
  function matchFor<
    const ModuleName extends string,
    const Resource extends Record<string, any>
  >(
    rsc: Resource & { meta: { moduleName: ModuleName } }
  ) {
    type HandlerWithInputGen<
      Action extends AnyRequestModule,
      RT extends RequestType
    > = (
      req: S.Schema.Type<Action>
    ) => Generator<
      YieldWrap<
        Effect<
          any,
          S.Schema.Type<GetFailure<Action>> | S.ParseResult.ParseError,
          // the actual implementation of the handler may just require the dynamic context provided by the middleware
          // and the per request context provided by the context provider
          GetEffectContext<RequestContextMap, Action["config"]> | ContextProviderA
        >
      >,
      GetSuccessShape<Action, RT>,
      never
    >

    type HandlerWithInputEff<
      Action extends AnyRequestModule,
      RT extends RequestType
    > = (
      req: S.Schema.Type<Action>
    ) => Effect<
      GetSuccessShape<Action, RT>,
      S.Schema.Type<GetFailure<Action>> | S.ParseResult.ParseError,
      // the actual implementation of the handler may just require the dynamic context provided by the middleware
      // and the per request context provided by the context provider
      GetEffectContext<RequestContextMap, Action["config"]> | ContextProviderA
    >

    type HandlerEff<
      Action extends AnyRequestModule,
      RT extends RequestType
    > = Effect<
      GetSuccessShape<Action, RT>,
      S.Schema.Type<GetFailure<Action>> | S.ParseResult.ParseError,
      // the actual implementation of the handler may just require the dynamic context provided by the middleware
      // and the per request context provided by the context provider
      GetEffectContext<RequestContextMap, Action["config"]> | ContextProviderA
    >

    type Handlers<Action extends AnyRequestModule, RT extends RequestType> =
      | HandlerWithInputGen<Action, RT>
      | HandlerWithInputEff<Action, RT>
      | HandlerEff<Action, RT>

    type HandlersDecoded<Action extends AnyRequestModule> = Handlers<Action, RequestTypes.DECODED>

    type HandlersRaw<Action extends AnyRequestModule> =
      | { raw: HandlerWithInputGen<Action, RequestTypes.TYPE> }
      | { raw: HandlerWithInputEff<Action, RequestTypes.TYPE> }
      | { raw: HandlerEff<Action, RequestTypes.TYPE> }

    type AnyHandlers<Action extends AnyRequestModule> = HandlersRaw<Action> | HandlersDecoded<Action>

    const { meta } = rsc

    type RequestModules = FilterRequestModules<Resource>
    const requestModules = typedKeysOf(rsc).reduce((acc, cur) => {
      if (Predicate.isObject(rsc[cur]) && rsc[cur]["success"]) {
        acc[cur as keyof RequestModules] = rsc[cur]
      }
      return acc
    }, {} as RequestModules)

    const routeMatcher = typedKeysOf(requestModules).reduce(
      (prev, cur) => {
        ;(prev as any)[cur] = Object.assign((handlerImpl: any) => {
          // handlerImpl is the actual handler implementation
          if (handlerImpl[Symbol.toStringTag] === "GeneratorFunction") handlerImpl = Effect.fnUntraced(handlerImpl)
          const stack = new Error().stack?.split("\n").slice(2).join("\n")
          return Effect.isEffect(handlerImpl)
            ? class {
              static request = rsc[cur]
              static stack = stack
              static _tag = RequestTypes.DECODED
              static handler = () => handlerImpl
            }
            : class {
              static request = rsc[cur]
              static stack = stack
              static _tag = RequestTypes.DECODED
              static handler = handlerImpl
            }
        }, {
          success: rsc[cur].success,
          successRaw: S.encodedSchema(rsc[cur].success),
          failure: rsc[cur].failure,
          raw: // "Raw" variations are for when you don't want to decode just to encode it again on the response
            // e.g for direct projection from DB
            // but more importantly, to skip Effectful decoders, like to resolve relationships from the database or remote client.
            (handlerImpl: any) => {
              if (handlerImpl[Symbol.toStringTag] === "GeneratorFunction") handlerImpl = Effect.fnUntraced(handlerImpl)
              const stack = new Error().stack?.split("\n").slice(2).join("\n")
              return Effect.isEffect(handlerImpl)
                ? class {
                  static request = rsc[cur]
                  static stack = stack
                  static _tag = RequestTypes.TYPE
                  static handler = () => handlerImpl
                }
                : class {
                  static request = rsc[cur]
                  static stack = stack
                  static _tag = RequestTypes.TYPE
                  static handler = handlerImpl
                }
            }
        })
        return prev
      },
      {} as RouteMatcher<RequestContextMap, Resource>
    )

    const router: AddAction<RequestModules[keyof RequestModules]> = {
      accum: {},
      add(a: any) {
        ;(this.accum as any)[a.request._tag] = a
        ;(this as any)[a.request._tag] = a
        if (Object.keys(this.accum).length === Object.keys(requestModules).length) return this.accum as any
        return this as any
      }
    }

    const router3: <
      const Impl extends {
        [K in keyof FilterRequestModules<Resource>]: AnyHandlers<Resource[K]>
      }
    >(
      impl: Impl
    ) => {
      [K in keyof Impl & keyof FilterRequestModules<Resource>]: Handler<
        FilterRequestModules<Resource>[K],
        Impl[K] extends { raw: any } ? RequestTypes.TYPE : RequestTypes.DECODED,
        Exclude<
          Exclude<
            // retrieves context R from the actual implementation of the handler
            Impl[K] extends { raw: any } ? Impl[K]["raw"] extends (...args: any[]) => Effect<any, any, infer R> ? R
              : Impl[K]["raw"] extends Effect<any, any, infer R> ? R
              : Impl[K]["raw"] extends (...args: any[]) => Generator<
                YieldWrap<Effect<any, any, infer R>>,
                any,
                any
              > ? R
              : never
              : Impl[K] extends (...args: any[]) => Effect<any, any, infer R> ? R
              : Impl[K] extends Effect<any, any, infer R> ? R
              : Impl[K] extends (...args: any[]) => Generator<
                YieldWrap<Effect<any, any, infer R>>,
                any,
                any
              > ? R
              : never,
            | GetEffectContext<RequestContextMap, Resource[K]["config"]>
            | ContextProviderA
          >,
          Scope.Scope
        >
      >
    } = (impl: Record<keyof RequestModules, any>) =>
      typedKeysOf(impl).reduce((acc, cur) => {
        acc[cur] = "raw" in impl[cur] ? routeMatcher[cur].raw(impl[cur].raw) : routeMatcher[cur](impl[cur])
        return acc
      }, {} as any)

    const makeRoutes = <
      MakeE,
      MakeR,
      THandlers extends {
        // import to keep them separate via | for type checking!!
        [K in keyof RequestModules]: AnyHandler<Resource[K]>
      },
      MakeDependencies extends NonEmptyReadonlyArray<Layer.Layer.Any> | never[]
    >(
      dependencies: MakeDependencies,
      make: Effect<THandlers, MakeE, MakeR> | Generator<YieldWrap<Effect<any, MakeE, MakeR>>, THandlers, any>
    ) => {
      type Router = RouterShape<Resource>
      const layer = Effect
        .gen(function*() {
          make = (make as any)[Symbol.toStringTag] === "GeneratorFunction"
            ? Effect.fnUntraced(make as any)(router3) as any
            : make

          const controllers = yield* make

          // return make.pipe(Effect.map((c) => controllers(c, dependencies)))
          const mapped = typedKeysOf(requestModules).reduce((acc, cur) => {
            const handler = controllers[cur as keyof typeof controllers]
            const resource = rsc[cur]

            acc[cur] = [
              handler._tag === RequestTypes.TYPE
                ? class extends (resource as any) {
                  static success = S.encodedSchema(resource.success)
                  get [Schema.symbolSerializable]() {
                    return this.constructor
                  }
                  get [Schema.symbolWithResult]() {
                    return {
                      failure: resource.failure,
                      success: S.encodedSchema(resource.success)
                    }
                  }
                } as any
                : resource,
              (payload: any, headers: any) =>
                (handler.handler(payload, headers) as Effect<unknown, unknown, unknown>).pipe(
                  Effect.withSpan("Request." + resource._tag, {
                    captureStackTrace: () => handler.stack // capturing the handler stack is the main reason why we are doing the span here
                  })
                ),
              meta.moduleName
            ] as const
            return acc
          }, {} as any) as {
            [K in keyof RequestModules]: [
              Resource[K],
              (
                req: any,
                headers: HttpHeaders.Headers
              ) => Effect.Effect<
                Effect.Success<ReturnType<THandlers[K]["handler"]>>,
                | Effect.Error<ReturnType<THandlers[K]["handler"]>>
                | GetEffectError<RequestContextMap, Resource[K]["config"]>,
                Exclude<
                  Effect.Context<ReturnType<THandlers[K]["handler"]>>,
                  ContextProviderA | GetEffectContext<RequestContextMap, Resource[K]["config"]>
                >
              >
            ]
          }

          const rpcs = RpcGroup
            .make(
              ...typedValuesOf(mapped).map(([resource]) => {
                return Rpc.fromTaggedRequest(resource).annotate(middleware.requestContext, resource.config ?? {})
              })
            )
            .prefix(`${meta.moduleName}.`)
            .middleware(middleware as any)
          const rpcLayer = rpcs.toLayer(Effect.gen(function*() {
            return typedValuesOf(mapped).reduce((acc, [resource, handler]) => {
              acc[`${meta.moduleName}.${resource._tag}`] = handler
              return acc
            }, {} as Record<string, any>) as any // TODO
          })) as unknown as Layer<
            { [K in keyof RequestModules]: Rpc.Handler<K> },
            | Layer.Error<typeof middleware.Default>
            | LayerUtils.GetLayersError<MakeDependencies>,
            | RPCRouteR<typeof mapped[keyof typeof mapped]>
            | Layer.Context<typeof middleware.Default>
            | LayerUtils.GetLayersContext<MakeDependencies>
          >

          return RpcServer
            .layer(rpcs, { spanPrefix: "RpcServer." + meta.moduleName })
            .pipe(Layer.provide(rpcLayer))
            .pipe(
              Layer.provideMerge(
                RpcServer.layerProtocolHttp(
                  { path: ("/" + meta.moduleName) as `/${typeof meta.moduleName}`, routerTag: Router }
                )
              )
            )
        })
        .pipe(Layer.unwrapEffect)

      // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
      const routes = (
        layer.pipe(
          Layer.provide([
            ...dependencies ?? [],
            middleware.Default
          ] as any) as any,
          Layer.provide(Layer.succeed(DevMode, devMode))
        )
      ) as (Layer.Layer<
        Router,
        | LayerUtils.GetLayersError<MakeDependencies>
        | MakeE
        | Layer.Error<typeof middleware.Default>,
        | LayerUtils.GetLayersContext<MakeDependencies>
        | Layer.Context<typeof middleware.Default>
        | Exclude<MakeR, LayerUtils.GetLayersSuccess<MakeDependencies>>
      >)

      // Effect.Effect<HttpRouter.HttpRouter<unknown, HttpRouter.HttpRouter.DefaultServices>, never, UserRouter>

      return {
        moduleName: meta.moduleName,
        routes
      }
    }

    const effect: {
      // Multiple times duplicated the "good" overload, so that errors will only mention the last overload when failing
      <
        const Make extends {
          dependencies?: Array<Layer.Layer.Any>
          effect: (match: typeof router3) => Generator<
            YieldWrap<
              Effect<
                any,
                any,
                Make["strict"] extends false ? any
                  : Make extends { dependencies: Array<Layer.Layer.Any> } ? MakeDepsOut<Make>
                  : any
              >
            >,
            { [K in keyof FilterRequestModules<Resource>]: AnyHandler<Resource[K]> },
            any
          >

          strict?: boolean
          /** @deprecated */
          readonly ಠ_ಠ: never
        }
      >(
        make: Make
      ): {
        moduleName: ModuleName

        routes: Layer.Layer<
          RouterShape<Resource>,
          | MakeErrors<Make>
          | Service.MakeDepsE<Make>
          | Layer.Error<typeof middleware.Default>,
          | Service.MakeDepsIn<Make>
          | Layer.Context<typeof middleware.Default>
          | Exclude<
            MakeContext<Make>,
            MakeDepsOut<Make>
          >
        >

        // just for type testing purposes
        make: Make
      }
      <
        const Make extends {
          dependencies?: Array<Layer.Layer.Any>
          effect: Effect<
            { [K in keyof FilterRequestModules<Resource>]: AnyHandler<Resource[K]> },
            any,
            Make["strict"] extends false ? any
              : Make extends { dependencies: Array<Layer.Layer.Any> } ? MakeDepsOut<Make>
              : any
          >
          strict?: boolean
          /** @deprecated */
          readonly ಠ_ಠ: never
        }
      >(
        make: Make
      ): {
        moduleName: ModuleName

        routes: Layer.Layer<
          RouterShape<Resource>,
          | MakeErrors<Make>
          | Service.MakeDepsE<Make>
          | Layer.Error<typeof middleware.Default>,
          | Service.MakeDepsIn<Make>
          | Layer.Context<typeof middleware.Default>
          | Exclude<
            MakeContext<Make>,
            MakeDepsOut<Make>
          >
        >

        // just for type testing purposes
        make: Make
      }
      <
        const Make extends {
          dependencies?: Array<Layer.Layer.Any>
          effect: Effect<
            { [K in keyof FilterRequestModules<Resource>]: AnyHandler<Resource[K]> },
            any,
            Make["strict"] extends false ? any : MakeDepsOut<Make>
          >
          strict?: boolean
          /** @deprecated */
          readonly ಠ_ಠ: never
        }
      >(
        make: Make
      ): {
        moduleName: ModuleName

        routes: Layer.Layer<
          RouterShape<Resource>,
          | MakeErrors<Make>
          | Service.MakeDepsE<Make>
          | Layer.Error<typeof middleware.Default>,
          | Service.MakeDepsIn<Make>
          | Layer.Context<typeof middleware.Default>
          | Exclude<
            MakeContext<Make>,
            MakeDepsOut<Make>
          >
        >

        // just for type testing purposes
        make: Make
      }
      <
        const Make extends {
          dependencies?: Array<Layer.Layer.Any>
          effect: Effect<
            { [K in keyof FilterRequestModules<Resource>]: AnyHandler<Resource[K]> },
            any,
            Make["strict"] extends false ? any : MakeDepsOut<Make>
          >
          strict?: boolean
          /** @deprecated */
          readonly ಠ_ಠ: never
        }
      >(
        make: Make
      ): {
        moduleName: ModuleName

        routes: Layer.Layer<
          RouterShape<Resource>,
          | MakeErrors<Make>
          | Service.MakeDepsE<Make>
          | Layer.Error<typeof middleware.Default>,
          | Service.MakeDepsIn<Make>
          | Layer.Context<typeof middleware.Default>
          | Exclude<
            MakeContext<Make>,
            MakeDepsOut<Make>
          >
        >

        // just for type testing purposes
        make: Make
      }
      <
        const Make extends {
          dependencies?: Array<Layer.Layer.Any>
          effect: Effect<
            { [K in keyof FilterRequestModules<Resource>]: AnyHandler<Resource[K]> },
            any,
            MakeDepsOut<Make>
          >
          strict?: boolean
          /** @deprecated */
          readonly ಠ_ಠ: never
        }
      >(
        make: Make
      ): {
        moduleName: ModuleName

        routes: Layer.Layer<
          RouterShape<Resource>,
          | MakeErrors<Make>
          | Service.MakeDepsE<Make>
          | Layer.Error<typeof middleware.Default>,
          | Service.MakeDepsIn<Make>
          | Layer.Context<typeof middleware.Default>
          | Exclude<
            MakeContext<Make>,
            MakeDepsOut<Make>
          >
        >

        // just for type testing purposes
        make: Make
      }
      <
        const Make extends {
          dependencies?: Array<Layer.Layer.Any>
          effect: Effect<
            { [K in keyof FilterRequestModules<Resource>]: AnyHandler<Resource[K]> },
            any,
            MakeDepsOut<Make>
          >
          strict?: boolean
        }
      >(
        make: Make
      ): {
        moduleName: ModuleName

        routes: Layer.Layer<
          RouterShape<Resource>,
          | MakeErrors<Make>
          | Service.MakeDepsE<Make>
          | Layer.Error<typeof middleware.Default>,
          | Service.MakeDepsIn<Make>
          | Layer.Context<typeof middleware.Default>
          | Exclude<
            MakeContext<Make>,
            MakeDepsOut<Make>
          >
        >

        // just for type testing purposes
        make: Make
      }
      <
        const Make extends {
          dependencies?: Array<Layer.Layer.Any>
          effect: (match: typeof router3) => Generator<
            YieldWrap<
              Effect<
                any,
                any,
                Make["strict"] extends false ? any
                  : Make extends { dependencies: Array<Layer.Layer.Any> } ? MakeDepsOut<Make>
                  : any
              >
            >,
            { [K in keyof FilterRequestModules<Resource>]: AnyHandler<Resource[K]> },
            any
          >

          strict?: boolean
        }
      >(
        make: Make
      ): {
        moduleName: ModuleName

        routes: Layer.Layer<
          RouterShape<Resource>,
          | MakeErrors<Make>
          | Service.MakeDepsE<Make>
          | Layer.Error<typeof middleware.Default>,
          | Service.MakeDepsIn<Make>
          | Layer.Context<typeof middleware.Default>
          | Exclude<
            MakeContext<Make>,
            MakeDepsOut<Make>
          >
        >

        // just for type testing purposes
        make: Make
      }
      <
        const Make extends {
          dependencies: [
            ...Make["dependencies"],
            ...Exclude<Effect.Context<Make["effect"]>, MakeDepsOut<Make>> extends never ? []
              : [Layer.Layer<Exclude<Effect.Context<Make["effect"]>, MakeDepsOut<Make>>, never, never>]
          ]
          effect: Effect<
            { [K in keyof FilterRequestModules<Resource>]: AnyHandler<Resource[K]> },
            any,
            any
          >
          strict?: boolean
        }
      >(
        make: Make
      ): {
        moduleName: ModuleName
        Router: HttpRouter.HttpRouter.TagClass<
          RouterShape<Resource>,
          `${ModuleName}Router`,
          never,
          never
        > // | Exclude<
        //   RPCRouteR<
        //     { [K in keyof Filter<Resource>]: Rpc.Rpc<Resource[K], Effect.Context<ReturnType<THandlers[K]["handler"]>>> }[keyof Filter<Resource>]
        //   >,
        //   Scope.Scope
        // >
        routes: any

        // just for type testing purposes
        make: Make
      }
    } =
      ((make: { dependencies: any; effect: any; strict?: any }) =>
        Object.assign(makeRoutes(make.dependencies, make.effect), { make })) as any

    return Object.assign(effect, routeMatcher, { router, router3 })
  }

  function matchAll<
    T extends {
      [key: string]: {
        //      Router: { router: Effect<HttpRouter.HttpRouter<any, any>, any, any> }
        routes: Layer.Layer<any, any, any>
        moduleName: string
      }
    }
  >(
    handlers: T
  ) {
    const routers = typedValuesOf(handlers)

    return Layer.mergeAll(...routers.map((_) => _.routes) as [any]) as unknown as Layer.Layer<
      never,
      Layer.Layer.Error<typeof handlers[keyof typeof handlers]["routes"]>,
      Layer.Layer.Context<typeof handlers[keyof typeof handlers]["routes"]>
    > // TODO
  }

  return {
    matchAll,
    matchFor: <
      const ModuleName extends string,
      const Resource extends Record<string, any>
    >(
      rsc: Resource & { meta: { moduleName: ModuleName } }
    ) => matchFor(rsc).router3,
    Router: matchFor
  }
}

export type MakeDeps<Make> = Make extends { readonly dependencies: ReadonlyArray<Layer.Layer.Any> }
  ? Make["dependencies"][number]
  : never

export type MakeErrors<Make> = Make extends { readonly effect: Effect<infer _A, infer E, infer _R> } ? E
  : Make extends
    { readonly effect: (_: any) => Generator<YieldWrap<Effect<infer _A, never, infer _R>>, infer _A, infer _2> } ? never
  : Make extends
    { readonly effect: (_: any) => Generator<YieldWrap<Effect<infer _A, infer E, infer _R>>, infer _A, infer _2> } ? E
  : never

export type MakeContext<Make> = Make extends { readonly effect: Effect<infer _A, infer _E, infer R> } ? R
  : Make extends
    { readonly effect: (_: any) => Generator<YieldWrap<Effect<infer _A, infer _E, never>>, infer _A, infer _2> } ? never
  : Make extends
    { readonly effect: (_: any) => Generator<YieldWrap<Effect<infer _A, infer _E, infer R>>, infer _A, infer _2> } ? R
  : never

export type MakeHandlers<Make, Handlers extends Record<string, any>> = Make extends
  { readonly effect: Effect<{ [K in keyof Handlers]: AnyHandler<Handlers[K]> }, any, any> }
  ? Effect.Success<Make["effect"]>
  : Make extends { readonly effect: (_: any) => Generator<YieldWrap<any>, infer S, infer _R> } ? S
  : never

export type MakeDepsOut<Make> = Contravariant.Type<MakeDeps<Make>[Layer.LayerTypeId]["_ROut"]>

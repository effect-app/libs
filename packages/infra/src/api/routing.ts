/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-empty-object-type */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { determineMethod } from "@effect-app/infra/api/routing/utils"
import { logError, reportError } from "@effect-app/infra/errorReporter"
import { InfraLogger } from "@effect-app/infra/logger"
import { Rpc, RpcGroup, RpcServer } from "@effect/rpc"
import { Array, Cause, Duration, Effect, Layer, type NonEmptyReadonlyArray, ParseResult, Predicate, Request, S, Schedule, Schema } from "effect-app"
import type { GetEffectContext, RPCContextMap } from "effect-app/client/req"
import { type HttpHeaders, HttpRouter } from "effect-app/http"
import { pretty, typedKeysOf, typedValuesOf } from "effect-app/utils"
import type { Contravariant } from "effect/Types"
import { type YieldWrap } from "effect/Utils"
import { makeRpc, type Middleware } from "./routing/DynamicMiddleware.js"

namespace LayersUtils {
  export type GetLayersSuccess<Layers extends ReadonlyArray<Layer.Layer.Any>> = Layers extends
    NonEmptyReadonlyArray<Layer.Layer.Any> ? {
      [k in keyof Layers]: Layer.Layer.Success<Layers[k]>
    }[number]
    : never

  export type GetLayersContext<Layers extends ReadonlyArray<Layer.Layer.Any>> = Layers extends
    NonEmptyReadonlyArray<Layer.Layer.Any> ? {
      [k in keyof Layers]: Layer.Layer.Context<Layers[k]>
    }[number]
    : never

  export type GetLayersError<Layers extends ReadonlyArray<Layer.Layer.Any>> = Layers extends
    NonEmptyReadonlyArray<Layer.Layer.Any> ? {
      [k in keyof Layers]: Layer.Layer.Error<Layers[k]>
    }[number]
    : never
}

const logRequestError = logError("Request")
const reportRequestError = reportError("Request")

// retry just once on optimistic concurrency exceptions
const optimisticConcurrencySchedule = Schedule.once.pipe(
  Schedule.intersect(Schedule.recurWhile<any>((a) => a?._tag === "OptimisticConcurrencyException"))
)

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
  T extends [any, (requestLayers: any) => (req: any, headers: HttpHeaders.Headers) => Effect<any, any, any>]
> = T extends [
  any,
  (requestLayers: any) => (...args: any[]) => Effect<any, any, infer R>
] ? R
  : never

type Match<
  Resource extends Record<string, any>,
  CTXMap extends Record<string, any>,
  RT extends RequestType,
  Key extends keyof Resource,
  Context
> = {
  // note: the defaults of = never prevent the whole router to error (??)
  <A extends GetSuccessShape<Resource[Key], RT>, R2 = never, E = never>(
    f: Effect<A, E, R2>
  ): Handler<
    Resource[Key],
    RT,
    Exclude<
      Context | Exclude<R2, GetEffectContext<CTXMap, Resource[Key]["config"]>>,
      HttpRouter.HttpRouter.Provided
    >
  >

  <A extends GetSuccessShape<Resource[Key], RT>, R2 = never, E = never>(
    f: (req: S.Schema.Type<Resource[Key]>) => Effect<A, E, R2>
  ): Handler<
    Resource[Key],
    RT,
    Exclude<
      Context | Exclude<R2, GetEffectContext<CTXMap, Resource[Key]["config"]>>,
      HttpRouter.HttpRouter.Provided
    >
  >
}

export type RouteMatcher<
  CTXMap extends Record<string, any>,
  Resource extends Record<string, any>,
  Context
> = {
  // use Resource as Key over using Keys, so that the Go To on X.Action remain in tact in Controllers files
  /**
   * Requires the Type shape
   */
  [Key in keyof FilterRequestModules<Resource>]: Match<Resource, CTXMap, RequestTypes.DECODED, Key, Context> & {
    success: Resource[Key]["success"]
    successRaw: S.SchemaClass<S.Schema.Encoded<Resource[Key]["success"]>>
    failure: Resource[Key]["failure"]
    /**
     * Requires the Encoded shape (e.g directly undecoded from DB, so that we don't do multiple Decode/Encode)
     */
    raw: Match<Resource, CTXMap, RequestTypes.TYPE, Key, Context>
  }
}

// identity factory for Middleware
export const makeMiddleware = <
  Context,
  CTXMap extends Record<string, RPCContextMap.Any>,
  MiddlewareR,
  Layers extends NonEmptyReadonlyArray<Layer.Layer.Any> | never[]
>(content: Middleware<Context, CTXMap, MiddlewareR, Layers>): Middleware<Context, CTXMap, MiddlewareR, Layers> =>
  content

export class Router extends HttpRouter.Tag("@effect-app/Rpc")<Router>() {}

export const makeRouter = <
  Context,
  CTXMap extends Record<string, RPCContextMap.Any>,
  MiddlewareR,
  Layers extends NonEmptyReadonlyArray<Layer.Layer.Any> | never[]
>(
  middleware: Middleware<Context, CTXMap, MiddlewareR, Layers>,
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
      YieldWrap<Effect<any, S.Schema.Type<GetFailure<Action>> | S.ParseResult.ParseError, GetEffectContext<CTXMap, Action["config"]>>>,
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
      GetEffectContext<CTXMap, Action["config"]>
    >

    type HandlerEff<
      Action extends AnyRequestModule,
      RT extends RequestType
    > = Effect<
      GetSuccessShape<Action, RT>,
      S.Schema.Type<GetFailure<Action>> | S.ParseResult.ParseError,
      GetEffectContext<CTXMap, Action["config"]>
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

    const items = typedKeysOf(requestModules).reduce(
      (prev, cur) => {
        ;(prev as any)[cur] = Object.assign((fnOrEffect: any) => {
          // fnOrEffect is the actual handler implementation
          if (fnOrEffect[Symbol.toStringTag] === "GeneratorFunction") fnOrEffect = Effect.fnUntraced(fnOrEffect)
          const stack = new Error().stack?.split("\n").slice(2).join("\n")
          return Effect.isEffect(fnOrEffect)
            ? class {
              static request = rsc[cur]
              static stack = stack
              static _tag = RequestTypes.DECODED
              static handler = () => fnOrEffect
            }
            : class {
              static request = rsc[cur]
              static stack = stack
              static _tag = RequestTypes.DECODED
              static handler = fnOrEffect
            }
        }, {
          success: rsc[cur].success,
          successRaw: S.encodedSchema(rsc[cur].success),
          failure: rsc[cur].failure,
          raw: // "Raw" variations are for when you don't want to decode just to encode it again on the response
            // e.g for direct projection from DB
            // but more importantly, to skip Effectful decoders, like to resolve relationships from the database or remote client.
            (fnOrEffect: any) => {
              if (fnOrEffect[Symbol.toStringTag] === "GeneratorFunction") fnOrEffect = Effect.fnUntraced(fnOrEffect)
              const stack = new Error().stack?.split("\n").slice(2).join("\n")
              return Effect.isEffect(fnOrEffect)
                ? class {
                  static request = rsc[cur]
                  static stack = stack
                  static _tag = RequestTypes.TYPE
                  static handler = () => fnOrEffect
                }
                : class {
                  static request = rsc[cur]
                  static stack = stack
                  static _tag = RequestTypes.TYPE
                  static handler = fnOrEffect
                }
            }
        })
        return prev
      },
      {} as RouteMatcher<CTXMap, Resource, Context>
    )

    const total = Object.keys(requestModules).length
    const router: AddAction<RequestModules[keyof RequestModules]> = {
      accum: {},
      add(a: any) {
        ;(this.accum as any)[a.request._tag] = a
        ;(this as any)[a.request._tag] = a
        if (Object.keys(this.accum).length === total) return this.accum as any
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
          | Context
          | Exclude<
            Impl[K] extends { raw: any }
              ? Impl[K][RequestTypes.TYPE] extends (...args: any[]) => Effect<any, any, infer R> ? R
              : Impl[K][RequestTypes.TYPE] extends Effect<any, any, infer R> ? R
              : Impl[K][RequestTypes.TYPE] extends (...args: any[]) => Generator<
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
            GetEffectContext<CTXMap, Resource[K]["config"]>
          >,
          HttpRouter.HttpRouter.Provided
        >
      >
    } = (obj: Record<keyof RequestModules, any>) =>
      typedKeysOf(obj).reduce((acc, cur) => {
        acc[cur] = RequestTypes.TYPE in obj[cur] ? items[cur].raw(obj[cur].raw) : items[cur](obj[cur])
        return acc
      }, {} as any)

    const f = <
      E,
      R,
      THandlers extends {
        // import to keep them separate via | for type checking!!
        [K in keyof RequestModules]: AnyHandler<Resource[K]>
      },
      TLayers extends NonEmptyReadonlyArray<Layer.Layer.Any> | never[]
    >(
      layers: TLayers,
      make: Effect<THandlers, E, R> | Generator<YieldWrap<Effect<any, any, R>>, THandlers, E>
    ) => {
      type ProvidedLayers =
        | { [k in keyof Layers]: Layer.Layer.Success<Layers[k]> }[number]
        | { [k in keyof TLayers]: Layer.Layer.Success<TLayers[k]> }[number]
      type Router = RouterShape<Resource>

      const layer = (requestLayers: any) =>
        Effect
          .gen(function*() {
            make = (make as any)[Symbol.toStringTag] === "GeneratorFunction"
              ? Effect.fnUntraced(make as any)(router3) as any
              : make

            const controllers = yield* make
            const rpc = yield* makeRpc(middleware)

            // return make.pipe(Effect.map((c) => controllers(c, layers)))
            const mapped = typedKeysOf(requestModules).reduce((acc, cur) => {
              const handler = controllers[cur as keyof typeof controllers]
              const req = rsc[cur]

              const method = determineMethod(String(cur), req)
              const isCommand = method._tag === "command"

              const handle = isCommand
                ? (req: any, headers: HttpHeaders.Headers) =>
                  Effect.retry(handler.handler(req, headers) as any, optimisticConcurrencySchedule)
                : (req: any, headers: HttpHeaders.Headers) => Effect.interruptible(handler.handler(req, headers) as any)

              acc[cur] = [
                handler._tag === RequestTypes.TYPE
                  ? class extends (req as any) {
                    static success = S.encodedSchema(req.success)
                    get [Schema.symbolSerializable]() {
                      return this.constructor
                    }
                    get [Schema.symbolWithResult]() {
                      return {
                        failure: req.failure,
                        success: S.encodedSchema(req.success)
                      }
                    }
                  } as any
                  : req,
                (requestLayers: any) =>
                  rpc.effect(req, (input: any, headers: HttpHeaders.Headers) =>
                    // TODO: render more data... similar to console?
                    Effect
                      .annotateCurrentSpan(
                        "requestInput",
                        Object.entries(input).reduce((prev, [key, value]: [string, unknown]) => {
                          prev[key] = key === "password"
                            ? "<redacted>"
                            : typeof value === "string" || typeof value === "number" || typeof value === "boolean"
                            ? typeof value === "string" && value.length > 256
                              ? (value.substring(0, 253) + "...")
                              : value
                            : Array.isArray(value)
                            ? `Array[${value.length}]`
                            : value === null || value === undefined
                            ? `${value}`
                            : typeof value === "object" && value
                            ? `Object[${Object.keys(value).length}]`
                            : typeof value
                          return prev
                        }, {} as Record<string, string | number | boolean>)
                      )
                      .pipe(
                        // can't use andThen due to some being a function and effect
                        Effect.zipRight(handle(input, headers)),
                        // TODO: support ParseResult if the error channel of the request allows it.. but who would want that?
                        Effect.catchAll((_) => ParseResult.isParseError(_) ? Effect.die(_) : Effect.fail(_)),
                        Effect.tapErrorCause((cause) => Cause.isFailure(cause) ? logRequestError(cause) : Effect.void),
                        Effect.tapDefect((cause) =>
                          Effect
                            .all([
                              reportRequestError(cause, {
                                action: `${meta.moduleName}.${req._tag}`
                              }),
                              InfraLogger
                                .logError("Finished request", cause)
                                .pipe(Effect.annotateLogs({
                                  action: `${meta.moduleName}.${req._tag}`,
                                  req: pretty(req),
                                  headers: pretty(headers)
                                  // resHeaders: pretty(
                                  //   Object
                                  //     .entries(headers)
                                  //     .reduce((prev, [key, value]) => {
                                  //       prev[key] = value && typeof value === "string" ? snipString(value) : value
                                  //       return prev
                                  //     }, {} as Record<string, any>)
                                  // )
                                }))
                            ])
                        ),
                        // NOTE: this does not catch errors from the middlewares..
                        // we should re-evalute this in any case..
                        devMode ? (_) => _ : Effect.catchAllDefect(() => Effect.die("Internal Server Error")),
                        Effect.withSpan("Request." + meta.moduleName + "." + req._tag, {
                          captureStackTrace: () => handler.stack
                        }),
                        Effect.provide(requestLayers)
                      ), meta.moduleName),
                meta.moduleName
              ] as const
              return acc
            }, {} as any) as {
              [K in keyof RequestModules]: [
                Resource[K],
                (
                  requestLayers: any
                ) => (
                  req: any,
                  headers: HttpHeaders.Headers
                ) => Effect.Effect<
                  any,
                  Effect.Error<ReturnType<THandlers[K]["handler"]>>,
                  Context | Effect.Context<ReturnType<THandlers[K]["handler"]>>
                >
              ]
            }

            const rpcs = RpcGroup.make(
              ...typedValuesOf(mapped).map((_) => {
                return Rpc.fromTaggedRequest(_[0])
              })
            )
            const rpcLayer = (requestLayers: any) =>
              rpcs.toLayer(Effect.gen(function*() {
                return typedValuesOf(mapped).reduce((acc, [req, handler]) => {
                  acc[req._tag] = handler(requestLayers)
                  return acc
                }, {} as Record<string, any>)
              })) as unknown as Layer<
                { [K in keyof RequestModules]: Rpc.Handler<K> },
                never,
                RPCRouteR<typeof mapped[keyof typeof mapped]>
              >

            const impl = rpcLayer(requestLayers)
            const l = RpcServer.layer(rpcs, { spanPrefix: "RpcServer." + meta.moduleName }).pipe(Layer.provide(impl))
            return l.pipe(
              Layer.provideMerge(
                RpcServer.layerProtocolHttp(
                  { path: ("/" + meta.moduleName) as `/${typeof meta.moduleName}`, routerTag: Router }
                )
              )
            )

            // const rpcRouter = RpcRouter.make(...typedValuesOf(mapped).map(_ => _[0]) as any) as RpcRouter.RpcRouter<
            //   RPCRouteReq<typeof mapped[keyof typeof mapped]>,
            //   RPCRouteR<typeof mapped[keyof typeof mapped]>
            // >
            // const httpApp = toHttpApp(rpcRouter, {
            //   spanPrefix: rsc
            //     .meta
            //     .moduleName + "."
            // })
            // yield* router
            //   .post(
            //     "/",
            //     httpApp as any,
            //     { uninterruptible: true }
            //   )
          })
          .pipe(Layer.unwrapEffect)

      // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
      const routes = ((requestLayer: any) =>
        layer(requestLayer).pipe(
          layers && Array.isNonEmptyReadonlyArray(layers) ? Layer.provide(layers as any) as any : (_) => _,
          // TODO: only provide to the middleware?
          middleware.dependencies ? Layer.provide(middleware.dependencies as any) : (_) => _
        )) as ((requestLayer: any) => Layer.Layer<
          Router,
          LayersUtils.GetLayersError<TLayers> | E,
          | LayersUtils.GetLayersContext<TLayers>
          | Exclude<
            MiddlewareR | R,
            ProvidedLayers
          >
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
          dependencies: Array<Layer.Layer.Any>
          effect: (match: typeof router3) => Generator<
            YieldWrap<
              Effect<any, any, Make["strict"] extends false ? any : LayersUtils.GetLayersSuccess<Make["dependencies"]>>
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

        routes: (requestLayers: any) => Layer.Layer<
          RouterShape<Resource>,
          MakeErrors<Make> | LayersUtils.GetLayersError<Make["dependencies"]>,
          | LayersUtils.GetLayersContext<Make["dependencies"]>
          // | GetContext<Layers> // elsewhere provided
          | Exclude<
            MakeContext<Make> | MiddlewareR,
            LayersUtils.GetLayersSuccess<Make["dependencies"]> | LayersUtils.GetLayersSuccess<Layers>
          >
        >

        // just for type testing purposes
        make: Make
      }
      <
        const Make extends {
          dependencies: Array<Layer.Layer.Any>
          effect: Effect<
            { [K in keyof FilterRequestModules<Resource>]: AnyHandler<Resource[K]> },
            any,
            Make["strict"] extends false ? any : LayersUtils.GetLayersSuccess<Make["dependencies"]>
          >
          strict?: boolean
          /** @deprecated */
          readonly ಠ_ಠ: never
        }
      >(
        make: Make
      ): {
        moduleName: ModuleName

        routes: (requestLayers: any) => Layer.Layer<
          RouterShape<Resource>,
          MakeErrors<Make> | LayersUtils.GetLayersError<Make["dependencies"]>,
          | LayersUtils.GetLayersContext<Make["dependencies"]>
          // | GetContext<Layers> // elsewhere provided
          | Exclude<
            MakeContext<Make> | MiddlewareR,
            LayersUtils.GetLayersSuccess<Make["dependencies"]> | LayersUtils.GetLayersSuccess<Layers>
          >
        >

        // just for type testing purposes
        make: Make
      }
      <
        const Make extends {
          dependencies: Array<Layer.Layer.Any>
          effect: Effect<
            { [K in keyof FilterRequestModules<Resource>]: AnyHandler<Resource[K]> },
            any,
            Make["strict"] extends false ? any : LayersUtils.GetLayersSuccess<Make["dependencies"]>
          >
          strict?: boolean
          /** @deprecated */
          readonly ಠ_ಠ: never
        }
      >(
        make: Make
      ): {
        moduleName: ModuleName

        routes: (requestLayers: any) => Layer.Layer<
          RouterShape<Resource>,
          MakeErrors<Make> | LayersUtils.GetLayersError<Make["dependencies"]>,
          | LayersUtils.GetLayersContext<Make["dependencies"]>
          // | GetContext<Layers> // elsewhere provided
          | Exclude<
            MakeContext<Make> | MiddlewareR,
            LayersUtils.GetLayersSuccess<Make["dependencies"]> | LayersUtils.GetLayersSuccess<Layers>
          >
        >

        // just for type testing purposes
        make: Make
      }
      <
        const Make extends {
          dependencies: Array<Layer.Layer.Any>
          effect: Effect<
            { [K in keyof FilterRequestModules<Resource>]: AnyHandler<Resource[K]> },
            any,
            Make["strict"] extends false ? any : LayersUtils.GetLayersSuccess<Make["dependencies"]>
          >
          strict?: boolean
          /** @deprecated */
          readonly ಠ_ಠ: never
        }
      >(
        make: Make
      ): {
        moduleName: ModuleName

        routes: (requestLayers: any) => Layer.Layer<
          RouterShape<Resource>,
          MakeErrors<Make> | LayersUtils.GetLayersError<Make["dependencies"]>,
          | LayersUtils.GetLayersContext<Make["dependencies"]>
          // | GetContext<Layers> // elsewhere provided
          | Exclude<
            MakeContext<Make> | MiddlewareR,
            LayersUtils.GetLayersSuccess<Make["dependencies"]> | LayersUtils.GetLayersSuccess<Layers>
          >
        >

        // just for type testing purposes
        make: Make
      }
      <
        const Make extends {
          dependencies: Array<Layer.Layer.Any>
          effect: Effect<
            { [K in keyof FilterRequestModules<Resource>]: AnyHandler<Resource[K]> },
            any,
            LayersUtils.GetLayersSuccess<Make["dependencies"]>
          >
          strict?: boolean
          /** @deprecated */
          readonly ಠ_ಠ: never
        }
      >(
        make: Make
      ): {
        moduleName: ModuleName

        routes: (requestLayers: any) => Layer.Layer<
          RouterShape<Resource>,
          MakeErrors<Make> | LayersUtils.GetLayersError<Make["dependencies"]>,
          | LayersUtils.GetLayersContext<Make["dependencies"]>
          // | GetContext<Layers> // elsewhere provided
          | Exclude<
            MakeContext<Make> | MiddlewareR,
            LayersUtils.GetLayersSuccess<Make["dependencies"]> | LayersUtils.GetLayersSuccess<Layers>
          >
        >

        // just for type testing purposes
        make: Make
      }
      <
        const Make extends {
          dependencies: Array<Layer.Layer.Any>
          effect: Effect<
            { [K in keyof FilterRequestModules<Resource>]: AnyHandler<Resource[K]> },
            any,
            LayersUtils.GetLayersSuccess<Make["dependencies"]>
          >
          strict?: boolean
        }
      >(
        make: Make
      ): {
        moduleName: ModuleName

        routes: (requestLayers: any) => Layer.Layer<
          RouterShape<Resource>,
          MakeErrors<Make> | LayersUtils.GetLayersError<Make["dependencies"]>,
          | LayersUtils.GetLayersContext<Make["dependencies"]>
          // | GetContext<Layers> // elsewhere provided
          | Exclude<
            MakeContext<Make> | MiddlewareR,
            LayersUtils.GetLayersSuccess<Make["dependencies"]> | LayersUtils.GetLayersSuccess<Layers>
          >
        >

        // just for type testing purposes
        make: Make
      }
      <
        const Make extends {
          dependencies: Array<Layer.Layer.Any>
          effect: (match: typeof router3) => Generator<
            YieldWrap<
              Effect<any, any, Make["strict"] extends false ? any : LayersUtils.GetLayersSuccess<Make["dependencies"]>>
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

        routes: (requestLayers: any) => Layer.Layer<
          RouterShape<Resource>,
          MakeErrors<Make> | LayersUtils.GetLayersError<Make["dependencies"]>,
          | LayersUtils.GetLayersContext<Make["dependencies"]>
          // | GetContext<Layers> // elsewhere provided
          | Exclude<
            MakeContext<Make> | MiddlewareR,
            LayersUtils.GetLayersSuccess<Make["dependencies"]> | LayersUtils.GetLayersSuccess<Layers>
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
          Exclude<Context, HttpRouter.HttpRouter.Provided>
        > // | Exclude<
        //   RPCRouteR<
        //     { [K in keyof Filter<Resource>]: Rpc.Rpc<Resource[K], Effect.Context<ReturnType<THandlers[K]["handler"]>>> }[keyof Filter<Resource>]
        //   >,
        //   HttpRouter.HttpRouter.Provided
        // >
        routes: any

        // just for type testing purposes
        make: Make
      }
    } =
      ((m: { dependencies: any; effect: any; strict?: any }) =>
        Object.assign(f(m.dependencies, m.effect), { make: m })) as any

    return Object.assign(effect, items, { router, router3 })
  }

  type RequestHandlersTest = {
    [key: string]: {
      //      Router: { router: Effect<HttpRouter.HttpRouter<any, any>, any, any> }
      routes: (requestLayers: any) => Layer.Layer<any, any, any>
      moduleName: string
    }
  }
  function matchAll<T extends RequestHandlersTest, A, E, R>(
    handlers: T,
    requestLayer: Layer.Layer<A, E, R>
  ) {
    const routers = typedValuesOf(handlers)

    return Layer.mergeAll(...routers.map((_) => _.routes(requestLayer)) as [any]) as unknown as Layer.Layer<
      never,
      Layer.Layer.Error<ReturnType<typeof handlers[keyof typeof handlers]["routes"]>>,
      Layer.Layer.Context<ReturnType<typeof handlers[keyof typeof handlers]["routes"]>>
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

export type MakeErrors<Make> = Make extends { readonly effect: Effect<any, infer E, any> } ? E
  : Make extends { readonly effect: (_: any) => Generator<YieldWrap<Effect<any, infer E, any>>, any, any> } ? E
  : never

export type MakeContext<Make> = Make extends { readonly effect: Effect<any, any, infer R> } ? R
  : Make extends { readonly effect: (_: any) => Generator<YieldWrap<Effect<any, any, infer R>>, any, any> } ? R
  : never

export type MakeHandlers<Make, Handlers extends Record<string, any>> = Make extends
  { readonly effect: Effect<{ [K in keyof Handlers]: AnyHandler<Handlers[K]> }, any, any> }
  ? Effect.Success<Make["effect"]>
  : Make extends { readonly effect: (_: any) => Generator<YieldWrap<any>, infer S, any> } ? S
  : never

/**
 * @since 3.9.0
 */
export type MakeDepsOut<Make> = Contravariant.Type<MakeDeps<Make>[Layer.LayerTypeId]["_ROut"]>

export const RequestCacheLayers = Layer.mergeAll(
  Layer.setRequestCache(
    Request.makeCache({ capacity: 500, timeToLive: Duration.hours(8) })
  ),
  Layer.setRequestCaching(true),
  Layer.setRequestBatching(true)
)

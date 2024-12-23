/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-empty-object-type */
/* eslint-disable @typescript-eslint/no-explicit-any */
/*
TODO: Effect.retry(r2, optimisticConcurrencySchedule) / was for PATCH only
TODO: uninteruptible commands! was for All except GET.
*/
import type * as HttpApp from "@effect/platform/HttpApp"
import { Rpc, RpcRouter } from "@effect/rpc"
import type { NonEmptyArray } from "effect-app"
import {
  Cause,
  Chunk,
  Context,
  Effect,
  FiberRef,
  flow,
  Layer,
  Predicate,
  S,
  Schema,
  Scope,
  Stream,
  Tracer
} from "effect-app"
import type { GetEffectContext, RPCContextMap } from "effect-app/client/req"
import type { HttpServerError } from "effect-app/http"
import { HttpMiddleware, HttpRouter, HttpServerRequest, HttpServerResponse } from "effect-app/http"
import { pretty, typedKeysOf, typedValuesOf } from "effect-app/utils"
import { logError, reportError } from "../errorReporter.js"
import { InfraLogger } from "../logger.js"
import type { Middleware } from "./routing/DynamicMiddleware.js"
import { makeRpc } from "./routing/DynamicMiddleware.js"

const logRequestError = logError("Request")
const reportRequestError = reportError("Request")

export type _R<T extends Effect<any, any, any>> = [T] extends [
  Effect<any, any, infer R>
] ? R
  : never

export type _E<T extends Effect<any, any, any>> = [T] extends [
  Effect<any, infer E, any>
] ? E
  : never

export type EffectDeps<A> = {
  [K in keyof A as A[K] extends Effect<any, any, any> ? K : never]: A[K] extends Effect<any, any, any> ? A[K] : never
}
/**
 *   Plain jane JSON version
 * @deprecated use HttpRpcRouterNoStream.toHttpApp once support options
 */
export const toHttpApp = <R extends RpcRouter.RpcRouter<any, any>>(self: R, options?: {
  readonly spanPrefix?: string
}): HttpApp.Default<
  HttpServerError.RequestError,
  RpcRouter.RpcRouter.Context<R>
> => {
  const handler = RpcRouter.toHandler(self, options)
  return Effect.withFiberRuntime((fiber) => {
    const context = fiber.getFiberRef(FiberRef.currentContext)
    const request = Context.unsafeGet(context, HttpServerRequest.HttpServerRequest)
    return Effect.flatMap(
      request.json,
      (_) =>
        handler(_).pipe(
          Stream.provideContext(context),
          Stream.runCollect,
          Effect.map((_) => Chunk.toReadonlyArray(_)),
          Effect.andThen((_) => {
            let status = 200
            for (const r of _.flat()) {
              if (typeof r === "number") continue
              const results = Array.isArray(r) ? r : [r]
              if (results.some((_: S.ExitEncoded<any, any, any>) => _._tag === "Failure" && _.cause._tag === "Die")) {
                status = 500
                break
              }
              if (results.some((_: S.ExitEncoded<any, any, any>) => _._tag === "Failure" && _.cause._tag === "Fail")) {
                status = 422 // 418
                break
              }
            }
            return HttpServerResponse.json(_, { status })
          }),
          Effect.orDie,
          Effect.tapDefect(reportError("RPCHttpApp"))
        )
    )
  })
}

export interface Hint<Err extends string> {
  Err: Err
}

type HandleVoid<Expected, Actual, Result> = [Expected] extends [void]
  ? [Actual] extends [void] ? Result : Hint<"You're returning non void for a void Response, please fix">
  : Result

type AnyRequestModule = S.Schema.Any & { success?: S.Schema.Any; failure?: S.Schema.Any }

type GetSuccess<T> = T extends { success: S.Schema.Any } ? T["success"] : typeof S.Void

type GetSuccessShape<Action extends { success?: S.Schema.Any }, RT extends "d" | "raw"> = RT extends "raw"
  ? S.Schema.Encoded<GetSuccess<Action>>
  : S.Schema.Type<GetSuccess<Action>>
type GetFailure<T extends { failure?: S.Schema.Any }> = T["failure"] extends never ? typeof S.Never : T["failure"]

type HandlerFull<Action extends AnyRequestModule, RT extends "raw" | "d", A, E, R> = {
  new(): {}
  _tag: RT
  stack: string
  handler: (
    req: S.Schema.Type<Action>
  ) => Effect<
    A,
    E,
    R
  >
}

export interface Handler<Action extends AnyRequestModule, RT extends "raw" | "d", R> extends
  HandlerFull<
    Action,
    RT,
    GetSuccessShape<Action, RT>,
    S.Schema.Type<GetFailure<Action>> | S.ParseResult.ParseError,
    R
  >
{
}

type AHandler<Action extends AnyRequestModule> = Handler<
  Action,
  any,
  any
>

type Filter<T> = {
  [K in keyof T as T[K] extends S.Schema.All & { success: S.Schema.Any; failure: S.Schema.Any } ? K : never]: T[K]
}

export const RouterSymbol = Symbol()
export interface RouterShape<Rsc> {
  [RouterSymbol]: Rsc
}

type RPCRouteR<T extends Rpc.Rpc<any, any>> = [T] extends [
  Rpc.Rpc<any, infer R>
] ? R
  : never

type RPCRouteReq<T extends Rpc.Rpc<any, any>> = [T] extends [
  Rpc.Rpc<infer Req, any>
] ? Req
  : never

type Match<
  Rsc extends Record<string, any>,
  CTXMap extends Record<string, any>,
  RT extends "raw" | "d",
  Key extends keyof Rsc,
  Context
> = {
  // TODO: deal with HandleVoid and ability to extends from GetSuccessShape...
  // aka we want to make sure that the return type is void if the success is void,
  // and make sure A is the actual expected type

  // note: the defaults of = never prevent the whole router to error
  <A extends GetSuccessShape<Rsc[Key], RT>, R2 = never, E = never>(
    f: Effect<A, E, R2>
  ): HandleVoid<
    GetSuccessShape<Rsc[Key], RT>,
    A,
    Handler<
      Rsc[Key],
      RT,
      Exclude<
        Context | Exclude<R2, GetEffectContext<CTXMap, Rsc[Key]["config"]>>,
        HttpRouter.HttpRouter.Provided
      >
    >
  >

  <A extends GetSuccessShape<Rsc[Key], RT>, R2 = never, E = never>(
    f: (req: S.Schema.Type<Rsc[Key]>) => Effect<A, E, R2>
  ): HandleVoid<
    GetSuccessShape<Rsc[Key], RT>,
    A,
    Handler<
      Rsc[Key],
      RT,
      Exclude<
        Context | Exclude<R2, GetEffectContext<CTXMap, Rsc[Key]["config"]>>,
        HttpRouter.HttpRouter.Provided
      >
    >
  >
}

export type RouteMatcher<
  CTXMap extends Record<string, any>,
  Rsc extends Record<string, any>,
  Context
> = {
  // use Rsc as Key over using Keys, so that the Go To on X.Action remain in tact in Controllers files
  /**
   * Requires the Type shape
   */
  [Key in keyof Filter<Rsc>]: Match<Rsc, CTXMap, "d", Key, Context> & {
    success: Rsc[Key]["success"]
    successRaw: S.SchemaClass<S.Schema.Encoded<Rsc[Key]["success"]>>
    failure: Rsc[Key]["failure"]
    /**
     * Requires the Encoded shape (e.g directly undecoded from DB, so that we don't do multiple Decode/Encode)
     */
    raw: Match<Rsc, CTXMap, "raw", Key, Context>
  }
}
// export interface RouteMatcher<
//   Filtered extends Record<string, any>,
//   CTXMap extends Record<string, any>,
//   Rsc extends Filtered
// > extends RouteMatcherInt<Filtered, CTXMap, Rsc> {}

export const makeMiddleware = <
  Context,
  CTXMap extends Record<string, RPCContextMap.Any>,
  RMW,
  Layers extends Array<Layer.Layer.Any>
>(content: Middleware<Context, CTXMap, RMW, Layers>): Middleware<Context, CTXMap, RMW, Layers> => content

export const makeRouter = <
  Context,
  CTXMap extends Record<string, RPCContextMap.Any>,
  RMW,
  Layers extends Array<Layer.Layer.Any>
>(
  middleware: Middleware<Context, CTXMap, RMW, Layers>,
  devMode: boolean
) => {
  function matchFor<
    const ModuleName extends string,
    const Rsc extends Record<string, any>
  >(
    rsc: Rsc & { meta: { moduleName: ModuleName } }
  ) {
    const meta = rsc.meta
    type Filtered = Filter<Rsc>
    const filtered = typedKeysOf(rsc).reduce((acc, cur) => {
      if (Predicate.isObject(rsc[cur]) && rsc[cur]["success"]) {
        acc[cur as keyof Filtered] = rsc[cur]
      }
      return acc
    }, {} as Filtered)

    const items = typedKeysOf(filtered).reduce(
      (prev, cur) => {
        ;(prev as any)[cur] = Object.assign((fnOrEffect: any) => {
          const stack = new Error().stack?.split("\n").slice(2).join("\n")
          return Effect.isEffect(fnOrEffect)
            ? class {
              static stack = stack
              static _tag = "d"
              static handler = () => fnOrEffect
            }
            : class {
              static stack = stack
              static _tag = "d"
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
              const stack = new Error().stack?.split("\n").slice(2).join("\n")
              return Effect.isEffect(fnOrEffect)
                ? class {
                  static stack = stack
                  static _tag = "raw"
                  static handler = () => fnOrEffect
                }
                : class {
                  static stack = stack
                  static _tag = "raw"
                  static handler = (req: any, ctx: any) => fnOrEffect(req, { ...ctx, Response: rsc[cur].success })
                }
            }
        })
        return prev
      },
      {} as RouteMatcher<CTXMap, Rsc, Context>
    )

    type Keys = keyof Filtered

    const effect = <
      E,
      R,
      THandlers extends {
        // import to keep them separate via | for type checking!!
        [K in Keys]: AHandler<Rsc[K]>
      },
      TLayers extends NonEmptyArray<Layer.Layer.Any>
    >(
      layers: TLayers,
      make: (requests: typeof items) => Effect<THandlers, E, R>
    ) => {
      type ProvidedLayers =
        | { [k in keyof Layers]: Layer.Layer.Success<Layers[k]> }[number]
        | { [k in keyof TLayers]: Layer.Layer.Success<TLayers[k]> }[number]
      type Router = RouterShape<Rsc>
      const r: HttpRouter.HttpRouter.TagClass<
        Router,
        `${typeof meta.moduleName}Router`,
        never,
        Exclude<
          | Context
          | RPCRouteR<
            { [K in keyof Filter<Rsc>]: Rpc.Rpc<Rsc[K], _R<ReturnType<THandlers[K]["handler"]>>> }[keyof Filter<Rsc>]
          >,
          | ProvidedLayers
          | HttpRouter.HttpRouter.Provided
        >
      > = (class Router extends HttpRouter.Tag(`${meta.moduleName}Router`)<Router>() {}) as any

      const layer = r.use((router) =>
        Effect.gen(function*() {
          const controllers = yield* make(items)
          const rpc = yield* makeRpc(middleware)

          // return make.pipe(Effect.map((c) => controllers(c, layers)))
          const mapped = typedKeysOf(filtered).reduce((acc, cur) => {
            const handler = controllers[cur as keyof typeof controllers]
            const req = rsc[cur]

            acc[cur] = rpc.effect(
              handler._tag === "raw"
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
              (req) =>
                // TODO: render more data... similar to console?
                Effect
                  .annotateCurrentSpan(
                    "requestInput",
                    Object.entries(req).reduce((prev, [key, value]: [string, unknown]) => {
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
                    Effect.zipRight(handler.handler(req as any) as any),
                    Effect.tapErrorCause((cause) => Cause.isFailure(cause) ? logRequestError(cause) : Effect.void),
                    Effect.tapDefect((cause) =>
                      Effect
                        .all([
                          reportRequestError(cause, {
                            action: `${meta.moduleName}.${req._tag}`
                          }),
                          Rpc.currentHeaders.pipe(Effect.andThen((headers) => {
                            return InfraLogger
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
                          }))
                        ])
                    ),
                    devMode ? (_) => _ : Effect.catchAllDefect(() => Effect.die("Internal Server Error")),
                    Effect.withSpan("Request." + meta.moduleName + "." + req._tag, {
                      captureStackTrace: () => handler.stack
                    })
                  ),
              meta.moduleName
            ) // TODO
            return acc
          }, {} as any) as {
            [K in Keys]: Rpc.Rpc<
              Rsc[K],
              Context | _R<ReturnType<THandlers[K]["handler"]>>
            >
          }

          const rpcRouter = RpcRouter.make(...Object.values(mapped) as any) as RpcRouter.RpcRouter<
            RPCRouteReq<typeof mapped[keyof typeof mapped]>,
            RPCRouteR<typeof mapped[keyof typeof mapped]>
          >
          const httpApp = toHttpApp(rpcRouter, {
            spanPrefix: rsc
              .meta
              .moduleName + "."
          })
          const services = (yield* Effect.context<never>()).pipe(
            Context.omit(Scope.Scope as never),
            Context.omit(Tracer.ParentSpan as never)
          )
          yield* router
            .post(
              "/",
              (httpApp
                .pipe(HttpMiddleware.make(Effect.provide(services)))) as any,
              // TODO: not queries.
              { uninterruptible: true }
            )
        })
      )

      // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion
      const routes = layer.pipe(
        Layer.provideMerge(r.Live),
        layers ? Layer.provide(layers) as any : (_) => _,
        middleware.dependencies ? Layer.provide(middleware.dependencies as any) : (_) => _
      ) as Layer.Layer<
        Router,
        { [k in keyof TLayers]: Layer.Layer.Error<TLayers[k]> }[number] | E,
        | { [k in keyof TLayers]: Layer.Layer.Context<TLayers[k]> }[number]
        | Exclude<
          RMW | R,
          ProvidedLayers
        >
      >

      // Effect.Effect<HttpRouter.HttpRouter<unknown, HttpRouter.HttpRouter.DefaultServices>, never, UserRouter>

      return {
        moduleName: meta.moduleName,
        Router: r,
        routes
      }
    }

    return effect
  }

  type HR<T> = T extends HttpRouter.HttpRouter<any, infer R> ? R : never
  type HE<T> = T extends HttpRouter.HttpRouter<infer E, any> ? E : never

  type RequestHandlersTest = {
    [key: string]: {
      Router: { router: Effect<HttpRouter.HttpRouter<any, any>, any, any> }
      routes: Layer.Layer<any, any, any>
      moduleName: string
    }
  }
  function matchAll<T extends RequestHandlersTest, A, E, R>(
    handlers: T,
    requestLayer: Layer.Layer<A, E, R>
  ) {
    const routers = typedValuesOf(handlers)

    const rootRouter = class extends HttpRouter.Tag("RootRouter")<
      "RootRouter",
      HR<Effect.Success<typeof handlers[keyof typeof handlers]["Router"]["router"]>>,
      HE<Effect.Success<typeof handlers[keyof typeof handlers]["Router"]["router"]>>
    >() {}

    const r = rootRouter
      .use((router) =>
        Effect.gen(function*() {
          for (const route of routers) {
            yield* router.mount(
              ("/rpc/" + route.moduleName) as any,
              yield* route
                .Router
                .router
                .pipe(Effect.map(HttpRouter.use(flow(Effect.provide(requestLayer))))) as any
            )
          }
        })
      )
      .pipe(Layer.provide(routers.map((r) => r.routes).flat() as unknown as NonEmptyArray<Layer.Layer.Any>))

    return {
      layer: r as Layer.Layer<
        never,
        Layer.Layer.Error<typeof handlers[keyof typeof handlers]["routes"]>,
        Layer.Layer.Context<typeof handlers[keyof typeof handlers]["routes"]>
      >,
      Router: rootRouter as any as HttpRouter.HttpRouter.TagClass<
        "RootRouter",
        "RootRouter",
        HE<Effect.Success<typeof handlers[keyof typeof handlers]["Router"]["router"]>>,
        R | Exclude<HR<Effect.Success<typeof handlers[keyof typeof handlers]["Router"]["router"]>>, A>
      >
    }
  }

  return { matchAll, matchFor }
}

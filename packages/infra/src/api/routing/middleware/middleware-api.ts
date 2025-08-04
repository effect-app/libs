import { Rpc } from "@effect/rpc"
import { Context, Effect, Layer, type NonEmptyArray, type NonEmptyReadonlyArray } from "effect-app"
import { type RPCContextMap } from "effect-app/client"
import { type LayerUtils } from "../../layerUtils.js"
import { type GenericMiddlewareMaker, genericMiddlewareMaker } from "./generic-middleware.js"
import { makeRpcEffect, type MiddlewareMakerId, type RPCHandlerFactory } from "./RouterMiddleware.js"
import { type AnyDynamic, type RpcDynamic, type TagClassAny } from "./RpcMiddleware.js"

export const contextMap = <
  RequestContextMap extends Record<string, RPCContextMap.Any>,
  Key extends keyof RequestContextMap
>(rcm: RequestContextMap, key: Key) => ({
  key,
  settings: { service: rcm[key]!["service"] } as RequestContextMap[Key]
})

export interface MiddlewareM<
  RequestContext extends Record<string, RPCContextMap.Any>,
  Provided extends keyof RequestContext,
  Middlewares extends ReadonlyArray<GenericMiddlewareMaker>,
  DynamicMiddlewareProviders,
  // out MiddlewareR = never
  MiddlewareR = never
> {
  middleware<MW extends NonEmptyArray<GenericMiddlewareMaker>>(
    ...mw: MW
  ): DynamicMiddlewareMakerrsss<
    RequestContext,
    Provided,
    [...Middlewares, ...MW],
    DynamicMiddlewareProviders,
    GenericMiddlewareMaker.ApplyManyServices<MW, MiddlewareR>
  >
}

type GetDependsOnKeys<MW extends GenericMiddlewareMaker> = MW extends { dependsOn: NonEmptyReadonlyArray<TagClassAny> }
  ? {
    [K in keyof MW["dependsOn"]]: MW["dependsOn"][K] extends AnyDynamic ? MW["dependsOn"][K]["dynamic"]["key"]
      : never
  }[keyof MW["dependsOn"]]
  : never

export interface MiddlewareDynamic<
  RequestContext extends Record<string, RPCContextMap.Any>,
  Provided extends keyof RequestContext,
  Middlewares extends ReadonlyArray<GenericMiddlewareMaker>,
  DynamicMiddlewareProviders,
  out MiddlewareR
> {
  middleware<MW extends NonEmptyArray<GenericMiddlewareMaker>>(
    ...mw: MW
  ): MW extends NonEmptyArray<{ dynamic: RpcDynamic<any, RequestContext[keyof RequestContext]> }>
    ? DynamicMiddlewareMakerrsss<
      RequestContext,
      // when one dynamic middleware depends on another, substract the key, to enforce the dependency to be provided after.
      Exclude<
        Provided | MW[number]["dynamic"]["key"],
        { [K in keyof MW]: GetDependsOnKeys<MW[K]> }[number]
      >,
      [...Middlewares, ...MW],
      & DynamicMiddlewareProviders
      & {
        [U in MW[number] as U["dynamic"]["key"]]: U
      },
      GenericMiddlewareMaker.ApplyManyServices<MW, MiddlewareR>
    >
    : DynamicMiddlewareMakerrsss<
      RequestContext,
      Provided,
      [...Middlewares, ...MW],
      DynamicMiddlewareProviders,
      GenericMiddlewareMaker.ApplyManyServices<MW, MiddlewareR>
    >
}

type DynamicMiddlewareMakerrsss<
  RequestContext extends Record<string, RPCContextMap.Any>,
  Provided extends keyof RequestContext = never,
  Middlewares extends ReadonlyArray<GenericMiddlewareMaker> = [],
  DynamicMiddlewareProviders = unknown,
  MiddlewareR = never
> = keyof Omit<RequestContext, Provided> extends never ? [MiddlewareR] extends [never] ?
      & ReturnType<
        typeof makeMiddlewareBasic<
          RequestContext,
          Middlewares
        >
      >
      & MiddlewareM<
        RequestContext,
        Provided,
        Middlewares,
        DynamicMiddlewareProviders,
        MiddlewareR
      >
  : MiddlewareM<
    RequestContext,
    Provided,
    Middlewares,
    DynamicMiddlewareProviders,
    MiddlewareR
  >
  : MiddlewareDynamic<
    RequestContext,
    Provided,
    Middlewares,
    DynamicMiddlewareProviders,
    MiddlewareR
  >

export const makeMiddleware: <
  RequestContextMap extends Record<string, RPCContextMap.Any>
>() => DynamicMiddlewareMakerrsss<RequestContextMap> = () => {
  let allMiddleware: GenericMiddlewareMaker[] = []
  const it = {
    middleware: (...middlewares: any[]) => {
      for (const mw of middlewares) {
        allMiddleware = [mw, ...allMiddleware]
      }
      // TODO: support dynamic and generic intertwined. treat them as one
      return Object.assign(makeMiddlewareBasic<any, any>(...allMiddleware), it)
    }
  }
  return it as any
}

export const makeMiddlewareBasic =
  // by setting RequestContextMap beforehand, execute contextual typing does not fuck up itself to anys
  <
    RequestContextMap extends Record<string, RPCContextMap.Any>,
    // RequestContextProviders extends RequestContextMapProvider<RequestContextMap>, // how to resolve the dynamic middleware
    GenericMiddlewareProviders extends ReadonlyArray<GenericMiddlewareMaker>
  >(
    ...make: GenericMiddlewareProviders
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

    const middlewares = genericMiddlewareMaker(...make)

    const l = Layer.scoped(
      MiddlewareMaker,
      middlewares
        .effect
        .pipe(
          Effect.map((generic) => ({
            _tag: "MiddlewareMaker" as const,
            effect: makeRpcEffect<
              RequestContextMap,
              GenericMiddlewareMaker.Provided<GenericMiddlewareProviders[number]>
            >()(
              (schema, next, moduleName) => {
                return (payload, headers) =>
                  Effect
                    .gen(function*() {
                      const basic = {
                        config: schema.config ?? {},
                        payload,
                        headers,
                        clientId: 0, // TODO: get the clientId from the request context
                        rpc: {
                          ...Rpc.fromTaggedRequest(schema as any),
                          key: `${moduleName}.${payload._tag}`,
                          _tag: `${moduleName}.${payload._tag}`
                        }
                      }
                      return yield* generic({
                        ...basic,
                        next: next(payload, headers) as any
                      })
                    }) as any // why?
              }
            )
          }))
        )
    )

    const middlewareLayer = l
      .pipe(
        Layer.provide(middlewares.dependencies as any)
      ) as Layer.Layer<
        MiddlewareMakerId,
        LayerUtils.GetLayersError<typeof middlewares.dependencies>, // what could go wrong when building the dynamic middleware provider
        LayerUtils.GetLayersContext<typeof middlewares.dependencies>
      >

    return Object.assign(MiddlewareMaker, { Default: middlewareLayer })
  }

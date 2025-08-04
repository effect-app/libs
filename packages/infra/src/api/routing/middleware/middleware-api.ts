import { Rpc } from "@effect/rpc"
import { Context, Effect, Layer, type NonEmptyArray, type NonEmptyReadonlyArray } from "effect-app"
import { type RPCContextMap } from "effect-app/client"
import { type LayerUtils } from "../../layerUtils.js"
import { type GenericMiddlewareMaker, genericMiddlewareMaker } from "./generic-middleware.js"
import { makeRpcEffect, type MiddlewareMakerId, type RPCHandlerFactory } from "./RouterMiddleware.js"
import { type AnyDynamic, type RpcDynamic, type TagClassAny } from "./RpcMiddleware.js"

// adapter used when setting the dynamic prop on a middleware implementation
export const contextMap = <
  RequestContextMap extends Record<string, RPCContextMap.Any>,
  Key extends (keyof RequestContextMap) & string
>(rcm: RequestContextMap, key: Key): RpcDynamic<Key, RequestContextMap[Key]> => ({
  key,
  settings: { service: rcm[key]!["service"] } as RequestContextMap[Key]
})

// the following implements sort of builder pattern

export interface MiddlewareM<
  RequestContextMap extends Record<string, RPCContextMap.Any>,
  Provided extends keyof RequestContextMap,
  Middlewares extends ReadonlyArray<GenericMiddlewareMaker>,
  DynamicMiddlewareProviders,
  // out MiddlewareR = never
  MiddlewareR = never
> {
  middleware<MW extends NonEmptyArray<GenericMiddlewareMaker>>(
    ...mw: MW
  ): MiddlewaresBuilder<
    RequestContextMap,
    Provided,
    [...Middlewares, ...MW],
    DynamicMiddlewareProviders,
    GenericMiddlewareMaker.ApplyManyServices<MW, MiddlewareR>
  >
}

// it's for dynamic middlewares
type GetDependsOnKeys<MW extends GenericMiddlewareMaker> = MW extends { dependsOn: NonEmptyReadonlyArray<TagClassAny> }
  ? {
    [K in keyof MW["dependsOn"]]: MW["dependsOn"][K] extends AnyDynamic ? MW["dependsOn"][K]["dynamic"]["key"]
      : never
  }[keyof MW["dependsOn"]]
  : never

type FilterInDynamicMiddlewares<
  MW extends ReadonlyArray<GenericMiddlewareMaker>,
  RequestContextMap extends Record<string, RPCContextMap.Any>
> = {
  [K in keyof MW]: MW[K] extends { dynamic: RpcDynamic<any, RequestContextMap[keyof RequestContextMap]> } ? MW[K]
    : never
}

export interface MiddlewareDynamic<
  RequestContextMap extends Record<string, RPCContextMap.Any>,
  Provided extends keyof RequestContextMap,
  Middlewares extends ReadonlyArray<GenericMiddlewareMaker>,
  DynamicMiddlewareProviders,
  out MiddlewareR
> {
  middleware<MW extends NonEmptyArray<GenericMiddlewareMaker>>(
    ...mw: MW
  ): MiddlewaresBuilder<
    RequestContextMap,
    // when one dynamic middleware depends on another, subtract the key to enforce the dependency to be provided after
    // (if already provided, it would have to be re-provided anyway, so better to provide it after)
    Exclude<
      Provided | FilterInDynamicMiddlewares<MW, RequestContextMap>[number]["dynamic"]["key"],
      // whole MW is fine here because only dynamic middlewares will have 'dependsOn' prop
      { [K in keyof MW]: GetDependsOnKeys<MW[K]> }[number]
    >,
    [...Middlewares, ...MW],
    & DynamicMiddlewareProviders
    & {
      [U in FilterInDynamicMiddlewares<MW, RequestContextMap>[number] as U["dynamic"]["key"]]: U
    },
    GenericMiddlewareMaker.ApplyManyServices<MW, MiddlewareR>
  >
}

export type MiddlewaresBuilder<
  RequestContextMap extends Record<string, RPCContextMap.Any>,
  Provided extends keyof RequestContextMap = never,
  Middlewares extends ReadonlyArray<GenericMiddlewareMaker> = [],
  DynamicMiddlewareProviders = unknown,
  MiddlewareR = never
> =
  //  keyof Omit<RequestContextMap, Provided> extends never is true when all the dynamic middlewares are provided
  // MiddlewareR is never when all the required services from generic middlewares are provided
  keyof Omit<RequestContextMap, Provided> extends never ? [MiddlewareR] extends [never] ?
        & ReturnType<
          typeof makeMiddlewareBasic<
            RequestContextMap,
            Middlewares
          >
        >
        & MiddlewareM<
          RequestContextMap,
          Provided,
          Middlewares,
          DynamicMiddlewareProviders,
          MiddlewareR
        >
    : MiddlewareM<
      RequestContextMap,
      Provided,
      Middlewares,
      DynamicMiddlewareProviders,
      MiddlewareR
    >
    : MiddlewareDynamic<
      RequestContextMap,
      Provided,
      Middlewares,
      DynamicMiddlewareProviders,
      MiddlewareR
    >

export const makeMiddleware: <
  RequestContextMap extends Record<string, RPCContextMap.Any>
>(rcm: RequestContextMap) => MiddlewaresBuilder<RequestContextMap> = (rcm) => {
  let allMiddleware: GenericMiddlewareMaker[] = []
  const it = {
    middleware: (...middlewares: any[]) => {
      for (const mw of middlewares) {
        allMiddleware = [mw, ...allMiddleware]
      }
      // TODO: support dynamic and generic intertwined. treat them as one
      return allMiddleware.filter((m) => !!m.dynamic).length === Object.keys(rcm).length
        ? Object.assign(makeMiddlewareBasic<any, any>(...allMiddleware), it)
        : it
    }
  }
  return it as any
}

const makeMiddlewareBasic =
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

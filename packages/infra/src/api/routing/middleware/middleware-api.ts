import { Rpc } from "@effect/rpc"
import { Context, Effect, Layer, type NonEmptyArray } from "effect-app"
import { type RPCContextMap } from "effect-app/client"
import { type LayerUtils } from "../../layerUtils.js"
import { type DynamicMiddlewareMaker, type GenericMiddlewareMaker, genericMiddlewareMaker, makeRpcEffect, type MiddlewareMakerId, type RequestContextMapProvider, type RpcDynamic, type RPCHandlerFactory } from "../../routing.js"

// TODO: ContextMap should be physical Tag (so typeof Tag), so that we can retrieve Identifier and Service separately.
// in Service classes and TagId, the Id and Service are the same, but don't have to be in classic Tag or GenericTag.
export const contextMap =
  <RequestContextMap extends Record<string, RPCContextMap.Any>>() => <K extends keyof RequestContextMap>(a: K) => ({
    key: a,
    settings: null as any as RequestContextMap[typeof a]
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

export interface MiddlewareDynamic<
  RequestContext extends Record<string, RPCContextMap.Any>,
  Provided extends keyof RequestContext,
  Middlewares extends ReadonlyArray<GenericMiddlewareMaker>,
  DynamicMiddlewareProviders,
  out MiddlewareR
> {
  // TODO: this still allows to mix both types of middleware but with bad typing result
  // either have to block it, or implement the support properly.
  middleware<MW extends NonEmptyArray<GenericMiddlewareMaker>>(
    ...mw: MW
  ): [MW] extends [NonEmptyArray<{ dynamic: RpcDynamic<any, RequestContext[keyof RequestContext]> }>]
    ? DynamicMiddlewareMakerrsss<
      RequestContext,
      Provided | MW[number]["dynamic"]["key"],
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

type GetDynamicMiddleware<T, RequestContext extends Record<string, RPCContextMap.Any>> = T extends
  RequestContextMapProvider<RequestContext> ? T : never

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
          // DynamicMiddlewareProviders,
          Middlewares
        >
      >
      // & {
      //   MiddlewareR: MiddlewareR
      //   Provided: Provided
      //   Middlewares: Middlewares
      //   DynamicMiddlewareProviders: Simplify<DynamicMiddlewareProviders>
      // }
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

export const makeNewMiddleware: <
  RequestContextMap extends Record<string, RPCContextMap.Any>
>() => DynamicMiddlewareMakerrsss<RequestContextMap> = () => {
  let capturedMiddlewares: (DynamicMiddlewareMaker<any> | GenericMiddlewareMaker)[] = []
  const it = {
    middleware: (...middlewares: any[]) => {
      for (const mw of middlewares) {
        capturedMiddlewares = [mw, ...capturedMiddlewares]
        if (mw.dynamic) {
          console.log("Adding dynamic middleware", mw.key, mw.dynamic.key)
        } else {
          console.log("Adding generic middleware", mw.key)
        }
      }
      // TODO: support dynamic and generic intertwined. treat them as one
      return Object.assign(makeMiddlewareBasic<any, any>(...capturedMiddlewares), it)
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

    // const dynamicMiddlewares = implementMiddleware<RequestContextMap>()(make.dynamicMiddlewares)
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
                          // middlewares ? // todo: get from actual middleware flow?
                          annotations: Context.empty(), // TODO //Annotations(schema as any),
                          // successSchema: schema.success ?? Schema.Void,
                          // errorSchema: schema.failure ?? Schema.Never,
                          payloadSchema: schema,
                          _tag: `${moduleName}.${payload._tag}`,
                          key: `${moduleName}.${payload._tag}` /* ? */
                          // clientId: 0 as number /* ? */
                        }
                      }
                      return yield* generic({
                        ...basic,
                        next: next as any
                      })
                    }) as any // why?
              }
            )
          }))
        )
    )

    const dependencies = [
      ...middlewares.dependencies
    ]
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

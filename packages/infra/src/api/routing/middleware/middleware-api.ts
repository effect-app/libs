import { type AnyWithProps } from "@effect/rpc/Rpc"
import { Context, type Layer, type NonEmptyArray, type NonEmptyReadonlyArray } from "effect-app"
import { type GetContextConfig, type RPCContextMap } from "effect-app/client"
import { type LayerUtils } from "../../layerUtils.js"
import { type GenericMiddlewareMaker, genericMiddlewareMaker } from "./generic-middleware.js"
import { type AnyDynamic, type RpcDynamic, Tag, type TagClassAny } from "./RpcMiddleware.js"

// adapter used when setting the dynamic prop on a middleware implementation
export const contextMap = <
  RequestContextMap extends Record<string, RPCContextMap.Any>,
  Key extends (keyof RequestContextMap) & string
>(rcm: RequestContextMap, key: Key): RpcDynamic<Key, RequestContextMap[Key]> => ({
  key,
  settings: { service: rcm[key]!["service"] } as RequestContextMap[Key]
})

export const getConfig = <
  RequestContextMap extends Record<string, RPCContextMap.Any>
>() =>
(rpc: AnyWithProps): GetContextConfig<RequestContextMap> => {
  return Context.unsafeGet(rpc.annotations, Context.GenericTag("RequestContextConfig"))
}

// the following implements sort of builder pattern
// we support both sideways and upwards elimination of dependencies

// it's for dynamic middlewares
type GetDependsOnKeys<MW extends GenericMiddlewareMaker> = MW extends { dependsOn: NonEmptyReadonlyArray<TagClassAny> }
  ? {
    [K in keyof MW["dependsOn"]]: MW["dependsOn"][K] extends AnyDynamic ? MW["dependsOn"][K]["dynamic"]["key"]
      : never
  }[keyof MW["dependsOn"]]
  : never

type FilterInDynamicMiddlewares<
  MWs extends ReadonlyArray<GenericMiddlewareMaker>,
  RequestContextMap extends Record<string, RPCContextMap.Any>
> = {
  [K in keyof MWs]: MWs[K] extends { dynamic: RpcDynamic<any, RequestContextMap[keyof RequestContextMap]> } ? MWs[K]
    : never
}

type RecursiveHandleMWsSideways<
  MWs,
  R extends {
    rcm: Record<string, RPCContextMap.Any>
    provided: keyof R["rcm"] // that's fine
    middlewares: ReadonlyArray<GenericMiddlewareMaker>
    dmp: any
    middlewareR: any
  }
> = MWs extends [
  infer F extends GenericMiddlewareMaker,
  ...infer Rest extends ReadonlyArray<GenericMiddlewareMaker>
] ? RecursiveHandleMWsSideways<Rest, {
    rcm: R["rcm"]
    // when one dynamic middleware depends on another, subtract the key to enforce the dependency to be provided after
    // (if already provided, it would have to be re-provided anyway, so better to provide it after)
    provided: Exclude<
      R["provided"] | FilterInDynamicMiddlewares<[F], R["rcm"]>[number]["dynamic"]["key"],
      // F is fine here because only dynamic middlewares will have 'dependsOn' prop
      GetDependsOnKeys<F>
    >
    middlewares: [...R["middlewares"], F]
    dmp: [FilterInDynamicMiddlewares<[F], R["rcm"]>[number]] extends [never] ? R["dmp"]
      :
        & R["dmp"]
        & {
          [U in FilterInDynamicMiddlewares<[F], R["rcm"]>[number] as U["dynamic"]["key"]]: U
        }
    middlewareR: GenericMiddlewareMaker.ApplyManyServices<[F], R["middlewareR"]>
  }>
  : R

export interface BuildingMiddleware<
  RequestContextMap extends Record<string, RPCContextMap.Any>,
  Provided extends keyof RequestContextMap,
  Middlewares extends ReadonlyArray<GenericMiddlewareMaker>,
  DynamicMiddlewareProviders,
  out MiddlewareR extends { _tag: string } = never
> {
  middleware<MWs extends NonEmptyArray<GenericMiddlewareMaker>>(
    ...mw: MWs
  ): RecursiveHandleMWsSideways<MWs, {
    rcm: RequestContextMap
    provided: Provided
    middlewares: Middlewares
    dmp: DynamicMiddlewareProviders
    middlewareR: MiddlewareR
  }> extends infer Res extends {
    rcm: RequestContextMap
    provided: keyof RequestContextMap
    middlewares: ReadonlyArray<GenericMiddlewareMaker>
    dmp: any
    middlewareR: any
  } ? MiddlewaresBuilder<
      Res["rcm"],
      Res["provided"],
      Res["middlewares"],
      Res["dmp"],
      Res["middlewareR"]
    >
    : never

  // helps debugging what are the missing requirements (type only)
  missing: {
    missingDynamicMiddlewares: Exclude<keyof RequestContextMap, Provided>
    missingContext: MiddlewareR
  }
}

export type MiddlewaresBuilder<
  RequestContextMap extends Record<string, RPCContextMap.Any>,
  Provided extends keyof RequestContextMap = never,
  Middlewares extends ReadonlyArray<GenericMiddlewareMaker> = [],
  DynamicMiddlewareProviders = unknown,
  MiddlewareR extends { _tag: string } = never
> =
  //  keyof Omit<RequestContextMap, Provided> extends never is true when all the dynamic middlewares are provided
  // MiddlewareR is never when all the required services from generic & dynamic middlewares are provided
  keyof Omit<RequestContextMap, Provided> extends never ? [MiddlewareR] extends [never] ? ReturnType<
        typeof makeMiddlewareBasic<
          RequestContextMap,
          Middlewares
        >
      >
    : BuildingMiddleware<
      RequestContextMap,
      Provided,
      Middlewares,
      DynamicMiddlewareProviders,
      MiddlewareR
    >
    : BuildingMiddleware<
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
        // recall that we run middlewares in reverse order
        allMiddleware = [mw, ...allMiddleware]
      }
      return allMiddleware.filter((m) => !!m.dynamic).length !== Object.keys(rcm).length
        // for sure, until all the dynamic middlewares are provided it's non sensical to call makeMiddlewareBasic
        ? it
        // actually, we don't know yet if MiddlewareR is never, but we can't easily check it at runtime
        : Object.assign(makeMiddlewareBasic<any, any>(rcm, ...allMiddleware), it)
    }
  }
  return it as any
}

//
export interface MiddlewareMakerId {
  readonly _id: unique symbol
}

const makeMiddlewareBasic =
  // by setting RequestContextMap beforehand, execute contextual typing does not fuck up itself to anys
  <
    RequestContextMap extends Record<string, RPCContextMap.Any>,
    GenericMiddlewareProviders extends ReadonlyArray<GenericMiddlewareMaker>
  >(
    _rcm: RequestContextMap,
    ...make: GenericMiddlewareProviders
  ) => {
    // reverse middlewares and wrap one after the other
    const middlewares = genericMiddlewareMaker(...make)

    const MiddlewareMaker = Tag<MiddlewareMakerId>()("MiddlewareMaker", {
      provides: null as unknown as [
        Context.Tag<
          GenericMiddlewareMaker.Provided<GenericMiddlewareProviders[number]>,
          GenericMiddlewareMaker.Provided<GenericMiddlewareProviders[number]>
        >
      ],
      wrap: true
    })(middlewares as any)

    // add to the tag a default implementation
    return Object.assign(MiddlewareMaker, {
      Default: MiddlewareMaker.Default as Layer.Layer<
        MiddlewareMakerId,
        // what could go wrong when building the dynamic middleware provider
        LayerUtils.GetLayersError<typeof middlewares.dependencies>,
        LayerUtils.GetLayersContext<typeof middlewares.dependencies>
      >,
      requestContext: Context.GenericTag<"RequestContextConfig", GetContextConfig<RequestContextMap>>(
        "RequestContextConfig"
      )
    })
  }

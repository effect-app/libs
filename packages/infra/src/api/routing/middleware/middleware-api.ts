import { Array, Either, type NonEmptyArray } from "effect-app"
import { type RPCContextMap } from "effect-app/client"
import { type DynamicMiddlewareMaker, type GenericMiddlewareMaker, makeMiddleware, type makeMiddlewareBasic, type RequestContextMapProvider } from "../../routing.js"

// TODO: ContextMap should be physical Tag (so typeof Tag), so that we can retrieve Identifier and Service separately.
// in Service classes and TagId, the Id and Service are the same, but don't have to be in classic Tag or GenericTag.
export const contextMap = <RequestContextMap>() => <K extends keyof RequestContextMap>(a: K) => ({
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
  middleware<MW extends NonEmptyArray<DynamicMiddlewareMaker<RequestContext>> | NonEmptyArray<GenericMiddlewareMaker>>(
    ...mw: MW
  ): [MW] extends [NonEmptyArray<DynamicMiddlewareMaker<RequestContext>>] ? DynamicMiddlewareMakerrsss<
      RequestContext,
      Provided | MW[number]["dynamic"]["key"],
      Middlewares,
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
          GetDynamicMiddleware<DynamicMiddlewareProviders, RequestContext>,
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
  const make = makeMiddleware<any>()
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
      const [genericMiddlewares, dyn] = Array.partitionMap(
        capturedMiddlewares,
        (mw) =>
          "dynamic" in mw && mw.dynamic
            ? Either.right(mw as DynamicMiddlewareMaker<any>)
            : Either.left(mw as GenericMiddlewareMaker)
      )
      const dynamicMiddlewares = dyn.reduce(
        (prev, cur) => ({ ...prev, [cur.dynamic.key]: cur }),
        {} as Record<string, any>
      )
      // TODO: support dynamic and generic intertwined. treat them as one
      return Object.assign(make({ genericMiddlewares, dynamicMiddlewares }), it)
    }
  }
  return it as any
}

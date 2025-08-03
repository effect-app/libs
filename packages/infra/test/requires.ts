import { type NonEmptyReadonlyArray } from "effect-app"
import { type RPCContextMap } from "effect-app/client"
import { type DynamicMiddlewareMaker, type GenericMiddlewareMaker, makeMiddleware, type makeMiddlewareBasic, type RequestContextMapProvider } from "../src/api/routing.js"

export interface MiddlewareM<
  RequestContext extends Record<string, RPCContextMap.Any>,
  Provided extends keyof RequestContext,
  Middlewares extends ReadonlyArray<GenericMiddlewareMaker>,
  DynamicMiddlewareProviders extends RequestContextMapProvider<RequestContext>,
  // out MiddlewareR = never
  MiddlewareR = never
> {
  middleware: <MW extends GenericMiddlewareMaker>(
    mw: MW
  ) => DynamicMiddlewareMakerrsss<
    RequestContext,
    Provided,
    [...Middlewares, MW],
    DynamicMiddlewareProviders,
    GenericMiddlewareMaker.ApplyServices<MW, MiddlewareR>
  >
}

export interface Dynamic<
  RequestContext extends Record<string, RPCContextMap.Any>,
  Provided extends keyof RequestContext,
  Middlewares extends ReadonlyArray<GenericMiddlewareMaker>,
  DynamicMiddlewareProviders extends RequestContextMapProvider<RequestContext>,
  out MiddlewareR = never
> extends
  MiddlewareM<
    RequestContext,
    Provided,
    Middlewares,
    DynamicMiddlewareProviders,
    MiddlewareR
  >
{
  addDynamicMiddleware: <MW extends NonEmptyReadonlyArray<DynamicMiddlewareMaker<RequestContext>>>(
    ...middlewares: MW
  ) => DynamicMiddlewareMakerrsss<
    RequestContext,
    Provided | MW[number]["dynamic"]["key"],
    Middlewares,
    & DynamicMiddlewareProviders
    & {
      [K in keyof MW as MW[K] extends DynamicMiddlewareMaker<RequestContext> ? MW[K]["dynamic"]["key"] : never]: MW[K]
    },
    MiddlewareR
  > // GenericMiddlewareMaker.ApplyServices<MW, MiddlewareR>
}

type DynamicMiddlewareMakerrsss<
  RequestContext extends Record<string, RPCContextMap.Any>,
  Provided extends keyof RequestContext,
  Middlewares extends ReadonlyArray<GenericMiddlewareMaker>,
  DynamicMiddlewareProviders extends RequestContextMapProvider<RequestContext> = never,
  MiddlewareR = never
> = keyof Omit<RequestContext, Provided> extends never ? [MiddlewareR] extends [never] ?
      & ReturnType<typeof makeMiddlewareBasic<RequestContext, DynamicMiddlewareProviders, Middlewares>>
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
  : Dynamic<RequestContext, Provided, Middlewares, DynamicMiddlewareProviders, MiddlewareR>

export const makeNewMiddleware: <
  RequestContextMap extends Record<string, RPCContextMap.Any>
>() => DynamicMiddlewareMakerrsss<RequestContextMap, never, [], never> = () => {
  const dynamicMiddlewares: Record<string, any> = {} as any
  const make = makeMiddleware<any>()
  let genericMiddlewares: GenericMiddlewareMaker[] = []
  const it = {
    middleware: <MW extends GenericMiddlewareMaker>(mw: MW) => {
      genericMiddlewares = [mw, ...genericMiddlewares] as any
      return Object.assign(make({ genericMiddlewares, dynamicMiddlewares }), it)
    },
    addDynamicMiddleware: (...middlewares: any[]) => {
      for (const a of middlewares) {
        console.log("Adding dynamic middleware", a, a.dynamic, Object.keys(a))
        dynamicMiddlewares[a.dynamic.key] = a
      }
      return Object.assign(make({ genericMiddlewares, dynamicMiddlewares }), it)
    }
  }
  return it as any
}

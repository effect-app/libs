import { type RPCContextMap } from "effect-app/client"
import { type DynamicMiddlewareMaker, type GenericMiddlewareMaker, makeMiddleware, type makeMiddlewareBasic, type RequestContextMapProvider } from "../src/api/routing.js"

export interface MiddlewareM<
  RequestContext extends Record<string, RPCContextMap.Any>,
  Provided extends keyof RequestContext,
  Middlewares extends ReadonlyArray<GenericMiddlewareMaker>,
  DynamicMiddlewareProviders,
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
  DynamicMiddlewareProviders,
  out MiddlewareR
> extends
  MiddlewareM<
    RequestContext,
    Provided,
    Middlewares,
    DynamicMiddlewareProviders,
    MiddlewareR
  >
{
  middleware: <MW extends DynamicMiddlewareMaker<RequestContext> | GenericMiddlewareMaker>(
    mw: MW
  ) => MW extends DynamicMiddlewareMaker<RequestContext> ? DynamicMiddlewareMakerrsss<
      RequestContext,
      Provided | MW["dynamic"]["key"],
      Middlewares,
      & DynamicMiddlewareProviders
      & {
        [K in MW["dynamic"]["key"]]: MW
      },
      GenericMiddlewareMaker.ApplyServices<MW, MiddlewareR>
    >
    : DynamicMiddlewareMakerrsss<
      RequestContext,
      Provided,
      [...Middlewares, MW],
      DynamicMiddlewareProviders,
      GenericMiddlewareMaker.ApplyServices<MW, MiddlewareR>
    >
  // addDynamicMiddleware: <MW extends NonEmptyReadonlyArray<DynamicMiddlewareMaker<RequestContext>>>(
  //   ...middlewares: MW
  // ) => DynamicMiddlewareMakerrsss<
  //   RequestContext,
  //   Provided | MW[number]["dynamic"]["key"],
  //   Middlewares,
  //   & DynamicMiddlewareProviders
  //   & {
  //     [K in keyof MW as MW[K] extends DynamicMiddlewareMaker<RequestContext> ? MW[K]["dynamic"]["key"] : never]: MW[K]
  //   },
  //   MiddlewareR // TODO GenericMiddlewareMaker.ApplyServices<MW, MiddlewareR>
  // > // GenericMiddlewareMaker.ApplyServices<MW, MiddlewareR>
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
  : Dynamic<
    RequestContext,
    Provided,
    Middlewares,
    DynamicMiddlewareProviders,
    MiddlewareR
  >

export const makeNewMiddleware: <
  RequestContextMap extends Record<string, RPCContextMap.Any>
>() => DynamicMiddlewareMakerrsss<RequestContextMap> = () => {
  const dynamicMiddlewares: Record<string, any> = {} as any
  const make = makeMiddleware<any>()
  let genericMiddlewares: GenericMiddlewareMaker[] = []
  const it = {
    middleware: (...middlewares: any[]) => {
      for (const mw of middlewares) {
        if (mw.dynamic) {
          console.log("Adding dynamic middleware", mw.key, mw.dynamic.key)
          dynamicMiddlewares[mw.dynamic.key] = mw
        } else {
          console.log("Adding generic middleware", mw.key)
          genericMiddlewares = [mw, ...genericMiddlewares] as any
        }
      }
      return Object.assign(make({ genericMiddlewares, dynamicMiddlewares }), it)
    }
  }
  return it as any
}

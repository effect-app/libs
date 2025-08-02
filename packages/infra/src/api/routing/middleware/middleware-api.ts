import { type NonEmptyReadonlyArray } from "effect-app"
import { type RPCContextMap } from "effect-app/client"
import { type DynamicMiddlewareMaker, type GenericMiddlewareMaker, makeMiddleware, type makeMiddlewareBasic, type RequestContextMapProvider } from "../../routing.js"

export const contextMap = <RequestContextMap>() => <K extends keyof RequestContextMap>(a: K) => ({
  key: a,
  settings: null as any as RequestContextMap[typeof a]
})

type DynamicMiddlewareMakerrsss<
  RequestContext extends Record<string, RPCContextMap.Any>,
  Provided extends keyof RequestContext,
  Middlewares extends NonEmptyReadonlyArray<GenericMiddlewareMaker>,
  DynamicMiddlewareProviders extends RequestContextMapProvider<RequestContext>
> = keyof Omit<RequestContext, Provided> extends never
  ? { make: () => ReturnType<typeof makeMiddlewareBasic<RequestContext, DynamicMiddlewareProviders, Middlewares>> }
  : {
    addDynamicMiddleware: <MW extends DynamicMiddlewareMaker<RequestContext>>(
      a: MW
    ) => DynamicMiddlewareMakerrsss<
      RequestContext,
      Provided | MW["dynamic"]["key"],
      Middlewares,
      DynamicMiddlewareProviders & { [K in MW["dynamic"]["key"]]: MW }
    > // TODO: any of RequestContecxtMap, and track them, so remove the ones provided
  }

export const makeNewMiddleware: <
  RequestContextMap extends Record<string, RPCContextMap.Any>
>() => <Middlewares extends NonEmptyReadonlyArray<GenericMiddlewareMaker>>(
  ...genericMiddlewares: Middlewares
) => DynamicMiddlewareMakerrsss<RequestContextMap, never, Middlewares, never> = (...genericMiddlewares) => {
  const dynamicMiddlewares: Record<keyof any, any> = {} as any
  const make = makeMiddleware<any>()
  const it = {
    addDynamicMiddleware: (a: any) => {
      ;(dynamicMiddlewares as any)[a.dynamic.key] = a
      return it
    },
    make: () => make({ genericMiddlewares: genericMiddlewares as any, dynamicMiddlewares })
  }
  return it as any
}

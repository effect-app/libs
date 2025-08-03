import { type NonEmptyReadonlyArray } from "effect-app"
import { type RPCContextMap } from "effect-app/client"
import { type DynamicMiddlewareMaker, type GenericMiddlewareMaker, makeMiddleware, type makeMiddlewareBasic, type RequestContextMapProvider } from "../../routing.js"

// TODO: ContextMap should be physical Tag (so typeof Tag), so that we can retrieve Identifier and Service separately.
// in Service classes and TagId, the Id and Service are the same, but don't have to be in classic Tag or GenericTag.
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
  ? ReturnType<typeof makeMiddlewareBasic<RequestContext, DynamicMiddlewareProviders, Middlewares>>
  : {
    addDynamicMiddleware: <MW extends NonEmptyReadonlyArray<DynamicMiddlewareMaker<RequestContext>>>(
      ...middlewares: MW
    ) => DynamicMiddlewareMakerrsss<
      RequestContext,
      Provided | MW[number]["dynamic"]["key"],
      Middlewares,
      & DynamicMiddlewareProviders
      & {
        [K in keyof MW as MW[K] extends DynamicMiddlewareMaker<RequestContext> ? MW[K]["dynamic"]["key"] : never]: MW[K]
      }
    >
  }

export const makeNewMiddleware: <
  RequestContextMap extends Record<string, RPCContextMap.Any>
>() => <Middlewares extends NonEmptyReadonlyArray<GenericMiddlewareMaker>>(
  ...genericMiddlewares: Middlewares
) => DynamicMiddlewareMakerrsss<RequestContextMap, never, Middlewares, never> = () => (...genericMiddlewares) => {
  const dynamicMiddlewares: Record<string, any> = {} as any
  const make = makeMiddleware<any>()
  const it = {
    addDynamicMiddleware: (...middlewares: any[]) => {
      for (const a of middlewares) {
        console.log("Adding dynamic middleware", a, a.dynamic, Object.keys(a))
        dynamicMiddlewares[a.dynamic.key] = a
      }
      return Object.assign(make({ genericMiddlewares: genericMiddlewares as any, dynamicMiddlewares }), it)
    }
  }
  return it as any
}

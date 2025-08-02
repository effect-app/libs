import { type NonEmptyReadonlyArray } from "effect-app"
import { type RPCContextMap } from "effect-app/client"
import { type DynamicMiddlewareMaker, type GenericMiddlewareMaker, makeMiddleware } from "../../routing.js"

export const contextMap = <RequestContextMap>() => <K extends keyof RequestContextMap>(a: K) => ({
  key: a,
  settings: null as any as RequestContextMap[typeof a]
})

type DynamicMiddlewareMakerrsss<
  RequestContextMap extends Record<string, RPCContextMap.Any>,
  Provided extends keyof RequestContextMap,
  Middlewares extends ReadonlyArray<GenericMiddlewareMaker>
> = keyof Omit<RequestContextMap, Provided> extends never ? { make: () => "TODO" }
  : {
    addDynamicMiddleware: <MW extends DynamicMiddlewareMaker>(
      a: MW
    ) => DynamicMiddlewareMakerrsss<RequestContextMap, Provided | MW["dynamic"]["key"], Middlewares> // TODO: any of RequestContecxtMap, and track them, so remove the ones provided
  }

export const makeNewMiddleware: <
  RequestContextMap extends Record<string, RPCContextMap.Any>
>() => <Middlewares extends NonEmptyReadonlyArray<GenericMiddlewareMaker>>(
  ...genericMiddlewares: Middlewares
) => DynamicMiddlewareMakerrsss<RequestContextMap, never, Middlewares> = (...genericMiddlewares) => {
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

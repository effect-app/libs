/* eslint-disable @typescript-eslint/no-explicit-any */
import { Rpc, type RpcSchema } from "@effect/rpc"
import { type AnyWithProps } from "@effect/rpc/Rpc"
import { Tag } from "@effect/rpc/RpcMiddleware"
import { Context, type Effect, Layer, type NonEmptyArray, type NonEmptyReadonlyArray, S, type Schema } from "effect-app"
import { type GetContextConfig, type RPCContextMap } from "effect-app/client"
import { typedValuesOf } from "effect-app/utils"
import { type LayerUtils } from "../../layerUtils.js"
import { type TypeTestId } from "../../routing.js"
import { type MiddlewareMaker, middlewareMaker } from "./generic-middleware.js"
import { type AnyDynamic, type RpcDynamic, type TagClassAny } from "./RpcMiddleware.js"
/** Adapter used when setting the dynamic prop on a middleware implementation */
export const contextMap = <
  RequestContextMap extends Record<string, RPCContextMap.Any>,
  Key extends (keyof RequestContextMap) & string
>(rcm: RequestContextMap, key: Key): RpcDynamic<Key, RequestContextMap[Key]> => ({
  key,
  settings: { service: rcm[key]!["service"] } as RequestContextMap[Key]
})

const tag = Context.GenericTag("RequestContextConfig")
/** Retrieves RequestContextConfig out of the RPC annotations */
export const getConfig = <
  RequestContextMap extends Record<string, RPCContextMap.Any>
>() =>
(rpc: AnyWithProps): GetContextConfig<RequestContextMap> => {
  return Context.getOrElse(rpc.annotations, tag as any, () => ({}))
}

// the following implements sort of builder pattern
// we support both sideways and upwards elimination of dependencies

// it's for dynamic middlewares
type GetDependsOnKeys<MW extends MiddlewareMaker.Any> = MW extends { dependsOn: NonEmptyReadonlyArray<TagClassAny> } ? {
    [K in keyof MW["dependsOn"]]: MW["dependsOn"][K] extends AnyDynamic ? MW["dependsOn"][K]["dynamic"]["key"]
      : never
  }[keyof MW["dependsOn"]]
  : never

type FilterInDynamicMiddlewares<
  MWs extends ReadonlyArray<MiddlewareMaker.Any>,
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
    middlewares: ReadonlyArray<MiddlewareMaker.Any>
    dmp: any
    middlewareR: any
  }
> = MWs extends [
  infer F extends MiddlewareMaker.Any,
  ...infer Rest extends ReadonlyArray<MiddlewareMaker.Any>
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
    middlewareR: MiddlewareMaker.ApplyManyServices<[F], R["middlewareR"]>
  }>
  : R

export interface BuildingMiddleware<
  RequestContextMap extends Record<string, RPCContextMap.Any>,
  Provided extends keyof RequestContextMap,
  Middlewares extends ReadonlyArray<MiddlewareMaker.Any>,
  DynamicMiddlewareProviders,
  out MiddlewareR extends { _tag: string } = never
> {
  rpc: <
    const Tag extends string,
    Payload extends Schema.Schema.Any | Schema.Struct.Fields = typeof Schema.Void,
    Success extends Schema.Schema.Any = typeof Schema.Void,
    Error extends Schema.Schema.All = typeof Schema.Never,
    const Stream extends boolean = false,
    Config extends GetContextConfig<RequestContextMap> = {}
  >(tag: Tag, options?: {
    readonly payload?: Payload
    readonly success?: Success
    readonly error?: Error
    readonly stream?: Stream
    readonly config?: Config
    readonly primaryKey?: [Payload] extends [Schema.Struct.Fields]
      ? ((payload: Schema.Simplify<Schema.Struct.Type<NoInfer<Payload>>>) => string)
      : never
  }) =>
    & Rpc.Rpc<
      Tag,
      Payload extends Schema.Struct.Fields ? Schema.Struct<Payload> : Payload,
      Stream extends true ? RpcSchema.Stream<Success, Error> : Success,
      Stream extends true ? typeof Schema.Never : Error
    >
    & { config: Config }

  middleware<MWs extends NonEmptyArray<MiddlewareMaker.Any>>(
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
    middlewares: ReadonlyArray<MiddlewareMaker.Any>
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
  readonly [TypeTestId]: {
    missingDynamicMiddlewares: Exclude<keyof RequestContextMap, Provided>
    missingContext: MiddlewareR
  }
}

export type MiddlewaresBuilder<
  RequestContextMap extends Record<string, RPCContextMap.Any>,
  Provided extends keyof RequestContextMap = never,
  Middlewares extends ReadonlyArray<MiddlewareMaker.Any> = [],
  DynamicMiddlewareProviders = unknown,
  MiddlewareR extends { _tag: string } = never
> =
  & BuildingMiddleware<
    RequestContextMap,
    Provided,
    Middlewares,
    DynamicMiddlewareProviders,
    MiddlewareR
  >
  & //  keyof Omit<RequestContextMap, Provided> extends never is true when all the dynamic middlewares are provided
  // MiddlewareR is never when all the required services from generic & dynamic middlewares are provided
  (keyof Omit<RequestContextMap, Provided> extends never ? [MiddlewareR] extends [never] ? MiddlewareMaker<
        RequestContextMap,
        Middlewares
      >
    : {}
    : {})

const makeMiddlewareBasic =
  // by setting RequestContextMap beforehand, execute contextual typing does not fuck up itself to anys
  <
    RequestContextMap extends Record<string, RPCContextMap.Any>,
    MiddlewareProviders extends ReadonlyArray<MiddlewareMaker.Any>
  >(
    _rcm: RequestContextMap,
    ...make: MiddlewareProviders
  ) => {
    // reverse middlewares and wrap one after the other
    const middleware = middlewareMaker(make)

    const failures = make.map((_) => _.failure).filter(Boolean)
    const provides = make.flatMap((_) => !_.provides ? [] : Array.isArray(_.provides) ? _.provides : [_.provides])
    const requires = make
      .flatMap((_) => !_.requires ? [] : Array.isArray(_.requires) ? _.requires : [_.requires])
      .filter((_) => !provides.includes(_))

    const MiddlewareMaker = Tag<MiddlewareMakerId>()("MiddlewareMaker", {
      failure: (failures.length > 0
        ? S.Union(...failures)
        : S.Never) as unknown as MiddlewareMaker.ManyErrors<MiddlewareProviders> extends never ? never
          : S.Schema<MiddlewareMaker.ManyErrors<MiddlewareProviders>>,
      requires: (requires.length > 0
        ? requires
        : undefined) as unknown as Exclude<
          MiddlewareMaker.ManyRequired<MiddlewareProviders>,
          MiddlewareMaker.ManyProvided<MiddlewareProviders>
        > extends never ? never : [
          MakeTags<
            Exclude<
              MiddlewareMaker.ManyRequired<MiddlewareProviders>,
              MiddlewareMaker.ManyProvided<MiddlewareProviders>
            >
          >
        ],
      provides: (provides.length > 0
        ? provides
        : undefined) as unknown as MiddlewareMaker.ManyProvided<MiddlewareProviders> extends never ? never /*[
          MakeTags<MiddlewareMaker.ManyProvided<MiddlewareProviders>>
        ]*/
          : MakeTags<MiddlewareMaker.ManyProvided<MiddlewareProviders>>, // keep compatible with current RpcMiddleware
      wrap: true
    })

    const dependencies = Layer.mergeAll(...(middleware.dependencies ?? [Layer.empty]) as any) as Layer.Layer<
      LayerUtils.GetLayersSuccess<typeof middleware.dependencies>,
      LayerUtils.GetLayersError<typeof middleware.dependencies>,
      LayerUtils.GetLayersContext<typeof middleware.dependencies>
    >

    const Default = Layer
      .scoped(
        MiddlewareMaker,
        middleware.effect as Effect<
          any, // TODO: why ?
          Effect.Error<typeof middleware["effect"]>,
          Effect.Context<typeof middleware["effect"]>
        >
      )
      .pipe(Layer.provide(dependencies))

    // add to the tag a default implementation
    return Object.assign(MiddlewareMaker, {
      Default,
      // tag to be used to retrieve the RequestContextConfig from RPC annotations
      requestContext: Context.GenericTag<"RequestContextConfig", GetContextConfig<RequestContextMap>>(
        "RequestContextConfig"
      )
    })
  }

export const makeMiddleware = <
  RequestContextMap extends Record<string, RPCContextMap.Any>
>(rcm: RequestContextMap): MiddlewaresBuilder<RequestContextMap> => {
  let allMiddleware: MiddlewareMaker.Any[] = []
  const requestContext = Context.GenericTag<"RequestContextConfig", GetContextConfig<RequestContextMap>>(
    "RequestContextConfig"
  )
  const it = {
    rpc: <
      const Tag extends string,
      Payload extends Schema.Schema.Any | Schema.Struct.Fields = typeof Schema.Void,
      Success extends Schema.Schema.Any = typeof Schema.Void,
      Error extends Schema.Schema.All = typeof Schema.Never,
      const Stream extends boolean = false,
      Config extends GetContextConfig<RequestContextMap> = {}
    >(tag: Tag, options?: {
      readonly payload?: Payload
      readonly success?: Success
      readonly error?: Error
      readonly stream?: Stream
      readonly config?: Config
      readonly primaryKey?: [Payload] extends [Schema.Struct.Fields]
        ? ((payload: Schema.Simplify<Schema.Struct.Type<NoInfer<Payload>>>) => string)
        : never
    }): // TODO: enhance `Error`. type based on config.
    & Rpc.Rpc<
      Tag,
      Payload extends Schema.Struct.Fields ? Schema.Struct<Payload> : Payload,
      Stream extends true ? RpcSchema.Stream<Success, Error> : Success,
      Stream extends true ? typeof Schema.Never : Error
    >
    & { config: Config } => {
      const config = options?.config ?? {} as Config
      // TODO: based on the config, we must enhance (union) or set failures.

      const error = options?.error

      const errors = typedValuesOf(rcm).map((_) => _.error).filter((_) => _ && _ !== S.Never) // TODO: only the errors relevant based on config
      const newError = error ? S.Union(error, ...errors) : S.Union(...errors)

      const rpc = Rpc.make(tag, { ...options, error: newError })

      return Object.assign(rpc.annotate(requestContext, config), { config })
    },
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

// TODO: actually end up with [Tag<A, A>, Tag<B, B>, ...]
export type MakeTags<A> = Context.Tag<A, A>

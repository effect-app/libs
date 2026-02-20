/* eslint-disable @typescript-eslint/no-explicit-any */
import { Rpc, type RpcGroup, type RpcMiddleware, type RpcSchema } from "@effect/rpc"
import { type HandlersFrom } from "@effect/rpc/RpcGroup"
import { Context, Effect, Layer, type Schema, Schema as S, type Scope } from "effect"
import { type NonEmptyArray, type NonEmptyReadonlyArray } from "effect/Array"
import { type Simplify } from "effect/Types"
import { PreludeLogger } from "../logger.js"
import { type TypeTestId } from "../TypeTest.js"
import { typedValuesOf } from "../utils.js"
import { type GetContextConfig, type RequestContextMapTagAny, type RpcContextMap } from "./RpcContextMap.js"
import { type AddMiddleware, type AnyDynamic, type RpcDynamic, type RpcMiddlewareV4, type TagClassAny } from "./RpcMiddleware.js"
import * as RpcMiddlewareX from "./RpcMiddleware.js"

// adapter for effect/rpc v3 middleware provides. (in effect-smol (v4), it's wrap only, and just a Service Identifier, no tags.)
type MakeTags<A> = Context.Tag<A, A>

export interface MiddlewareMaker<
  Self,
  Id extends string,
  RequestContextMap extends Record<string, RpcContextMap.Any>,
  MiddlewareProviders extends ReadonlyArray<MiddlewareMaker.Any>
> extends
  RpcMiddleware.TagClass<
    Self,
    Id,
    Simplify<
      & { readonly wrap: true }
      & (Exclude<
        MiddlewareMaker.ManyRequired<MiddlewareProviders>,
        MiddlewareMaker.ManyProvided<MiddlewareProviders>
      > extends never ? {} : {
        readonly requires: MakeTags<
          Exclude<
            MiddlewareMaker.ManyRequired<MiddlewareProviders>,
            MiddlewareMaker.ManyProvided<MiddlewareProviders>
          >
        >
      })
      & (MiddlewareMaker.ManyErrors<MiddlewareProviders> extends never ? {}
        : {
          readonly failure: S.Schema<MiddlewareMaker.ManyErrors<MiddlewareProviders>>
        })
      & (MiddlewareMaker.ManyProvided<MiddlewareProviders> extends never ? {}
        : { readonly provides: MakeTags<MiddlewareMaker.ManyProvided<MiddlewareProviders>> })
    >
  >
{
  readonly layer: Layer.Layer<Self, never, Context.Tag.Identifier<MiddlewareProviders[number]>>
  readonly requestContext: RequestContextTag<RequestContextMap>
  readonly requestContextMap: RequestContextMap
}

export interface RequestContextTag<RequestContextMap extends Record<string, RpcContextMap.Any>>
  extends Context.Tag<"RequestContextConfig", GetContextConfig<RequestContextMap>>
{}

export namespace MiddlewareMaker {
  export type Any = TagClassAny

  export type ApplyServices<A extends TagClassAny, R> = Exclude<R, Provided<A>> | Required<A>

  export type ApplyManyServices<A extends NonEmptyReadonlyArray<TagClassAny>, R> =
    | Exclude<R, { [K in keyof A]: Provided<A[K]> }[number]>
    | { [K in keyof A]: Required<A[K]> }[number]

  export type ManyProvided<A extends ReadonlyArray<TagClassAny>> = A extends NonEmptyReadonlyArray<TagClassAny>
    ? { [K in keyof A]: Provided<A[K]> }[number]
    : Provided<A[number]>
  export type ManyRequired<A extends ReadonlyArray<TagClassAny>> = A extends NonEmptyReadonlyArray<TagClassAny>
    ? { [K in keyof A]: Required<A[K]> }[number]
    : Required<A[number]>
  export type ManyErrors<A extends ReadonlyArray<TagClassAny>> = A extends NonEmptyReadonlyArray<TagClassAny>
    ? { [K in keyof A]: Errors<A[K]> }[number]
    : Errors<A[number]>

  export type Provided<T> = T extends TagClassAny ? T extends { provides: infer _P } ? _P
    : never
    : never

  export type Errors<T> = T extends TagClassAny ? T extends { failure: S.Schema.Any } ? S.Schema.Type<T["failure"]>
    : never
    : never

  export type Required<T> = T extends TagClassAny ? T extends { requires: infer _R } ? _R
    : never
    : never
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
  RequestContextMap extends Record<string, RpcContextMap.Any>
> = {
  [K in keyof MWs]: MWs[K] extends { dynamic: RpcDynamic<any, RequestContextMap[keyof RequestContextMap]> } ? MWs[K]
    : never
}

type RecursiveHandleMWsSideways<
  MWs,
  R extends {
    self: any
    id: string
    rcm: Record<string, RpcContextMap.Any>
    provided: keyof R["rcm"] // that's fine
    middlewares: ReadonlyArray<MiddlewareMaker.Any>
    dmp: any
    middlewareR: any
  }
> = MWs extends [] ? R
  : MWs extends [infer F, ...infer Rest extends ReadonlyArray<any>]
    ? F extends MiddlewareMaker.Any ? RecursiveHandleMWsSideways<Rest, {
        self: R["self"]
        id: R["id"]
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
      // TypeScript inference fails when checking F extends MiddlewareMaker.Any during F's inference
      // if F is a class with static properties - deferring the check avoids this limitation
    : `Absurd: F must extend MiddlewareMaker.Any`
  : never

export interface BuildingMiddleware<
  Self,
  Id extends string,
  RequestContextMap extends Record<string, RpcContextMap.Any>,
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
    & { readonly config: Config }

  middleware<MWs extends NonEmptyArray<MiddlewareMaker.Any>>(
    ...mw: MWs
  ): RecursiveHandleMWsSideways<MWs, {
    self: Self
    id: Id
    rcm: RequestContextMap
    provided: Provided
    middlewares: Middlewares
    dmp: DynamicMiddlewareProviders
    middlewareR: MiddlewareR
  }> extends infer Res extends {
    self: any
    id: string
    rcm: RequestContextMap
    provided: keyof RequestContextMap
    middlewares: ReadonlyArray<MiddlewareMaker.Any>
    dmp: any
    middlewareR: any
  } ? MiddlewaresBuilder<
      Res["self"],
      Res["id"],
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
  Self,
  Id extends string,
  RequestContextMap extends Record<string, RpcContextMap.Any>,
  Provided extends keyof RequestContextMap = never,
  Middlewares extends ReadonlyArray<MiddlewareMaker.Any> = [],
  DynamicMiddlewareProviders = unknown,
  MiddlewareR extends { _tag: string } = never
> =
  & BuildingMiddleware<
    Self,
    Id,
    RequestContextMap,
    Provided,
    Middlewares,
    DynamicMiddlewareProviders,
    MiddlewareR
  >
  & //  keyof Omit<RequestContextMap, Provided> extends never is true when all the dynamic middlewares are provided
  // MiddlewareR is never when all the required services from generic & dynamic middlewares are provided
  (keyof Omit<RequestContextMap, Provided> extends never ? [MiddlewareR] extends [never] ? MiddlewareMaker<
        Self,
        Id,
        RequestContextMap,
        Middlewares
      >
    : { new(_: never): {} }
    : { new(_: never): {} })

const middlewareMaker = <
  MiddlewareProviders extends ReadonlyArray<MiddlewareMaker.Any>
>(middlewares: MiddlewareProviders): Effect.Effect<
  RpcMiddlewareV4<
    MiddlewareMaker.ManyProvided<MiddlewareProviders>,
    MiddlewareMaker.ManyErrors<MiddlewareProviders>,
    Exclude<
      MiddlewareMaker.ManyRequired<MiddlewareProviders>,
      MiddlewareMaker.ManyProvided<MiddlewareProviders>
    > extends never ? never
      : Exclude<MiddlewareMaker.ManyRequired<MiddlewareProviders>, MiddlewareMaker.ManyProvided<MiddlewareProviders>>
  >
> => {
  // we want to run them in reverse order because latter middlewares will provide context to former ones
  middlewares = middlewares.toReversed() as any

  return Effect.gen(function*() {
    const context = yield* Effect.context()

    // returns a Effect/RpcMiddlewareV4 with Scope.Scope in requirements
    return (
      _options: Parameters<
        RpcMiddleware.RpcMiddlewareWrap<
          MiddlewareMaker.ManyProvided<MiddlewareProviders>,
          never
        >
      >[0]
    ) => {
      const { next, ...options } = _options
      // we start with the actual handler
      let handler = next

      // inspired from Effect/RpcMiddleware
      for (const tag of middlewares) {
        // use the tag to get the middleware from context
        const middleware = Context.unsafeGet(context, tag)

        // wrap the current handler, allowing the middleware to run before and after it
        handler = PreludeLogger.logDebug("Applying middleware wrap " + tag.key).pipe(
          Effect.zipRight(middleware(handler, options))
        ) as any
      }
      return handler
    }
  }) as any
}

const makeMiddlewareBasic = <Self>() =>
// by setting RequestContextMap beforehand, execute contextual typing does not fuck up itself to anys
<
  const Id extends string,
  RequestContextMap extends Record<string, RpcContextMap.Any>,
  MiddlewareProviders extends ReadonlyArray<MiddlewareMaker.Any>
>(
  id: Id,
  rcm: RequestContextMap,
  ...make: MiddlewareProviders
) => {
  // reverse middlewares and wrap one after the other
  const middleware = middlewareMaker(make)

  const failures = make.map((_) => _.failure).filter(Boolean)
  const provides = make.flatMap((_) => !_.provides ? [] : Array.isArray(_.provides) ? _.provides : [_.provides])
  const requires = make
    .flatMap((_) => !_.requires ? [] : Array.isArray(_.requires) ? _.requires : [_.requires])
    .filter((_) => !provides.includes(_))

  const MiddlewareMaker = RpcMiddlewareX.Tag<Self>()(id, {
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
      : undefined) as unknown as MiddlewareMaker.ManyProvided<MiddlewareProviders> extends never ? never
        : MakeTags<MiddlewareMaker.ManyProvided<MiddlewareProviders>>,
    wrap: true
  })

  const layer = Layer
    .scoped(
      MiddlewareMaker,
      middleware as Effect.Effect<
        any, // TODO: why ?
        Effect.Effect.Error<typeof middleware>,
        Effect.Effect.Context<typeof middleware>
      >
    )

  // add to the tag a default implementation
  return Object.assign(MiddlewareMaker, {
    layer,
    // tag to be used to retrieve the RequestContextConfig from Rpc annotations
    requestContext: Context.GenericTag<"RequestContextConfig", GetContextConfig<RequestContextMap>>(
      "RequestContextConfig"
    ),
    requestContextMap: rcm
  })
}

export const Tag = <Self>() =>
<
  const Id extends string,
  RequestContextMap extends RequestContextMapTagAny
>(id: Id, rcm: RequestContextMap): MiddlewaresBuilder<Self, Id, RequestContextMap["config"]> => {
  let allMiddleware: MiddlewareMaker.Any[] = []
  const requestContext = Context.GenericTag<"RequestContextConfig", GetContextConfig<RequestContextMap["config"]>>(
    "RequestContextConfig"
  )
  const it = {
    id,
    // rpc with config
    rpc: <
      const Tag extends string,
      Payload extends Schema.Schema.Any | Schema.Struct.Fields = typeof Schema.Void,
      Success extends Schema.Schema.Any = typeof Schema.Void,
      Error extends Schema.Schema.All = typeof Schema.Never,
      const Stream extends boolean = false,
      Config extends GetContextConfig<RequestContextMap["config"]> = {}
    >(tag: Tag, options?: {
      readonly payload?: Payload
      readonly success?: Success
      readonly error?: Error
      readonly stream?: Stream
      readonly config?: Config
      readonly primaryKey?: [Payload] extends [Schema.Struct.Fields]
        ? ((payload: Schema.Simplify<Schema.Struct.Type<NoInfer<Payload>>>) => string)
        : never
    }):
      & Rpc.Rpc<
        Tag,
        Payload extends Schema.Struct.Fields ? Schema.Struct<Payload> : Payload,
        // TODO: enhance `Error`. type based on middleware config.
        Stream extends true ? RpcSchema.Stream<Success, Error> : Success,
        Stream extends true ? typeof Schema.Never : Error
      >
      & { config: Config } =>
    {
      const config = options?.config ?? {} as Config

      // based on the config, we must enhance (union) or set failures.
      // TODO: we should only include errors that are relevant based on the middleware config.ks
      const error = options?.error
      const errors = typedValuesOf(rcm.config).map((_) => _.error).filter((_) => _ && _ !== S.Never) // TODO: only the errors relevant based on config
      const newError = error ? S.Union(error, ...errors) : S.Union(...errors)

      const rpc = Rpc.make(tag, { ...options, error: newError }) as any

      return Object.assign(rpc.annotate(requestContext, config), { config })
    },
    middleware: (...middlewares: any[]) => {
      for (const mw of middlewares) {
        // recall that we run middlewares in reverse order
        allMiddleware = [mw, ...allMiddleware]
      }
      return allMiddleware.filter((m) => !!m.dynamic).length !== Object.keys(rcm.config).length
        // for sure, until all the dynamic middlewares are provided it's non sensical to call makeMiddlewareBasic
        ? it
        // actually, we don't know yet if MiddlewareR is never, but we can't easily check it at runtime
        : Object.assign(makeMiddlewareBasic<Self>()<Id, any, any>(id, rcm.config, ...allMiddleware), it)
    }
  }
  return it as any
}

// alternatively consider group.serverMiddleware? hmmm
export const middlewareGroup = <
  RequestContextMap extends Record<string, RpcContextMap.Any>,
  Middleware extends RpcMiddleware.TagClassAny & {
    readonly requestContext: RequestContextTag<RequestContextMap>
    readonly requestContextMap: RequestContextMap
  }
>(
  middleware: Middleware
) =>
<R extends Rpc.Any>(group: RpcGroup.RpcGroup<R>) => {
  type RN = AddMiddleware<R, typeof middleware>
  const middlewaredGroup = group.middleware(middleware) as unknown as RpcGroup.RpcGroup<RN>
  const toLayerOriginal = middlewaredGroup.toLayer.bind(middlewaredGroup)
  return Object.assign(middlewaredGroup, {
    toLayerDynamic: <
      Handlers extends HandlersFrom<RN>,
      EX = never,
      RX = never
    >(
      build:
        | Handlers
        | Effect.Effect<Handlers, EX, RX>
    ): Layer.Layer<
      Rpc.ToHandler<RN>,
      EX,
      | Exclude<RX, Scope.Scope>
      | RpcMiddlewareX.HandlersContext<RN, Handlers>
    > => {
      return toLayerOriginal(build as any) as any // ??
    }
  })
}

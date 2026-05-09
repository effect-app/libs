/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-empty-object-type */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { Config, Effect, Layer, type NonEmptyReadonlyArray, Predicate, Ref, S, type Scope, Stream } from "effect-app"
import { getMeta } from "effect-app/client"
import { type HttpHeaders, HttpMiddleware } from "effect-app/http"
import { Invalidation } from "effect-app/rpc"
import { type GetEffectContext, type GetEffectError, type RpcContextMap } from "effect-app/rpc/RpcContextMap"
import { type TypeTestId } from "effect-app/TypeTest"
import { typedKeysOf, typedValuesOf } from "effect-app/utils"
import { type Yieldable } from "effect/Effect"
import { Rpc, RpcGroup, type RpcSerialization, RpcServer } from "effect/unstable/rpc"
import { type LayerUtils } from "./layerUtils.js"
import { RequestType as RequestTypeAnnotation } from "./routing/middleware.js"

export * from "./routing/middleware.js"

export const applyRequestTypeInterruptibility = <A, E, R>(
  requestType: "command" | "query",
  effect: Effect.Effect<A, E, R>
) => requestType === "command" ? Rpc.uninterruptible(effect) : effect

export const rpcServerSpanPrefix = "RpcServer"

export const isRpcServerRequestForModule = (moduleName: string, url: string) => url.startsWith(`/rpc/${moduleName}`)

const extractSingleHeaderValue = (headers: Record<string, unknown>, key: string): string | undefined => {
  const value = headers[key]
  if (typeof value === "string") {
    return value
  }
  if (Array.isArray(value)) {
    const first = value[0]
    return typeof first === "string" ? first : undefined
  }
  return undefined
}

const assignHeaderAttribute = (
  attributes: Record<string, string>,
  headers: Record<string, unknown>,
  headerName: string
) => {
  const value = extractSingleHeaderValue(headers, headerName)
  if (typeof value === "string") {
    attributes[`http.request.header.${headerName}`] = value
  }
}

// it's the result of extending S.Req setting success, config
// it's a schema plus some metadata
export type AnyRequestModule = S.Top & {
  _tag: string // unique identifier for the request module
  type: "command" | "query"
  stream: boolean
  config: any // ?
  success: S.Top // validates the success response
  error: S.Top // validates the failure response
}

// builder pattern for adding actions to a router until all actions are added
export interface AddAction<Actions extends AnyRequestModule, Accum extends Record<string, any> = {}> {
  accum: Accum
  add<A extends Handler<Actions, any, any>>(
    a: A
  ): A extends Handler<infer M extends AnyRequestModule, any, any> ? Exclude<Actions, M> extends never ?
        & Accum
        & { [K in M["_tag"]]: A }
    :
      & AddAction<
        Exclude<Actions, M>,
        & Accum
        & { [K in M["_tag"]]: A }
      >
      & Accum
      & { [K in M["_tag"]]: A }
    : never
}

// note:
// "d" stands for decoded i.e. the Type
// "raw" stands for encoded i.e. the Encoded
namespace RequestTypes {
  export const DECODED = "d" as const
  export type DECODED = typeof DECODED
  export const RAW = "raw" as const
  export type RAW = typeof RAW
}
type RequestType = typeof RequestTypes[keyof typeof RequestTypes]

type GetSuccess<T> = T extends { success: S.Top } ? T["success"] : typeof S.Void
type GetFailure<T extends { error?: S.Top }> = T["error"] extends never ? typeof S.Never : T["error"]

type GetSuccessShape<Action extends { success?: S.Top }, RT extends RequestType> = {
  d: S.Schema.Type<GetSuccess<Action>>
  raw: S.Codec.Encoded<GetSuccess<Action>>
}[RT]

interface HandlerBase<Action extends AnyRequestModule, RT extends RequestType, A, E, R> {
  new(): {}
  _tag: RT
  stack: string
  handler: (
    req: S.Schema.Type<Action>,
    headers: HttpHeaders.Headers
  ) => Effect.Effect<A, E, R> | Stream.Stream<A, E, R>
}

export interface Handler<Action extends AnyRequestModule, RT extends RequestType, R> extends
  HandlerBase<
    Action,
    RT,
    GetSuccessShape<Action, RT>,
    S.Schema.Type<GetFailure<Action>> | S.SchemaError,
    R
  >
{}

type AnyHandler<Action extends AnyRequestModule> = Handler<
  Action,
  RequestType,
  any // R
>

// a Resource is typically the whole module with all the exported sh*t
// this helper retrieves only the entities (classes) which are built by extending S.Req
type FilterRequestModules<T> = {
  [K in keyof T as T[K] extends AnyRequestModule ? K : never]: T[K]
}

type RpcRouteR<
  T extends [any, (req: any, headers: HttpHeaders.Headers) => Effect.Effect<any, any, any>]
> = T extends [
  any,
  (...args: any[]) => Effect.Effect<any, any, infer R>
] ? R
  : never

type EffectMatch<
  Resource extends Record<string, any>,
  RequestContextMap extends Record<string, any>,
  RT extends RequestType,
  Key extends keyof Resource
> = <A extends GetSuccessShape<Resource[Key], RT>, R2 = never, E = never>(
  f: (req: S.Schema.Type<Resource[Key]>) => Effect.Effect<A, E, R2>
) => Handler<
  Resource[Key],
  RT,
  Exclude<
    Exclude<R2, GetEffectContext<RequestContextMap, Resource[Key]["config"]>>,
    Scope.Scope
  >
>

type StreamMatch<
  Resource extends Record<string, any>,
  RequestContextMap extends Record<string, any>,
  RT extends RequestType,
  Key extends keyof Resource
> = <A extends GetSuccessShape<Resource[Key], RT>, R2 = never, E = never>(
  f: (req: S.Schema.Type<Resource[Key]>) => Stream.Stream<A, E, R2>
) => Handler<
  Resource[Key],
  RT,
  Exclude<
    Exclude<R2, GetEffectContext<RequestContextMap, Resource[Key]["config"]>>,
    Scope.Scope
  >
>

// Stream resources only accept Stream / Effect<Stream> handlers; non-stream resources
// only accept Effect handlers. Discriminated by the request module's `stream` flag.
type Match<
  Resource extends Record<string, any>,
  RequestContextMap extends Record<string, any>,
  RT extends RequestType,
  Key extends keyof Resource
> = Resource[Key] extends { stream: true } ? StreamMatch<Resource, RequestContextMap, RT, Key>
  : EffectMatch<Resource, RequestContextMap, RT, Key>

export type RouteMatcher<
  RequestContextMap extends Record<string, any>,
  Resource extends Record<string, any>
> = {
  // use Resource as Key over using Keys, so that the Go To on X.Action remain in tact in Controllers files
  /**
   * Requires the Type shape
   */
  [Key in keyof FilterRequestModules<Resource>]:
    & Match<Resource, RequestContextMap, RequestTypes.DECODED, Key>
    & {
      success: Resource[Key]["success"]
      successRaw: S.Codec<S.Codec.Encoded<Resource[Key]["success"]>>
      error: Resource[Key]["error"]
      /**
       * Requires the Encoded shape (e.g directly undecoded from DB, so that we don't do multiple Decode/Encode)
       */
      raw: Match<Resource, RequestContextMap, RequestTypes.RAW, Key>
    }
}

export const skipOnProd = Effect
  .gen(function*() {
    const env = yield* Config.string("env")
    return env !== "prod"
  })
  .pipe(Effect.orDie)

// Type helpers to extract middleware information from a resource's request classes.
type MiddlewareOf<M extends Record<string, any>> = Exclude<
  { [K in keyof M]: M[K] extends { readonly middleware?: infer MW } ? NonNullable<MW> : never }[keyof M],
  never
>
type ProvidesOf<MW> = MW extends { readonly provides: infer P } ? P : never
type RequestContextMapOf<MW> = MW extends {
  requestContextMap: infer RCM extends Record<string, RpcContextMap.Any>
} ? RCM
  : Record<string, never>
type LayerNormalize<L> = L extends Layer.Layer<any, infer E, infer R> ? Layer.Layer<never, E, R>
  : Layer.Layer<never, never, never>
type LayerSuccess<L> = L extends Layer.Layer<infer A, any, any> ? A : never

/**
 * Middleware tags are typically passed to `makeRpcClient` as the class value, so
 * the captured `MW` is a constructor type. Layers carry the *instance* type as
 * their success channel. Bridge the two so the constraint compares like-with-like.
 *
 * Effect middleware classes declare `new(_: never): Shape` which the standard
 * `T extends abstract new (...args: any) => infer I` form sometimes fails to
 * narrow. Use the `prototype` member instead — it is always the instance type.
 */
type MWService<MW> = MW extends { readonly prototype: infer P } ? P : MW

/**
 * Type-level guard: emits a structural mismatch on `Resource` when the middleware
 * service identifier extracted from the resource's request classes is not provided
 * by the layer passed to `makeRouter`. When `MW` is `never` (no middleware on the
 * resource) or already a subtype of the layer's success, this resolves to `unknown`
 * and intersects harmlessly with `Resource`.
 */
type EnsureMiddlewareProvided<Live, MW> = [MW] extends [never] ? unknown
  : [MWService<MW>] extends [LayerSuccess<Live>] ? unknown
  : {
    readonly __middlewareNotProvidedByRouterLayer: {
      readonly expected: MWService<MW>
      readonly providedByLayer: LayerSuccess<Live>
    }
  }

// Safe wrappers that check the constraint before calling GetEffectContext/GetEffectError.
// These avoid TypeScript constraint errors when the RC map type is deferred (generic).
type SafeGetEffectContext<RCM, Config> = RCM extends Record<string, RpcContextMap.Any> ? GetEffectContext<RCM, Config>
  : never
type SafeGetEffectError<RCM, Config> = RCM extends Record<string, RpcContextMap.Any> ? GetEffectError<RCM, Config>
  : never

export const makeRouter = <Live extends Layer.Layer<any, any, any> = Layer.Layer<any, never, never>>(
  middlewareLive?: Live
) => {
  type ResourceMWDefault = LayerNormalize<Live>

  /**
   * Create a Router for specified resource.
   * Middleware schema/tag is read from the request classes (stored via `makeRpcClient`).
   * The middleware **Live** layer is the one passed to `makeRouter`.
   * If `check` is provided, the router will only be created if the effect succeeds with true.
   */
  function matchFor<
    const Resource extends Record<string, any>,
    MW = MiddlewareOf<Resource>
  >(
    rsc: Resource & EnsureMiddlewareProvided<Live, MW>,
    options?: { check?: Effect.Effect<boolean> }
  ) {
    // MW is a defaulted type parameter so TypeScript evaluates MiddlewareOf<Resource>
    // eagerly at each call site, producing a concrete type instead of a deferred conditional.
    type ResourceRequestContextMap = RequestContextMapOf<MW>
    type ResourceContextProviderA = ProvidesOf<MW>

    type HandlerContext<Action extends AnyRequestModule> =
      | SafeGetEffectContext<ResourceRequestContextMap, Action["config"]>
      | ResourceContextProviderA

    type HandlerWithInputGen<
      Action extends AnyRequestModule,
      RT extends RequestType
    > = (
      req: S.Schema.Type<Action>
    ) => Generator<
      Yieldable<
        any,
        any,
        S.Schema.Type<GetFailure<Action>> | S.SchemaError,
        // the actual implementation of the handler may just require the dynamic context provided by the middleware
        // and the per request context provided by the context provider
        HandlerContext<Action>
      >,
      GetSuccessShape<Action, RT>,
      never
    >

    type HandlerWithInputEff<
      Action extends AnyRequestModule,
      RT extends RequestType
    > = (
      req: S.Schema.Type<Action>
    ) => Effect.Effect<
      GetSuccessShape<Action, RT>,
      S.Schema.Type<GetFailure<Action>> | S.SchemaError,
      // the actual implementation of the handler may just require the dynamic context provided by the middleware
      // and the per request context provided by the context provider
      HandlerContext<Action>
    >

    type HandlerWithInputStream<
      Action extends AnyRequestModule,
      RT extends RequestType
    > = (
      req: S.Schema.Type<Action>
    ) => Stream.Stream<
      GetSuccessShape<Action, RT>,
      S.Schema.Type<GetFailure<Action>> | S.SchemaError,
      HandlerContext<Action>
    >

    // Stream resources only accept `(req) => Stream`; non-stream only Effect / Generator.
    type Handlers<Action extends AnyRequestModule, RT extends RequestType> = Action extends { stream: true }
      ? HandlerWithInputStream<Action, RT>
      : HandlerWithInputGen<Action, RT> | HandlerWithInputEff<Action, RT>

    type HandlersDecoded<Action extends AnyRequestModule> = Handlers<Action, RequestTypes.DECODED>

    type HandlersRaw<Action extends AnyRequestModule> = Action extends { stream: true }
      ? { raw: HandlerWithInputStream<Action, RequestTypes.RAW> }
      :
        | { raw: HandlerWithInputGen<Action, RequestTypes.RAW> }
        | { raw: HandlerWithInputEff<Action, RequestTypes.RAW> }

    type AnyHandlers<Action extends AnyRequestModule> = HandlersRaw<Action> | HandlersDecoded<Action>

    const meta = getMeta(rsc)

    type RequestModules = FilterRequestModules<Resource>
    const requestModules = typedKeysOf(rsc).reduce((acc, cur) => {
      if (Predicate.isObjectKeyword(rsc[cur]) && rsc[cur]["success"]) {
        acc[cur as keyof RequestModules] = rsc[cur]
      }
      return acc
    }, {} as RequestModules)

    const routeMatcher = typedKeysOf(requestModules).reduce(
      (prev, cur) => {
        ;(prev as any)[cur] = Object.assign((handlerImpl: any) => {
          // handlerImpl is the actual handler implementation
          if (handlerImpl[Symbol.toStringTag] === "GeneratorFunction") handlerImpl = Effect.fnUntraced(handlerImpl)
          const stack = new Error().stack?.split("\n").slice(2).join("\n")
          // oxlint-disable-next-line typescript/no-extraneous-class
          return class {
            static request = rsc[cur]
            static stack = stack
            static _tag = RequestTypes.DECODED
            static handler = handlerImpl
          }
        }, {
          success: rsc[cur].success,
          successRaw: S.toEncoded(rsc[cur].success),
          error: rsc[cur].error,
          raw: // "Raw" variations are for when you don't want to decode just to encode it again on the response
            // e.g for direct projection from DB
            // but more importantly, to skip Effectful decoders, like to resolve relationships from the database or remote client.
            (handlerImpl: any) => {
              if (handlerImpl[Symbol.toStringTag] === "GeneratorFunction") handlerImpl = Effect.fnUntraced(handlerImpl)
              const stack = new Error().stack?.split("\n").slice(2).join("\n")
              // oxlint-disable-next-line typescript/no-extraneous-class
              return class {
                static request = rsc[cur]
                static stack = stack
                static _tag = RequestTypes.RAW
                static handler = handlerImpl
              }
            }
        })
        return prev
      },
      {} as RouteMatcher<ResourceRequestContextMap, Resource>
    )

    const router3: <
      const Impl extends {
        [K in keyof FilterRequestModules<Resource>]: AnyHandlers<Resource[K]>
      }
    >(
      impl: Impl
    ) => {
      [K in keyof Impl & keyof FilterRequestModules<Resource>]: Handler<
        FilterRequestModules<Resource>[K],
        Impl[K] extends { raw: any } ? RequestTypes.RAW : RequestTypes.DECODED,
        Exclude<
          Exclude<
            // retrieves context R from the actual implementation of the handler
            Impl[K] extends { raw: any }
              ? Impl[K]["raw"] extends (...args: any[]) => Effect.Effect<any, any, infer R> ? R
              : Impl[K]["raw"] extends (...args: any[]) => Stream.Stream<any, any, infer R> ? R
              : Impl[K]["raw"] extends (...args: any[]) => Generator<
                Yieldable<any, any, any, infer R>
              > ? R
              : never
              : Impl[K] extends (...args: any[]) => Effect.Effect<any, any, infer R> ? R
              : Impl[K] extends (...args: any[]) => Stream.Stream<any, any, infer R> ? R
              : Impl[K] extends (...args: any[]) => Generator<
                Yieldable<any, any, any, infer R>
              > ? R
              : never,
            | SafeGetEffectContext<ResourceRequestContextMap, Resource[K]["config"]>
            | ResourceContextProviderA
          >,
          Scope.Scope
        >
      >
    } = (impl: Record<keyof RequestModules, any>) =>
      typedKeysOf(impl).reduce((acc, cur) => {
        acc[cur] = "raw" in impl[cur] ? routeMatcher[cur].raw(impl[cur].raw) : routeMatcher[cur](impl[cur])
        return acc
      }, {} as any)

    const makeRoutes = <
      MakeE,
      MakeR,
      THandlers extends {
        // important to keep them separate via | for type checking!!
        [K in keyof RequestModules]: AnyHandler<Resource[K]>
      },
      MakeDependencies extends NonEmptyReadonlyArray<Layer.Any> | never[]
    >(
      dependencies: MakeDependencies,
      make: (
        match: any
      ) =>
        | Effect.Effect<THandlers, MakeE, MakeR>
        | Generator<Yieldable<any, any, MakeE, MakeR>, THandlers>
    ) => {
      const dependenciesL = (dependencies ? Layer.mergeAll(...dependencies as any) : Layer.empty) as Layer.Layer<
        LayerUtils.GetLayersSuccess<MakeDependencies>,
        LayerUtils.GetLayersError<MakeDependencies>,
        LayerUtils.GetLayersContext<MakeDependencies>
      >

      const layer = Effect
        .gen(function*() {
          const finalMake = ((make as any)[Symbol.toStringTag] === "GeneratorFunction"
            ? Effect.fnUntraced(make as any)(router3) as any
            : make(router3) as any) as Effect.Effect<THandlers, MakeE, MakeR>

          const controllers = yield* finalMake

          // Read the middleware from the resource's request classes at runtime
          const mw = meta.middleware as any

          // return make.pipe(Effect.map((c) => controllers(c, dependencies)))
          const mapped = typedKeysOf(requestModules).reduce((acc, cur) => {
            const handler = controllers[cur as keyof typeof controllers]
            const resource = rsc[cur]
            const rpcPath = `/rpc/${meta.moduleName}`

            acc[cur] = [
              handler._tag === RequestTypes.RAW
                ? class extends (resource as any) {
                  static success = S.toEncoded(resource.success)
                } as any
                : resource,
              (payload: any, headers: any) => {
                const result: any = handler.handler(payload, headers)
                if (resource.stream) {
                  // Wrap stream items as { _tag: "value", value } and append a final
                  // { _tag: "done", metadata } chunk carrying accumulated invalidation keys.
                  // V2: on failure, convert to { _tag: "error", error, metadata } chunk so
                  // clients can invalidate queries even when the stream fails.
                  const keysRef = Ref.makeUnsafe<ReadonlyArray<Invalidation.InvalidationKey>>([])
                  const invalidationSet = Invalidation.makeInvalidationSet(keysRef)
                  return Stream.concat(
                    (result as Stream.Stream<any, any, any>).pipe(
                      Stream.map((item: any) => ({ _tag: "value" as const, value: item })),
                      Stream.provideService(Invalidation.InvalidationSet, invalidationSet),
                      // V3: after each value chunk, drain accumulated keys and emit a "metadata"
                      // chunk if any keys were collected since the last drain. This lets clients
                      // invalidate queries mid-stream without waiting for the "done" chunk.
                      Stream.flatMap((valueChunk: any) =>
                        Stream
                          .fromEffect(
                            Ref.getAndSet(keysRef, []).pipe(
                              Effect.map((keys) =>
                                keys.length > 0
                                  ? [
                                    valueChunk,
                                    { _tag: "metadata" as const, metadata: { invalidateQueries: keys } }
                                  ]
                                  : [valueChunk]
                              )
                            )
                          )
                          .pipe(Stream.flatMap(Stream.fromIterable))
                      ),
                      // V2: catch stream failures and embed them in the stream as an error chunk
                      Stream.catch((err: any) =>
                        Stream.fromEffect(
                          Ref.get(keysRef).pipe(
                            Effect.flatMap((keys) =>
                              Effect.fail({
                                _tag: "error" as const,
                                error: err,
                                metadata: { invalidateQueries: keys }
                              })
                            )
                          )
                        )
                      )
                    ),
                    Stream.fromEffect(
                      Ref.get(keysRef).pipe(
                        Effect.map((keys) => ({ _tag: "done" as const, metadata: { invalidateQueries: keys } }))
                      )
                    )
                  )
                }
                const spanAttributes: Record<string, string> = {
                  "rpc.system": "effect-app",
                  "rpc.service": meta.moduleName,
                  "rpc.method": resource._tag,
                  "code.function.name": resource._tag,
                  "code.namespace": meta.moduleName,
                  "app.rpc.type": resource.type,
                  "http.request.method": "POST",
                  "url.path": rpcPath,
                  "url.query": `action=${resource._tag}`
                }
                assignHeaderAttribute(spanAttributes, headers, "x-locale")
                assignHeaderAttribute(spanAttributes, headers, "x-store-id")
                assignHeaderAttribute(spanAttributes, headers, "x-fe-device-id")
                let effect = (result as Effect.Effect<unknown, unknown, unknown>).pipe(
                  Effect.withSpan(`${meta.moduleName}/${resource._tag}`, {
                    kind: "server",
                    attributes: spanAttributes,
                    sampled: false // Not sampled by OTel; enables quick navigation to source on error.
                  }, {
                    captureStackTrace: () => handler.stack // capturing the handler stack is the main reason why we are doing the span here
                  })
                )

                // Commands: provide a request-scoped `InvalidationSet` and wrap both
                // success (`CommandResponseWithMetaData`) and handler-thrown failure
                // (`CommandFailureWithMetaData`) so the client receives accumulated
                // invalidation keys on either path. Middleware-thrown errors bypass the
                // wrap (they fail the outer effect before reaching this `.catch`) and
                // flow raw on the Cause; client decodes them via the rpc's
                // `middlewares[*].error` failure-union channel.
                if (resource.type === "command") {
                  const keysRef = Ref.makeUnsafe<ReadonlyArray<Invalidation.InvalidationKey>>([])
                  const invalidationSet = Invalidation.makeInvalidationSet(keysRef)
                  effect = effect.pipe(
                    Effect.provideService(Invalidation.InvalidationSet, invalidationSet),
                    Effect.flatMap((value) =>
                      Ref.get(keysRef).pipe(
                        Effect.map((keys) => ({ payload: value, metadata: { invalidateQueries: keys } }) as any)
                      )
                    ),
                    Effect.catch((err: any) =>
                      Ref.get(keysRef).pipe(
                        Effect.flatMap((keys) =>
                          Effect.fail({
                            _tag: "CommandFailureWithMetaData" as const,
                            error: err,
                            metadata: { invalidateQueries: keys }
                          })
                        )
                      )
                    )
                  )
                }

                return applyRequestTypeInterruptibility(resource.type, effect)
              }
            ] as const
            return acc
          }, {} as any) as {
            [K in keyof RequestModules]: [
              Resource[K],
              (
                req: any,
                headers: HttpHeaders.Headers
              ) => Effect.Effect<
                Effect.Success<ReturnType<THandlers[K]["handler"]>>,
                | Effect.Error<ReturnType<THandlers[K]["handler"]>>
                | SafeGetEffectError<ResourceRequestContextMap, Resource[K]["config"]>,
                Exclude<
                  Effect.Services<ReturnType<THandlers[K]["handler"]>>,
                  ResourceContextProviderA | SafeGetEffectContext<ResourceRequestContextMap, Resource[K]["config"]>
                >
              >
            ]
          }

          const rpcs = RpcGroup
            .make(
              ...typedValuesOf(mapped).map(([resource]) => {
                const isStream = resource.stream
                const isCommand = resource.type === "command"
                return (isCommand
                  ? isStream
                    ? Invalidation.makeStreamRpc(resource._tag, {
                      payload: resource,
                      success: resource.success,
                      error: resource.error,
                      stream: true as const
                    })
                    : Invalidation.makeCommandRpc(resource._tag, {
                      payload: resource,
                      success: resource.success,
                      error: resource.error
                    })
                  : Rpc.make(resource._tag, {
                    payload: resource,
                    success: resource.success,
                    error: resource.error,
                    stream: isStream
                  }))
                  .annotate(mw.requestContext, resource.config ?? {})
                  .annotate(RequestTypeAnnotation, resource.type)
              })
            )
            .prefix(`${meta.moduleName}.`)
            .middleware(mw)

          const rpc = rpcs
            .toLayer(Effect.gen(function*() {
              return typedValuesOf(mapped).reduce((acc, [resource, handler]) => {
                acc[`${meta.moduleName}.${resource._tag}`] = handler
                return acc
              }, {} as Record<string, any>) as any // TODO
            })) as unknown as Layer.Layer<
              { [K in keyof RequestModules]: Rpc.Handler<K> },
              MakeE,
              RpcRouteR<typeof mapped[keyof typeof mapped]>
            >

          return RpcServer
            .layerHttp({
              spanPrefix: rpcServerSpanPrefix,
              group: rpcs,
              path: ("/rpc/" + meta.moduleName) as `/${typeof meta.moduleName}`,
              protocol: "http"
            })
            .pipe(
              Layer.provide(rpc),
              Layer.provideMerge(
                Layer.succeed(
                  HttpMiddleware.TracerDisabledWhen,
                  (request) => isRpcServerRequestForModule(meta.moduleName, request.url)
                )
              )
            )
        })
        .pipe(Layer.unwrap)

      const routes = layer.pipe(
        Layer.provide([
          dependenciesL,
          (middlewareLive ?? Layer.empty) as Layer.Layer<any, any, any>
        ])
      )

      const check = options?.check
      return check
        ? Effect
          .gen(function*() {
            if (!(yield* check)) {
              yield* Effect.logWarning(`Skipping router for module ${meta.moduleName}`)
              return Layer.empty
            }
            return routes
          })
          .pipe(Layer.unwrap)
        : routes
    }

    const effect: {
      // Multiple times duplicated the "good" overload, so that errors will only mention the last overload when failing
      <
        const Make extends {
          dependencies?: ReadonlyArray<Layer.Any>
          effect: (match: typeof router3) => Generator<
            Yieldable<
              any,
              any,
              any,
              any
            >,
            { [K in keyof FilterRequestModules<Resource>]: AnyHandler<Resource[K]> }
          >
          /** @deprecated */
          readonly ಠ_ಠ: never
        }
      >(
        make: Make
      ):
        & Layer.Layer<
          never,
          | MakeErrors<Make>
          | MakeDepsE<Make>
          | Layer.Error<ResourceMWDefault>,
          | MakeDepsIn<Make>
          | Layer.Services<ResourceMWDefault>
          | Exclude<
            MakeContext<Make>,
            MakeDepsOut<Make>
          >
          | RpcSerialization.RpcSerialization
        >
        & {
          // just for type testing purposes
          [TypeTestId]: Make
        }
      <
        const Make extends {
          dependencies?: ReadonlyArray<Layer.Any>
          // v4: generators yield Yieldable with asEffect()
          effect: (match: typeof router3) => Generator<
            Yieldable<any, any, any, any>,
            { [K in keyof FilterRequestModules<Resource>]: AnyHandler<Resource[K]> }
          >
        }
      >(
        make: Make
      ):
        & Layer.Layer<
          never,
          | MakeErrors<Make>
          | MakeDepsE<Make>
          | Layer.Error<ResourceMWDefault>,
          | MakeDepsIn<Make>
          | Layer.Services<ResourceMWDefault>
          | Exclude<
            MakeContext<Make>,
            MakeDepsOut<Make>
          >
          | RpcSerialization.RpcSerialization
        >
        & {
          // just for type testing purposes
          readonly [TypeTestId]: Make
        }
    } =
      ((make: { dependencies: any; effect: any }) =>
        Object.assign(makeRoutes(make.dependencies, make.effect), { make })) as any

    return effect
  }

  function matchAll<
    T extends {
      [key: string]: Layer.Layer<never, any, any>
    }
  >(
    handlers: T
  ) {
    const routers = typedValuesOf(handlers)

    return Layer.mergeAll(...routers as [any]) as unknown as Layer.Layer<
      never,
      Layer.Error<typeof handlers[keyof typeof handlers]>,
      Layer.Services<typeof handlers[keyof typeof handlers]>
    >
  }

  return {
    matchAll,
    Router: matchFor
  }
}

export type MakeDeps<Make> = Make extends { readonly dependencies: ReadonlyArray<Layer.Any> }
  ? Make["dependencies"][number]
  : never

export type MakeErrors<Make> = /*Make extends { readonly effect: (_: any) => Effect.Effect<any, infer E, any> } ? E
  : Make extends { readonly effect: (_: any) => Effect.Effect<any, never, any> } ? never
  : */
  // v4: generators yield Yieldable with asEffect()
  Make extends { readonly effect: (_: any) => Generator<Yieldable<any, any, never, any>> } ? never
    : Make extends { readonly effect: (_: any) => Generator<Yieldable<any, any, infer E, any>> } ? E
    : never

export type MakeContext<Make> = /*Make extends { readonly effect: (_: any) => Effect.Effect<any, any, infer R> } ? R
  : Make extends { readonly effect: (_: any) => Effect.Effect<any, any, never> } ? never
  : */
  // v4: generators yield Yieldable with asEffect()
  Make extends { readonly effect: (_: any) => Generator<Yieldable<any, any, any>> } ? never
    : Make extends { readonly effect: (_: any) => Generator<Yieldable<any, any, any, infer R>> } ? R
    : never

export type MakeHandlers<Make, _Handlers extends Record<string, any>> = /*Make extends
  { readonly effect: (_: any) => Effect.Effect<{ [K in keyof Handlers]: AnyHandler<Handlers[K]> }, any, any> }
  ? Effect.Success<ReturnType<Make["effect"]>>
  : */
  Make extends { readonly effect: (_: any) => Generator<any, infer S> } ? S
    : never

export type MakeDepsE<Make> = Layer.Error<MakeDeps<Make>>

export type MakeDepsIn<Make> = Layer.Services<MakeDeps<Make>>

export type MakeDepsOut<Make> = Layer.Success<MakeDeps<Make>>

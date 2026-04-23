/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-empty-object-type */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { Config, Effect, Layer, type NonEmptyReadonlyArray, Predicate, S, type Scope } from "effect-app"
import { getMeta } from "effect-app/client"
import { type HttpHeaders } from "effect-app/http"
import { type GetEffectContext, type GetEffectError, type RpcContextMap } from "effect-app/rpc/RpcContextMap"
import { type TypeTestId } from "effect-app/TypeTest"
import { typedKeysOf, typedValuesOf } from "effect-app/utils"
import { type Yieldable } from "effect/Effect"
import { Rpc, RpcGroup, type RpcSerialization, RpcServer } from "effect/unstable/rpc"
import { type LayerUtils } from "./layerUtils.js"
import { RequestType as RequestTypeAnnotation, type RouterMiddleware } from "./routing/middleware.js"

export * from "./routing/middleware.js"

export const applyRequestTypeInterruptibility = <A, E, R>(
  requestType: "command" | "query",
  effect: Effect.Effect<A, E, R>
) => requestType === "command" ? Rpc.uninterruptible(effect) : effect

// it's the result of extending S.Req setting success, config
// it's a schema plus some metadata
export type AnyRequestModule = S.Top & {
  _tag: string // unique identifier for the request module
  type: "command" | "query"
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
  handler: (req: S.Schema.Type<Action>, headers: HttpHeaders.Headers) => Effect.Effect<A, E, R>
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

type Match<
  Resource extends Record<string, any>,
  RequestContextMap extends Record<string, any>,
  RT extends RequestType,
  Key extends keyof Resource
> = {
  // note: the defaults of = never prevent the whole router to error (??)
  <A extends GetSuccessShape<Resource[Key], RT>, R2 = never, E = never>(
    f: Effect.Effect<A, E, R2>
  ): Handler<
    Resource[Key],
    RT,
    Exclude<
      Exclude<R2, GetEffectContext<RequestContextMap, Resource[Key]["config"]>>,
      Scope.Scope
    >
  >

  <A extends GetSuccessShape<Resource[Key], RT>, R2 = never, E = never>(
    f: (req: S.Schema.Type<Resource[Key]>) => Effect.Effect<A, E, R2>
  ): Handler<
    Resource[Key],
    RT,
    Exclude<
      Exclude<R2, GetEffectContext<RequestContextMap, Resource[Key]["config"]>>,
      Scope.Scope
    >
  >
}

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

export const makeRouter = <
  Self,
  RequestContextMap extends Record<string, RpcContextMap.Any>,
  MakeMiddlewareE,
  MakeMiddlewareR,
  ContextProviderA,
  ContextProviderE,
  ContextProviderR,
  RequestContextId
>(
  middleware: RouterMiddleware<
    Self,
    RequestContextMap,
    MakeMiddlewareE,
    MakeMiddlewareR,
    ContextProviderA,
    ContextProviderE,
    ContextProviderR,
    RequestContextId
  >
) => {
  /**
   * Create a Router for specified resource
   * if `check` is provided, the router will only be created if the effect succeeds with true
   */
  function matchFor<
    const Resource extends Record<string, any>
  >(
    rsc: Resource,
    options?: { check?: Effect.Effect<boolean> }
  ) {
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
        GetEffectContext<RequestContextMap, Action["config"]> | ContextProviderA
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
      GetEffectContext<RequestContextMap, Action["config"]> | ContextProviderA
    >

    type HandlerEff<
      Action extends AnyRequestModule,
      RT extends RequestType
    > = Effect.Effect<
      GetSuccessShape<Action, RT>,
      S.Schema.Type<GetFailure<Action>> | S.SchemaError,
      // the actual implementation of the handler may just require the dynamic context provided by the middleware
      // and the per request context provided by the context provider
      GetEffectContext<RequestContextMap, Action["config"]> | ContextProviderA
    >

    type Handlers<Action extends AnyRequestModule, RT extends RequestType> =
      | HandlerWithInputGen<Action, RT>
      | HandlerWithInputEff<Action, RT>
      | HandlerEff<Action, RT>

    type HandlersDecoded<Action extends AnyRequestModule> = Handlers<Action, RequestTypes.DECODED>

    type HandlersRaw<Action extends AnyRequestModule> =
      | { raw: HandlerWithInputGen<Action, RequestTypes.RAW> }
      | { raw: HandlerWithInputEff<Action, RequestTypes.RAW> }
      | { raw: HandlerEff<Action, RequestTypes.RAW> }

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
          return Effect.isEffect(handlerImpl)
            // oxlint-disable-next-line typescript/no-extraneous-class
            ? class {
              static request = rsc[cur]
              static stack = stack
              static _tag = RequestTypes.DECODED
              static handler = () => handlerImpl
            }
            // oxlint-disable-next-line typescript/no-extraneous-class
            : class {
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
              return Effect.isEffect(handlerImpl)
                // oxlint-disable-next-line typescript/no-extraneous-class
                ? class {
                  static request = rsc[cur]
                  static stack = stack
                  static _tag = RequestTypes.RAW
                  static handler = () => handlerImpl
                }
                // oxlint-disable-next-line typescript/no-extraneous-class
                : class {
                  static request = rsc[cur]
                  static stack = stack
                  static _tag = RequestTypes.RAW
                  static handler = handlerImpl
                }
            }
        })
        return prev
      },
      {} as RouteMatcher<RequestContextMap, Resource>
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
              : Impl[K]["raw"] extends Effect.Effect<any, any, infer R> ? R
              : Impl[K]["raw"] extends (...args: any[]) => Generator<
                Yieldable<any, any, any, infer R>,
                any,
                any
              > ? R
              : never
              : Impl[K] extends (...args: any[]) => Effect.Effect<any, any, infer R> ? R
              : Impl[K] extends Effect.Effect<any, any, infer R> ? R
              : Impl[K] extends (...args: any[]) => Generator<
                Yieldable<any, any, any, infer R>,
                any,
                any
              > ? R
              : never,
            | GetEffectContext<RequestContextMap, Resource[K]["config"]>
            | ContextProviderA
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
        | Generator<Yieldable<any, any, MakeE, MakeR>, THandlers, any>
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

          // return make.pipe(Effect.map((c) => controllers(c, dependencies)))
          const mapped = typedKeysOf(requestModules).reduce((acc, cur) => {
            const handler = controllers[cur as keyof typeof controllers]
            const resource = rsc[cur]

            acc[cur] = [
              handler._tag === RequestTypes.RAW
                ? class extends (resource as any) {
                  static success = S.toEncoded(resource.success)
                } as any
                : resource,
              (payload: any, headers: any) => {
                const effect = (handler.handler(payload, headers) as Effect.Effect<unknown, unknown, unknown>).pipe(
                  Effect.withSpan(`Request.${meta.moduleName}.${resource._tag}`, {}, {
                    captureStackTrace: () => handler.stack // capturing the handler stack is the main reason why we are doing the span here
                  })
                )

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
                | GetEffectError<RequestContextMap, Resource[K]["config"]>,
                Exclude<
                  Effect.Services<ReturnType<THandlers[K]["handler"]>>,
                  ContextProviderA | GetEffectContext<RequestContextMap, Resource[K]["config"]>
                >
              >
            ]
          }

          const rpcs = RpcGroup
            .make(
              ...typedValuesOf(mapped).map(([resource]) => {
                return Rpc
                  .make(resource._tag, { payload: resource, success: resource.success, error: resource.error })
                  .annotate(middleware.requestContext, resource.config ?? {})
                  .annotate(RequestTypeAnnotation, resource.type)
              })
            )
            .prefix(`${meta.moduleName}.`)
            .middleware(middleware as any)

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
              spanPrefix: "RpcServer." + meta.moduleName,
              group: rpcs,
              path: ("/rpc/" + meta.moduleName) as `/${typeof meta.moduleName}`,
              protocol: "http"
            })
            .pipe(Layer.provide(rpc))
        })
        .pipe(Layer.unwrap)

      const routes = layer.pipe(
        Layer.provide([
          dependenciesL,
          middleware.Default
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
            { [K in keyof FilterRequestModules<Resource>]: AnyHandler<Resource[K]> },
            any
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
          | Layer.Error<typeof middleware.Default>,
          | MakeDepsIn<Make>
          | Layer.Services<typeof middleware.Default>
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
            { [K in keyof FilterRequestModules<Resource>]: AnyHandler<Resource[K]> },
            any
          >
        }
      >(
        make: Make
      ):
        & Layer.Layer<
          never,
          | MakeErrors<Make>
          | MakeDepsE<Make>
          | Layer.Error<typeof middleware.Default>,
          | MakeDepsIn<Make>
          | Layer.Services<typeof middleware.Default>
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
  Make extends { readonly effect: (_: any) => Generator<Yieldable<any, any, never, any>, any, any> } ? never
    : Make extends { readonly effect: (_: any) => Generator<Yieldable<any, any, infer E, any>, any, any> } ? E
    : never

export type MakeContext<Make> = /*Make extends { readonly effect: (_: any) => Effect.Effect<any, any, infer R> } ? R
  : Make extends { readonly effect: (_: any) => Effect.Effect<any, any, never> } ? never
  : */
  // v4: generators yield Yieldable with asEffect()
  Make extends { readonly effect: (_: any) => Generator<Yieldable<any, any, any, never>, any, any> } ? never
    : Make extends { readonly effect: (_: any) => Generator<Yieldable<any, any, any, infer R>, any, any> } ? R
    : never

export type MakeHandlers<Make, _Handlers extends Record<string, any>> = /*Make extends
  { readonly effect: (_: any) => Effect.Effect<{ [K in keyof Handlers]: AnyHandler<Handlers[K]> }, any, any> }
  ? Effect.Success<ReturnType<Make["effect"]>>
  : */
  Make extends { readonly effect: (_: any) => Generator<any, infer S, any> } ? S
    : never

export type MakeDepsE<Make> = Layer.Error<MakeDeps<Make>>

export type MakeDepsIn<Make> = Layer.Services<MakeDeps<Make>>

export type MakeDepsOut<Make> = Layer.Success<MakeDeps<Make>>

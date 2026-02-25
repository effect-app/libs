/* eslint-disable @typescript-eslint/no-explicit-any */
import { Context, Effect, Layer, type NonEmptyReadonlyArray, pipe, type Scope, type ServiceMap } from "effect-app"

import { type HttpRouter } from "effect-app/http"
import { type EffectGenUtils } from "effect-app/utils/gen"
import { type Yieldable } from "effect/Effect"
import { type ContextTagWithDefault, type GetContext, type LayerUtils, mergeContexts } from "./layerUtils.js"

export interface ContextProviderId {
  _tag: "ContextProvider"
}

/**
 * TDeps is an array of services with Default implementation
 * each service is an effect which builds some context for each request
 */
type TDepsArr<TDeps extends ReadonlyArray<any>> = {
  // the following freaking shit helps me with nested variance issues: it wasn't sufficient to use never/any/unknown for
  // the various type parameters, not anymore because of () => Generator<YieldWrap<Effect.Effect craziness
  // existential types may help, and all the following usages of infer _ have that meaning: I do not care which is the
  // actual type in that position, I just wanna set the overall structure
  [K in keyof TDeps]: TDeps[K] extends //
  // E = never => the context provided cannot trigger errors
  // TODO: remove HttpLayerRouter.Provided - it's not even relevant outside of Http context, while ContextProviders are for anywhere. Only support Scope.Scope?
  //  _R extends HttpLayerRouter.Provided => the context provided can only have what HttpLayerRouter.Provided provides as requirements
  (
    ContextTagWithDefault.Base<Effect.Effect<ServiceMap.ServiceMap<infer _1>, never, infer _R> & { _tag: infer _2 }>
  ) ? [_R] extends [HttpRouter.Provided] ? TDeps[K]
    : `HttpLayerRouter.Provided is the only requirement ${TDeps[K]["Service"][
      "_tag"
    ]}'s returned effect can have`
    : TDeps[K] extends (
      ContextTagWithDefault.Base<
        & (() => Generator<
          infer _YW,
          infer _1,
          infer _2
        >)
        & { _tag: infer _3 }
      >
    ) // [_YW] extends [never] if no yield* is used and just some context is returned
      ? [_YW] extends [never] ? TDeps[K]
      : [_YW] extends [Yieldable<any, infer _2, never, infer _R>] ? [_R] extends [HttpRouter.Provided] ? TDeps[K]
        : `HttpLayerRouter.Provided is the only requirement ${TDeps[K]["Service"][
          "_tag"
        ]}'s returned effect can have`
      : "WTF are you yielding man?"
    : `You cannot throw errors from providers`
}

// Note: the type here must be aligned with MergedContextProvider
export const mergeContextProviders = <
  TDeps extends ReadonlyArray<any>
>(
  // long life to reverse mapped types
  ...deps: TDepsArr<TDeps>
): {
  dependencies: { [K in keyof TDeps]: TDeps[K]["Default"] }
  effect: Effect.Effect<
    Effect.Effect<
      // we need to merge all contexts into one
      // v4: Service.Shape extracts the service value type (v3's Tag.Identifier)
      ServiceMap.ServiceMap<GetContext<EffectGenUtils.Success<ServiceMap.Service.Shape<TDeps[number]>>>>,
      never,
      EffectGenUtils.Context<ServiceMap.Service.Shape<TDeps[number]>>
    >,
    LayerUtils.GetLayersError<{ [K in keyof TDeps]: TDeps[K]["Default"] }>,
    LayerUtils.GetLayersSuccess<{ [K in keyof TDeps]: TDeps[K]["Default"] }>
  >
} => ({
  dependencies: deps.map((_) => (_ as any).Default) as any,
  effect: Effect.gen(function*() {
    // uses the tags to request the context providers
    const makers = yield* Effect.all(deps as any[])
    return Effect
      .gen(function*() {
        const services = (makers as any[]).map((handle, i) => (
          {
            maker: deps[i],
            handle: handle[Symbol.toStringTag] === "GeneratorFunction" ? Effect.fnUntraced(handle)() : handle
          }
        ))
        // services are effects which return some ServiceMap.ServiceMap<...>
        const context = yield* mergeContexts(services as any)
        return context
      })
  }) as any
})

// Effect Rpc Middleware: for single tag providing, we could use Provides, for providing Context or Layer (bad boy) we could use Wrap..
export const ContextProvider = <
  ContextProviderA,
  MakeContextProviderE,
  MakeContextProviderR,
  ContextProviderR extends Scope.Scope,
  Dependencies extends NonEmptyReadonlyArray<Layer.Any>
>(
  input: {
    effect: Effect.Effect<
      | Effect.Effect<ContextProviderA, never, ContextProviderR>
      | (() => Generator<
        Yieldable<any, any, never, ContextProviderR>,
        ContextProviderA,
        any
      >),
      MakeContextProviderE,
      MakeContextProviderR | Scope.Scope
    >
    dependencies?: Dependencies
  }
) => {
  const ctx = Context.Service<
    ContextProviderId,
    Effect.Effect<ContextProviderA, never, ContextProviderR>
  >(
    "ContextProvider"
  )
  const e = input.effect.pipe(
    Effect.map((eg) => (eg as any)[Symbol.toStringTag] === "GeneratorFunction" ? Effect.fnUntraced(eg as any)() : eg)
  )
  const l = Layer.effect(ctx, e as any)
  return Object.assign(ctx, {
    Default: l.pipe(
      input.dependencies ? Layer.provide([...input.dependencies] as [Layer.Any, ...Layer.Any[]]) as any : (_: any) => _
    ) satisfies Layer.Layer<
      ContextProviderId,
      | MakeContextProviderE
      | LayerUtils.GetLayersError<Dependencies>,
      | Exclude<MakeContextProviderR, LayerUtils.GetLayersSuccess<Dependencies>>
      | LayerUtils.GetLayersContext<Dependencies>
    >
  })
}

// Note: the type here must be aligned with mergeContextProviders
export const MergedContextProvider = <
  TDeps extends ReadonlyArray<any>
>(
  // long life to reverse mapped types
  ...deps: TDepsArr<TDeps>
) =>
  pipe(
    deps as [Parameters<typeof mergeContextProviders>[0]],
    (_) => mergeContextProviders(..._),
    (_) => ContextProvider(_ as any)
  ) as unknown as ContextTagWithDefault<
    ContextProviderId,
    Effect.Effect<
      // we need to merge all contexts into one
      // v4: Service.Shape extracts the service value type (v3's Tag.Identifier)
      ServiceMap.ServiceMap<GetContext<EffectGenUtils.Success<ServiceMap.Service.Shape<TDeps[number]>>>>,
      never,
      EffectGenUtils.Context<ServiceMap.Service.Shape<TDeps[number]>>
    >,
    LayerUtils.GetLayersError<{ [K in keyof TDeps]: TDeps[K]["Default"] }>,
    // v4: Identifier here is correct — it's the nominal service identity for layer provide/exclude
    | Exclude<
      ServiceMap.Service.Identifier<TDeps[number]>,
      LayerUtils.GetLayersSuccess<{ [K in keyof TDeps]: TDeps[K]["Default"] }>
    >
    | LayerUtils.GetLayersContext<{ [K in keyof TDeps]: TDeps[K]["Default"] }>
  >

export const EmptyContextProvider = ContextProvider({ effect: Effect.succeed(Effect.succeed(Context.empty())) })

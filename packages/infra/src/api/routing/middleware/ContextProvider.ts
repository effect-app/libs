import { type Array, Context, Effect, Layer, type NonEmptyArray, pipe, type Scope } from "effect-app"
import { type HttpRouter } from "effect-app/http"
import { type Tag } from "effect/Context"
import { type ContextTagWithDefault, type LayerUtils } from "../../layerUtils.js"
import { mergeContexts } from "./dynamic-middleware.js"

// the context provider provides additional stuff
export type ContextProviderShape<ContextProviderA, ContextProviderR extends HttpRouter.HttpRouter.Provided> = Effect<
  Context.Context<ContextProviderA>,
  never, // no errors are allowed
  ContextProviderR
>

export interface ContextProviderId {
  _tag: "ContextProvider"
}

/**
 * TDeps is an array of services whit Default implementation
each service is an effect which builds some context for each request
*/
type TDepsArr = Array.NonEmptyReadonlyArray<
  & (
    // E = never => the context provided cannot trigger errors
    // can't put HttpRouter.HttpRouter.Provided as R here because of variance
    // (TDeps is an input type parameter so it's contravariant therefore Effect's R becomes contravariant too)
    | Context.Tag<any, Effect<Context.Context<any>, never, any> & { _tag: any }>
    | Context.Tag<any, Effect<Context.Context<any>, never, never> & { _tag: any }>
  )
  & {
    Default: Layer.Layer<Effect<Context.Context<any>> & { _tag: any }, any, any>
  }
>

// Note: the type here must be aligned with MergedContextProvider
export const mergeContextProviders = <
  TDeps extends TDepsArr
>(
  ...deps: {
    [K in keyof TDeps]: TDeps[K]["Service"] extends Effect<Context.Context<any>, never, HttpRouter.HttpRouter.Provided>
      ? TDeps[K]
      : `HttpRouter.HttpRouter.Provided are the only requirements ${TDeps[K]["Service"][
        "_tag"
      ]}'s returned effect can have`
  }
): {
  dependencies: { [K in keyof TDeps]: TDeps[K]["Default"] }
  effect: Effect.Effect<
    Effect.Effect<
      Effect.Success<Tag.Service<TDeps[number]>>,
      never,
      Effect.Context<Tag.Service<TDeps[number]>>
    >,
    LayerUtils.GetLayersError<{ [K in keyof TDeps]: TDeps[K]["Default"] }>,
    LayerUtils.GetLayersSuccess<{ [K in keyof TDeps]: TDeps[K]["Default"] }>
  >
} => ({
  dependencies: deps.map((_) => _.Default) as any,
  effect: Effect.gen(function*() {
    const makers = yield* Effect.all(deps)
    return Effect
      .gen(function*() {
        const services = (makers as any[]).map((handle, i) => ({ maker: deps[i], handle }))
        // services are effects which return some Context.Context<...>
        const context = yield* mergeContexts(services as any)
        return context
      })
  }) as any
})

export const ContextProvider = <
  ContextProviderA,
  MakeContextProviderE,
  MakeContextProviderR,
  ContextProviderR extends HttpRouter.HttpRouter.Provided,
  Dependencies extends NonEmptyArray<Layer.Layer.Any>
>(
  input: {
    effect: Effect<
      Effect<ContextProviderA, never, ContextProviderR>,
      MakeContextProviderE,
      MakeContextProviderR | Scope
    >
    dependencies?: Dependencies
  }
) => {
  const ctx = Context.GenericTag<
    ContextProviderId,
    Effect<ContextProviderA, never, ContextProviderR>
  >(
    "ContextProvider"
  )
  const l = Layer.scoped(ctx, input.effect)
  return Object.assign(ctx, {
    Default: l.pipe(
      input.dependencies ? Layer.provide(input.dependencies) as any : (_) => _
    ) as Layer.Layer<
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
  TDeps extends TDepsArr
>(
  ...deps: {
    [K in keyof TDeps]: TDeps[K]["Service"] extends Effect<Context.Context<any>, never, HttpRouter.HttpRouter.Provided>
      ? TDeps[K]
      : `HttpRouter.HttpRouter.Provided are the only requirements ${TDeps[K]["Service"][
        "_tag"
      ]}'s returned effect can have`
  }
) =>
  pipe(
    deps as [Parameters<typeof mergeContextProviders>[0]],
    (_) => mergeContextProviders(..._),
    (_) => ContextProvider(_ as any)
  ) as unknown as ContextTagWithDefault<
    ContextProviderId,
    Effect.Effect<
      Effect.Success<Tag.Service<TDeps[number]>>,
      never,
      Effect.Context<Tag.Service<TDeps[number]>>
    >,
    LayerUtils.GetLayersError<{ [K in keyof TDeps]: TDeps[K]["Default"] }>,
    | Exclude<
      Tag.Service<TDeps[number]>,
      LayerUtils.GetLayersSuccess<{ [K in keyof TDeps]: TDeps[K]["Default"] }>
    >
    | LayerUtils.GetLayersContext<{ [K in keyof TDeps]: TDeps[K]["Default"] }>
  >

export const EmptyContextProvider = ContextProvider({ effect: Effect.succeed(Effect.succeed(Context.empty())) })

import { Context, Effect, Layer, type NonEmptyArray, pipe, type Scope } from "effect-app"
import { type HttpRouter } from "effect-app/http"
import { type Tag } from "effect/Context"
import { type YieldWrap } from "effect/Utils"
import { type ContextTagWithDefault, type GetContext, type LayerUtils, mergeContexts } from "../../layerUtils.js"

namespace EffectGenUtils {
  export type Success<EG> = EG extends Effect<infer A, infer _E, infer _R> ? A
    : EG extends (..._: infer _3) => Generator<YieldWrap<Effect<infer _, infer _E, infer _R>>, infer A, infer _2> ? A
    : never

  export type Error<EG> = EG extends Effect<infer _A, infer E, infer _R> ? E
    : EG extends (..._: infer _3) => Generator<YieldWrap<Effect<infer _, infer E, infer _R>>, infer _A, infer _2> ? E
    : never

  export type Context<EG> = EG extends Effect<infer _A, infer _E, infer R> ? R
    : EG extends (..._: infer _3) => Generator<YieldWrap<Effect<infer _, infer _E, infer R>>, infer _A, infer _2> ? R
    : never
}

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
 * TDeps is an array of services with Default implementation
 * each service is an effect which builds some context for each request
 */
type TDepsArr<TDeps extends ReadonlyArray<any>> = {
  // the following freaking shit helps me with nested variance issues: it wasn't sufficient to use never/any/unknown for
  // the various type parameters, not anymore because of () => Generator<YieldWrap<Effect craziness
  // existential types may help, and all the following usages of infer _ have that meaning: I do not care which is the
  // actual type in that position, I just wanna set the overall structure
  [K in keyof TDeps]: TDeps[K] extends //
  // E = never => the context provided cannot trigger errors
  //  _R extends HttpRouter.HttpRouter.Provided => the context provided can only have what HttpRouter.Provided provides as requirements
  (
    & Context.Tag<
      infer _1,
      Effect<Context.Context<infer _2>, never, infer _R extends HttpRouter.HttpRouter.Provided> & { _tag: infer _4 }
    >
    & {
      Default: Layer.Layer<Effect<Context.Context<infer _5>> & { _tag: infer _6 }, infer _7, infer _8>
    }
  ) ? TDeps[K]
    : TDeps[K] extends //
    (
      & Context.Tag<
        infer _1,
        (() => Generator<
          // can't just place YieldWrap here, another infer is needed for variance
          infer _YW extends YieldWrap<Effect<infer _2, never, infer _R extends HttpRouter.HttpRouter.Provided>>,
          Context.Context<infer _4>,
          infer _5
        >) & {
          _tag: infer _6
        }
      >
      & {
        Default: Layer.Layer<
          (() => Generator<
            // can't just place YieldWrap here, another infer is needed for variance
            infer _YW2 extends YieldWrap<Effect<infer _7, never, infer _RD extends HttpRouter.HttpRouter.Provided>>,
            Context.Context<infer _9>,
            infer _10
          >) & {
            _tag: infer _11
          },
          infer _12,
          infer _13
        >
      }
    ) ? TDeps[K]
    : `HttpRouter.HttpRouter.Provided is the only requirement ${TDeps[K]["Service"][
      "_tag"
    ]}'s returned effect can have, and you cannot throw errors from it.`
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
      Context.Context<GetContext<EffectGenUtils.Success<Tag.Service<TDeps[number]>>>>,
      never,
      EffectGenUtils.Context<Tag.Service<TDeps[number]>>
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
        // services are effects which return some Context.Context<...>
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
  ContextProviderR extends HttpRouter.HttpRouter.Provided,
  Dependencies extends NonEmptyArray<Layer.Layer.Any>
>(
  input: {
    effect: Effect<
      | Effect<ContextProviderA, never, ContextProviderR>
      | (() => Generator<
        YieldWrap<Effect<any, never, ContextProviderR>>,
        ContextProviderA,
        any
      >),
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
  const e = input.effect.pipe(
    Effect.map((eg) => (eg as any)[Symbol.toStringTag] === "GeneratorFunction" ? Effect.fnUntraced(eg as any)() : eg)
  )
  const l = Layer.scoped(ctx, e as any)
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
      Context.Context<GetContext<EffectGenUtils.Success<Tag.Service<TDeps[number]>>>>,
      never,
      EffectGenUtils.Context<Tag.Service<TDeps[number]>>
    >,
    LayerUtils.GetLayersError<{ [K in keyof TDeps]: TDeps[K]["Default"] }>,
    | Exclude<
      Tag.Service<TDeps[number]>,
      LayerUtils.GetLayersSuccess<{ [K in keyof TDeps]: TDeps[K]["Default"] }>
    >
    | LayerUtils.GetLayersContext<{ [K in keyof TDeps]: TDeps[K]["Default"] }>
  >

export const EmptyContextProvider = ContextProvider({ effect: Effect.succeed(Effect.succeed(Context.empty())) })

import { type Array, Effect, Layer, type Scope, type ServiceMap, type Types } from "effect"
import { type Yieldable } from "effect/Effect"
import { dual } from "effect/Function"
import { type EffectGenUtils } from "./utils/gen.js"

export * from "effect/Layer"

type Make<S, E = never, R = never> = DependenciesOpt & (MakeEff<S, E, R> | MakeGenNo<S> | MakeGen<S, E, R>)

type MakeEff<S, E, R> = {
  readonly make: Effect.Effect<S, E, R>
}
type MakeGen<S, E = never, R = never> = {
  readonly make: () => Generator<Yieldable<any, any, E, R>, S, any>
}
type MakeGenNo<S> = {
  readonly make: () => Generator<unknown, S>
}
type MakeErr<Opts> = Opts extends { make: () => any } ? EffectGenUtils.Error<Opts["make"]> : never
type MakeContext<Opts> = Opts extends { make: () => any } ? EffectGenUtils.ServiceMap<Opts["make"]> : never

type DependenciesOpt = { dependencies?: Array.NonEmptyReadonlyArray<Layer.Any> }
type Dependencies = { dependencies: Array.NonEmptyReadonlyArray<Layer.Any> }

// Local replacements for removed Effect.Service.MakeDeps* types
type MakeDepsE<Opts> = Opts extends { dependencies: ReadonlyArray<Layer.Layer<any, infer E, any>> } ? E : never
type MakeDepsOut<Opts> = Opts extends { dependencies: ReadonlyArray<Layer.Layer<infer Out, any, any>> } ? Out : never

type PackedLayers<I, Opts> =
  & Layer.Layer<
    I,
    MakeErr<Opts> | MakeDepsE<Opts>,
    Exclude<MakeContext<Opts>, Scope.Scope | MakeDepsOut<Opts>>
  >
  & {
    withoutDependencies: Layer.Layer<I, MakeErr<Opts>, Exclude<MakeContext<Opts>, Scope.Scope>>
  }

type PackedOrUnpackedLayer<I, Opts> = Opts extends Dependencies ? PackedLayers<I, Opts> & {}
  : Layer.Layer<I, MakeErr<Opts>, MakeContext<Opts>>

export const make: {
  <I, S>(
    tag: ServiceMap.Service<I, S>
  ): <Opts extends Make<Types.NoInfer<S>, any, any>>(
    options: Opts
  ) => PackedOrUnpackedLayer<I, Opts>
  <I, S, Opts extends Make<Types.NoInfer<S>, any, any>>(
    tag: ServiceMap.Service<I, S>,
    options: Opts
  ): PackedOrUnpackedLayer<I, Opts>
} = dual(2, (tag, options) => {
  const effect = options.make[Symbol.toStringTag] === "GeneratorFunction"
    ? Effect.fnUntraced(options.make)()
    : options.make
  const withoutDependencies = Layer.effect(tag, effect)
  if (options.dependencies) {
    return Object.assign(
      withoutDependencies.pipe(Layer.provide(options.dependencies)),
      { withoutDependencies }
    )
  } else {
    return withoutDependencies
  }
})

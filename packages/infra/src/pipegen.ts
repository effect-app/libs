/* eslint-disable unused-imports/no-unused-vars */
/* eslint-disable prefer-rest-params */
/* eslint-disable @typescript-eslint/no-unsafe-function-type */
import { Effect } from "effect-app"
import { type YieldWrap } from "effect/Utils"

// inspired by Effect.fnUntraced
export type FromGenToEffect<AEff, Eff> =
  & Effect.Effect<
    AEff,
    [Eff] extends [never] ? never
      : [Eff] extends [YieldWrap<Effect.Effect<infer _A, infer E, infer _R>>] ? E
      : never,
    [Eff] extends [never] ? never
      : [Eff] extends [YieldWrap<Effect.Effect<infer _A, infer _E, infer R>>] ? R
      : never
  >
  & {} // so it computes

// inspired by Effect.fnUntraced
export type EffectifyIfGen<A> = A extends
  Generator<infer Eff extends YieldWrap<Effect.Effect<any, any, any>>, infer AEff, never> ? FromGenToEffect<AEff, Eff>
  : A extends () => Generator<infer Eff extends YieldWrap<Effect.Effect<any, any, any>>, infer AEff, never>
    ? FromGenToEffect<AEff, Eff>
  : A

export function pipeGen<A>(
  a: A
): EffectifyIfGen<A>
export function pipeGen<A, B>(
  a: A,
  ab: (_: EffectifyIfGen<A>) => B
): EffectifyIfGen<B>
export function pipeGen<A, B, C>(
  a: A,
  ab: (_: EffectifyIfGen<A>) => B,
  bc: (_: EffectifyIfGen<B>) => C
): EffectifyIfGen<C>
export function pipeGen<A, B, C, D>(
  a: A,
  ab: (value: EffectifyIfGen<A>) => B,
  bc: (value: EffectifyIfGen<B>) => C,
  cd: (value: EffectifyIfGen<C>) => D
): EffectifyIfGen<D>
export function pipeGen<A, B, C, D, E>(
  a: A,
  ab: (value: EffectifyIfGen<A>) => B,
  bc: (value: EffectifyIfGen<B>) => C,
  cd: (value: EffectifyIfGen<C>) => D,
  de: (value: EffectifyIfGen<D>) => E
): EffectifyIfGen<E>
export function pipeGen<A, B, C, D, E, F>(
  a: A,
  ab: (value: EffectifyIfGen<A>) => B,
  bc: (value: EffectifyIfGen<B>) => C,
  cd: (value: EffectifyIfGen<C>) => D,
  de: (value: EffectifyIfGen<D>) => E,
  ef: (value: EffectifyIfGen<E>) => F
): EffectifyIfGen<F>
export function pipeGen<A, B, C, D, E, F, G>(
  a: A,
  ab: (value: EffectifyIfGen<A>) => B,
  bc: (value: EffectifyIfGen<B>) => C,
  cd: (value: EffectifyIfGen<C>) => D,
  de: (value: EffectifyIfGen<D>) => E,
  ef: (value: EffectifyIfGen<E>) => F,
  fg: (value: EffectifyIfGen<F>) => G
): EffectifyIfGen<G>
export function pipeGen<A, B, C, D, E, F, G, H>(
  a: A,
  ab: (value: EffectifyIfGen<A>) => B,
  bc: (value: EffectifyIfGen<B>) => C,
  cd: (value: EffectifyIfGen<C>) => D,
  de: (value: EffectifyIfGen<D>) => E,
  ef: (value: EffectifyIfGen<E>) => F,
  fg: (value: EffectifyIfGen<F>) => G,
  gh: (value: EffectifyIfGen<G>) => H
): EffectifyIfGen<H>
export function pipeGen(
  a: unknown,
  _ab?: Function,
  _bc?: Function,
  _cd?: Function,
  _de?: Function,
  _ef?: Function,
  _fg?: Function,
  _gh?: Function
): unknown {
  let ret = (a as any)[Symbol.toStringTag] === "GeneratorFunction" ? Effect.fnUntraced(a as any)() : a
  for (let i = 1; i < arguments.length; i++) {
    ret = (arguments[i][Symbol.toStringTag] === "GeneratorFunction" ? Effect.fnUntraced(arguments[i]) : arguments[i])(
      ret
    )
  }
  return ret
}

/* eslint-disable @typescript-eslint/no-explicit-any */
// TODO: Add effect cause/exit etc

import type { Chunk, Either, Option } from "effect"
import type { Effect, EffectTypeId } from "effect/Effect"

export function unifyEffect<X extends { readonly [EffectTypeId]: Effect.VarianceStruct<any, any, any> }>(
  self: X
): Effect<
  [X] extends [{ readonly [EffectTypeId]: { _A: (_: never) => infer A } }] ? A : never,
  [X] extends [{ readonly [EffectTypeId]: { _E: (_: never) => infer E } }] ? E : never,
  [X] extends [{ readonly [EffectTypeId]: { _R: (_: never) => infer R } }] ? R : never
> {
  return self as any
}

export function unifyChunk<X extends Chunk.Chunk<any>>(
  self: X
): Chunk.Chunk<[X] extends [Chunk.Chunk<infer A>] ? A : never> {
  return self
}

export function unifyEither<X extends Either.Either<any, any>>(
  self: X
): Either.Either<
  X extends Either.Right<any, infer AX> ? AX : X extends Either.Left<any, infer AX> ? AX : never,
  X extends Either.Left<infer EX, any> ? EX : X extends Either.Right<infer EX, any> ? EX : never
> {
  return self
}

export function unifyOption<X extends Option.Option<any>>(
  self: X
): Option.Option<
  X extends Option.Some<infer A> ? A
    : X extends Option.None<infer A> ? A
    : never
> {
  return self
}

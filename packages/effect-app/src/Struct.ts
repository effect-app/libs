/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Types } from "effect"
import * as Struct from "effect/Struct"

export * from "effect/Struct"

/**
 * Create a new object by picking properties of an existing object.
 *
 * @example
 * import { pick } from "effect/Struct"
 * import { pipe } from "effect/Function"
 *
 * assert.deepStrictEqual(pipe({ a: "a", b: 1, c: true }, pick("a", "b")), { a: "a", b: 1 })
 * assert.deepStrictEqual(pick({ a: "a", b: 1, c: true }, "a", "b"), { a: "a", b: 1 })
 *
 * @since 2.0.0
 */
export const pick: {
  <Keys extends Array<PropertyKey>>(
    keys: Keys
  ): <S extends { [K in Keys[number]]?: any }>(
    s: S
  ) => Types.MatchRecord<S, { [K in Keys[number]]?: S[K] }, Pick<S, Keys[number]>>
  <S extends object, Keys extends Array<keyof S>>(
    s: S,
    keys: Keys
  ): Types.MatchRecord<S, { [K in Keys[number]]?: S[K] }, Pick<S, Keys[number]>>
} = Struct.pick

export type DistributiveOmit<T, K extends keyof any> = T extends any ? Omit<T, K>
  : never

/**
 * Create a new object by omitting properties of an existing object.
 *
 * @example
 * import { omit } from "effect/Struct"
 * import { pipe } from "effect/Function"
 *
 * assert.deepStrictEqual(pipe({ a: "a", b: 1, c: true }, omit("c")), { a: "a", b: 1 })
 * assert.deepStrictEqual(omit({ a: "a", b: 1, c: true }, "c"), { a: "a", b: 1 })
 *
 * @since 2.0.0
 */
export const omit: {
  <Keys extends Array<PropertyKey>>(
    keys: Keys
  ): <S extends { [K in Keys[number]]?: any }>(s: S) => DistributiveOmit<S, Keys[number]>
  <S extends object, Keys extends Array<keyof S>>(
    s: S,
    keys: Keys
  ): DistributiveOmit<S, Keys[number]>
} = Struct.omit as any

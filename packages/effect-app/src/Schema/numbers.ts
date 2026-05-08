/**
 * Numeric brand schemas with `.withConstructorDefault` extensions.
 *
 * Each `.withConstructorDefault` here is **only** applied when the field is
 * omitted during construction (`.make(...)`). It is **not** applied during
 * decode and therefore cannot be used to JIT-migrate database fields.
 *
 * For persisted data, prefer an explicit, preferably versioned migration
 * over decode-time fallbacks. See `./ext.ts` for the full policy note.
 */
import { Effect } from "effect"
import { extendM } from "effect-app/utils"
import * as S from "effect/Schema"
import type { Simplify } from "effect/Types"
import { fromBrand, nominal } from "./brand.js"
import { withDefaultMake } from "./ext.js"
import { type B } from "./schema.js"

export interface PositiveIntBrand
  extends Simplify<B.Brand<"PositiveInt"> & NonNegativeIntBrand & PositiveNumberBrand>
{}
/** Positive integer. `.withConstructorDefault` => `1` (construction-only). */
export const PositiveInt = extendM(
  S.Int.pipe(
    S.check(S.isGreaterThan(0)),
    fromBrand<PositiveInt>(nominal<PositiveInt>(), { identifier: "PositiveInt", jsonSchema: {} }),
    withDefaultMake
  ),
  (s) => ({
    /**
     * Construction-only default `1`. Applied only when the field is omitted
     * from `.make(...)` input. NOT applied during decode — cannot be used to
     * JIT-migrate database fields. See file-level note.
     */
    withConstructorDefault: s.pipe(S.withConstructorDefault(Effect.sync(() => s(1))))
  })
)
export type PositiveInt = number & PositiveIntBrand

export interface NonNegativeIntBrand extends Simplify<B.Brand<"NonNegativeInt"> & IntBrand & NonNegativeNumberBrand> {}
/** Non-negative integer. `.withConstructorDefault` => `0` (construction-only). */
export const NonNegativeInt = extendM(
  S.Int.pipe(
    S.check(S.isGreaterThanOrEqualTo(0)),
    fromBrand<NonNegativeInt>(nominal<NonNegativeInt>(), {
      identifier: "NonNegativeInt",
      jsonSchema: {}
    }),
    withDefaultMake
  ),
  (s) => ({
    /**
     * Construction-only default `0`. Applied only when the field is omitted
     * from `.make(...)` input. NOT applied during decode — cannot be used to
     * JIT-migrate database fields. See file-level note.
     */
    withConstructorDefault: s.pipe(S.withConstructorDefault(Effect.sync(() => s(0))))
  })
)
export type NonNegativeInt = number & NonNegativeIntBrand

export interface IntBrand extends Simplify<B.Brand<"Int">> {}
/** Integer. `.withConstructorDefault` => `0` (construction-only). */
export const Int = extendM(
  S.Int.pipe(fromBrand<Int>(nominal<Int>(), { identifier: "Int", jsonSchema: {} }), withDefaultMake),
  (s) => ({
    /**
     * Construction-only default `0`. Applied only when the field is omitted
     * from `.make(...)` input. NOT applied during decode — cannot be used to
     * JIT-migrate database fields. See file-level note.
     */
    withConstructorDefault: s.pipe(S.withConstructorDefault(Effect.sync(() => s(0))))
  })
)
export type Int = number & IntBrand

export interface PositiveNumberBrand extends Simplify<B.Brand<"PositiveNumber"> & NonNegativeNumberBrand> {}
/** Positive finite number. `.withConstructorDefault` => `1` (construction-only). */
export const PositiveNumber = extendM(
  S.Finite.pipe(
    S.check(S.isGreaterThan(0)),
    fromBrand<PositiveNumber>(nominal<PositiveNumber>(), {
      identifier: "PositiveNumber",
      jsonSchema: {}
    }),
    withDefaultMake
  ),
  (s) => ({
    /**
     * Construction-only default `1`. Applied only when the field is omitted
     * from `.make(...)` input. NOT applied during decode — cannot be used to
     * JIT-migrate database fields. See file-level note.
     */
    withConstructorDefault: s.pipe(S.withConstructorDefault(Effect.sync(() => s(1))))
  })
)
export type PositiveNumber = number & PositiveNumberBrand

export interface NonNegativeNumberBrand extends Simplify<B.Brand<"NonNegativeNumber">> {}
/** Non-negative finite number. `.withConstructorDefault` => `0` (construction-only). */
export const NonNegativeNumber = extendM(
  S
    .Finite
    .pipe(
      S.check(S.isGreaterThanOrEqualTo(0)),
      fromBrand<NonNegativeNumber>(nominal<NonNegativeNumber>(), {
        identifier: "NonNegativeNumber",
        jsonSchema: {}
      }),
      withDefaultMake
    ),
  (s) => ({
    /**
     * Construction-only default `0`. Applied only when the field is omitted
     * from `.make(...)` input. NOT applied during decode — cannot be used to
     * JIT-migrate database fields. See file-level note.
     */
    withConstructorDefault: s.pipe(S.withConstructorDefault(Effect.sync(() => s(0))))
  })
)
export type NonNegativeNumber = number & NonNegativeNumberBrand

/** @deprecated Not an actual decimal */
export const NonNegativeDecimal = NonNegativeNumber
/** @deprecated Not an actual decimal */
export type NonNegativeDecimal = NonNegativeNumber

/** @deprecated Not an actual decimal */
export const PositiveDecimal = PositiveNumber
/** @deprecated Not an actual decimal */
export type PositiveDecimal = PositiveNumber

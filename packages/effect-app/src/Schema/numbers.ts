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
import { extendM } from "effect-app/utils"
import * as Effect from "effect/Effect"
import * as Order from "effect/Order"
import * as S from "effect/Schema"
import type { Simplify } from "effect/Types"
import type * as SchemaAST from "../SchemaAST.ts"
import { type BrandedSchema, fromBrand, nominal } from "./brand.ts"
import { withDefaultMake } from "./ext.ts"
import { type B } from "./schema.ts"

export interface PositiveIntBrand
  extends Simplify<B.Brand<"PositiveInt"> & NonNegativeIntBrand & PositiveNumberBrand>
{}
export type PositiveInt = number & PositiveIntBrand
/** Positive integer. `.withConstructorDefault` => `1` (construction-only). */
export interface PositiveIntSchema extends BrandedSchema<S.Int, PositiveInt> {
  (i: number, options?: SchemaAST.ParseOptions): PositiveInt
  readonly withConstructorDefault: S.withConstructorDefault<BrandedSchema<S.Int, PositiveInt>>
}
export const PositiveInt: PositiveIntSchema = extendM(
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

export interface NonNegativeIntBrand extends Simplify<B.Brand<"NonNegativeInt"> & IntBrand & NonNegativeNumberBrand> {}
export type NonNegativeInt = number & NonNegativeIntBrand
/** Non-negative integer. `.withConstructorDefault` => `0` (construction-only). */
export interface NonNegativeIntSchema extends BrandedSchema<S.Int, NonNegativeInt> {
  (i: number, options?: SchemaAST.ParseOptions): NonNegativeInt
  readonly withConstructorDefault: S.withConstructorDefault<BrandedSchema<S.Int, NonNegativeInt>>
}
export const NonNegativeInt: NonNegativeIntSchema = extendM(
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

export interface IntBrand extends Simplify<B.Brand<"Int">> {}
export type Int = number & IntBrand
/** Integer. `.withConstructorDefault` => `0` (construction-only). */
export interface IntSchema extends BrandedSchema<S.Int, Int> {
  (i: number, options?: SchemaAST.ParseOptions): Int
  readonly withConstructorDefault: S.withConstructorDefault<BrandedSchema<S.Int, Int>>
}
export const Int: IntSchema = extendM(
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

export interface PositiveNumberBrand extends Simplify<B.Brand<"PositiveNumber"> & NonNegativeNumberBrand> {}
export type PositiveNumber = number & PositiveNumberBrand
/** Positive finite number. `.withConstructorDefault` => `1` (construction-only). */
// Generation-only: native Arbitrary otherwise samples up to Number.MAX_VALUE, so derived totals
// (amount x weight, sums) overflow to Infinity. Validation and JSON Schema are unaffected.
const realisticMaximum = 1_000_000

export interface PositiveNumberSchema extends BrandedSchema<S.Finite, PositiveNumber> {
  (i: number, options?: SchemaAST.ParseOptions): PositiveNumber
  readonly withConstructorDefault: S.withConstructorDefault<BrandedSchema<S.Finite, PositiveNumber>>
}
export const PositiveNumber: PositiveNumberSchema = extendM(
  S.Finite.pipe(
    S.check(S.isGreaterThan(0, {
      // the full constraint: annotations replace the check default, which carries `order` + `minimum`
      arbitraryConstraint: { order: Order.Number, minimum: 0, exclusiveMinimum: true, maximum: realisticMaximum }
    })),
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

export interface NonNegativeNumberBrand extends Simplify<B.Brand<"NonNegativeNumber">> {}
export type NonNegativeNumber = number & NonNegativeNumberBrand
/** Non-negative finite number. `.withConstructorDefault` => `0` (construction-only). */
export interface NonNegativeNumberSchema extends BrandedSchema<S.Finite, NonNegativeNumber> {
  (i: number, options?: SchemaAST.ParseOptions): NonNegativeNumber
  readonly withConstructorDefault: S.withConstructorDefault<BrandedSchema<S.Finite, NonNegativeNumber>>
}
export const NonNegativeNumber: NonNegativeNumberSchema = extendM(
  S
    .Finite
    .pipe(
      S.check(S.isGreaterThanOrEqualTo(0, {
        arbitraryConstraint: { order: Order.Number, minimum: 0, maximum: realisticMaximum }
      })),
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

/** @deprecated Not an actual decimal */
export const NonNegativeDecimal = NonNegativeNumber
/** @deprecated Not an actual decimal */
export type NonNegativeDecimal = NonNegativeNumber

/** @deprecated Not an actual decimal */
export const PositiveDecimal = PositiveNumber
/** @deprecated Not an actual decimal */
export type PositiveDecimal = PositiveNumber

/** Signed 32-bit integer bounds, matching Java `Integer.MIN_VALUE` / `Integer.MAX_VALUE`. */
export const INT32_MIN = -2147483648
export const INT32_MAX = 2147483647
/** Largest finite IEEE 754 binary32 value, Java `Float.MAX_VALUE`. */
export const FLOAT32_MAX = 3.4028234663852886e38
/** Smallest positive IEEE 754 binary32 value (subnormal), Java `Float.MIN_VALUE`. */
export const FLOAT32_MIN_POSITIVE = 1.401298464324817e-45

// The upper-bound check also carries the OpenAPI `format`, so Effect inlines it next to the
// tightened `minimum`/`maximum` instead of emitting a separate `allOf` member.
const isInt32Maximum = () =>
  S.isLessThanOrEqualTo(INT32_MAX, { toJsonSchema: () => ({ maximum: INT32_MAX, format: "int32" }) })
const isFloat32Maximum = () =>
  S.isLessThanOrEqualTo(FLOAT32_MAX, { toJsonSchema: () => ({ maximum: FLOAT32_MAX, format: "float" }) })

export interface Int32Brand extends Simplify<B.Brand<"Int32"> & IntBrand> {}
export type Int32 = number & Int32Brand
/**
 * Signed 32-bit integer (`[-2147483648, 2147483647]`), JSON Schema `format: "int32"`.
 * `.withConstructorDefault` => `0` (construction-only).
 */
export interface Int32Schema extends BrandedSchema<S.Int, Int32> {
  (i: number, options?: SchemaAST.ParseOptions): Int32
  readonly withConstructorDefault: S.withConstructorDefault<BrandedSchema<S.Int, Int32>>
}
export const Int32: Int32Schema = extendM(
  S.Int.pipe(
    S.check(S.isGreaterThanOrEqualTo(INT32_MIN), isInt32Maximum()),
    fromBrand<Int32>(nominal<Int32>(), { identifier: "Int32", jsonSchema: {} }),
    withDefaultMake
  ),
  (s) => ({
    /** Construction-only default `0`. NOT applied during decode. See file-level note. */
    withConstructorDefault: s.pipe(S.withConstructorDefault(Effect.sync(() => s(0))))
  })
)

export interface NonNegativeInt32Brand
  extends Simplify<B.Brand<"NonNegativeInt32"> & Int32Brand & NonNegativeIntBrand & NonNegativeNumber32Brand>
{}
export type NonNegativeInt32 = number & NonNegativeInt32Brand
/**
 * Non-negative signed 32-bit integer (`[0, 2147483647]`), JSON Schema `format: "int32"`.
 * `.withConstructorDefault` => `0` (construction-only).
 */
export interface NonNegativeInt32Schema extends BrandedSchema<S.Int, NonNegativeInt32> {
  (i: number, options?: SchemaAST.ParseOptions): NonNegativeInt32
  readonly withConstructorDefault: S.withConstructorDefault<BrandedSchema<S.Int, NonNegativeInt32>>
}
export const NonNegativeInt32: NonNegativeInt32Schema = extendM(
  S.Int.pipe(
    S.check(S.isGreaterThanOrEqualTo(0), isInt32Maximum()),
    fromBrand<NonNegativeInt32>(nominal<NonNegativeInt32>(), { identifier: "NonNegativeInt32", jsonSchema: {} }),
    withDefaultMake
  ),
  (s) => ({
    /** Construction-only default `0`. NOT applied during decode. See file-level note. */
    withConstructorDefault: s.pipe(S.withConstructorDefault(Effect.sync(() => s(0))))
  })
)

export interface PositiveInt32Brand
  extends Simplify<B.Brand<"PositiveInt32"> & NonNegativeInt32Brand & PositiveIntBrand & PositiveNumber32Brand>
{}
export type PositiveInt32 = number & PositiveInt32Brand
/**
 * Positive signed 32-bit integer (`[1, 2147483647]`), JSON Schema `format: "int32"`.
 * `.withConstructorDefault` => `1` (construction-only).
 */
export interface PositiveInt32Schema extends BrandedSchema<S.Int, PositiveInt32> {
  (i: number, options?: SchemaAST.ParseOptions): PositiveInt32
  readonly withConstructorDefault: S.withConstructorDefault<BrandedSchema<S.Int, PositiveInt32>>
}
export const PositiveInt32: PositiveInt32Schema = extendM(
  S.Int.pipe(
    S.check(S.isGreaterThan(0), isInt32Maximum()),
    fromBrand<PositiveInt32>(nominal<PositiveInt32>(), { identifier: "PositiveInt32", jsonSchema: {} }),
    withDefaultMake
  ),
  (s) => ({
    /** Construction-only default `1`. NOT applied during decode. See file-level note. */
    withConstructorDefault: s.pipe(S.withConstructorDefault(Effect.sync(() => s(1))))
  })
)

export interface NonNegativeNumber32Brand extends Simplify<B.Brand<"NonNegativeNumber32"> & NonNegativeNumberBrand> {}
export type NonNegativeNumber32 = number & NonNegativeNumber32Brand
/**
 * Non-negative finite number within IEEE 754 binary32 range (`[0, 3.4028234663852886e38]`),
 * JSON Schema `format: "float"`.
 *
 * Range-only: values are kept as-is (no rounding to binary32); a binary32 consumer rounds to its
 * nearest float (~7 significant digits). Values above `FLOAT32_MAX` (overflow) are rejected.
 * Values below `FLOAT32_MIN_POSITIVE` are accepted and underflow to `0` in binary32, which keeps
 * them non-negative. `.withConstructorDefault` => `0` (construction-only).
 */
export interface NonNegativeNumber32Schema extends BrandedSchema<S.Finite, NonNegativeNumber32> {
  (i: number, options?: SchemaAST.ParseOptions): NonNegativeNumber32
  readonly withConstructorDefault: S.withConstructorDefault<BrandedSchema<S.Finite, NonNegativeNumber32>>
}
export const NonNegativeNumber32: NonNegativeNumber32Schema = extendM(
  S.Finite.pipe(
    S.check(
      S.isGreaterThanOrEqualTo(0, {
        arbitraryConstraint: { order: Order.Number, minimum: 0, maximum: realisticMaximum }
      }),
      isFloat32Maximum()
    ),
    fromBrand<NonNegativeNumber32>(nominal<NonNegativeNumber32>(), {
      identifier: "NonNegativeNumber32",
      jsonSchema: {}
    }),
    withDefaultMake
  ),
  (s) => ({
    /** Construction-only default `0`. NOT applied during decode. See file-level note. */
    withConstructorDefault: s.pipe(S.withConstructorDefault(Effect.sync(() => s(0))))
  })
)

export interface PositiveNumber32Brand
  extends Simplify<B.Brand<"PositiveNumber32"> & NonNegativeNumber32Brand & PositiveNumberBrand>
{}
export type PositiveNumber32 = number & PositiveNumber32Brand
/**
 * Positive finite number within IEEE 754 binary32 range
 * (`[1.401298464324817e-45, 3.4028234663852886e38]`), JSON Schema `format: "float"`.
 *
 * Range-only: values are kept as-is (no rounding to binary32); a binary32 consumer rounds to its
 * nearest float (~7 significant digits). Values above `FLOAT32_MAX` (overflow) and positive values
 * below `FLOAT32_MIN_POSITIVE` (underflow to `0`, losing positivity) are rejected.
 * `.withConstructorDefault` => `1` (construction-only).
 */
export interface PositiveNumber32Schema extends BrandedSchema<S.Finite, PositiveNumber32> {
  (i: number, options?: SchemaAST.ParseOptions): PositiveNumber32
  readonly withConstructorDefault: S.withConstructorDefault<BrandedSchema<S.Finite, PositiveNumber32>>
}
export const PositiveNumber32: PositiveNumber32Schema = extendM(
  S.Finite.pipe(
    S.check(
      S.isGreaterThanOrEqualTo(FLOAT32_MIN_POSITIVE, {
        arbitraryConstraint: { order: Order.Number, minimum: FLOAT32_MIN_POSITIVE, maximum: realisticMaximum }
      }),
      isFloat32Maximum()
    ),
    fromBrand<PositiveNumber32>(nominal<PositiveNumber32>(), {
      identifier: "PositiveNumber32",
      jsonSchema: {}
    }),
    withDefaultMake
  ),
  (s) => ({
    /** Construction-only default `1`. NOT applied during decode. See file-level note. */
    withConstructorDefault: s.pipe(S.withConstructorDefault(Effect.sync(() => s(1))))
  })
)

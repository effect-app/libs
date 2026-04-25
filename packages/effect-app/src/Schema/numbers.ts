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
export const PositiveInt = extendM(
  S.Int.pipe(
    S.check(S.isGreaterThan(0)),
    fromBrand<PositiveInt>(nominal<PositiveInt>(), { identifier: "PositiveInt", jsonSchema: {} }),
    withDefaultMake
  ),
  (s) => ({ withDefault: s.pipe(S.withConstructorDefault(Effect.sync(() => s(1)))) })
)
export type PositiveInt = number & PositiveIntBrand

export interface NonNegativeIntBrand extends Simplify<B.Brand<"NonNegativeInt"> & IntBrand & NonNegativeNumberBrand> {}
export const NonNegativeInt = extendM(
  S.Int.pipe(
    S.check(S.isGreaterThanOrEqualTo(0)),
    fromBrand<NonNegativeInt>(nominal<NonNegativeInt>(), {
      identifier: "NonNegativeInt",
      jsonSchema: {}
    }),
    withDefaultMake
  ),
  (s) => ({ withDefault: s.pipe(S.withConstructorDefault(Effect.sync(() => s(0)))) })
)
export type NonNegativeInt = number & NonNegativeIntBrand

export interface IntBrand extends Simplify<B.Brand<"Int">> {}
export const Int = extendM(
  S.Int.pipe(fromBrand<Int>(nominal<Int>(), { identifier: "Int", jsonSchema: {} }), withDefaultMake),
  (s) => ({ withDefault: s.pipe(S.withConstructorDefault(Effect.sync(() => s(0)))) })
)
export type Int = number & IntBrand

export interface PositiveNumberBrand extends Simplify<B.Brand<"PositiveNumber"> & NonNegativeNumberBrand> {}
export const PositiveNumber = extendM(
  S.Finite.pipe(
    S.check(S.isGreaterThan(0)),
    fromBrand<PositiveNumber>(nominal<PositiveNumber>(), {
      identifier: "PositiveNumber",
      jsonSchema: {}
    }),
    withDefaultMake
  ),
  (s) => ({ withDefault: s.pipe(S.withConstructorDefault(Effect.sync(() => s(1)))) })
)
export type PositiveNumber = number & PositiveNumberBrand

export interface NonNegativeNumberBrand extends Simplify<B.Brand<"NonNegativeNumber">> {}
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
  (s) => ({ withDefault: s.pipe(S.withConstructorDefault(Effect.sync(() => s(0)))) })
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

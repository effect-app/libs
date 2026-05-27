import type * as B from "effect/Brand"
import * as S from "effect/Schema"
import type { Simplify } from "effect/Types"
import { fromBrand, nominal } from "./brand.js"
import { withDefaultMake, type WithDefaults } from "./ext.js"

type BrandedStringSchema<A extends string> = S.Codec<A, string> & WithDefaults<S.Codec<A, string>>

export type NonEmptyStringBrand = B.Brand<"NonEmptyString">
export type NonEmptyString = string & NonEmptyStringBrand
export interface NonEmptyStringSchema extends BrandedStringSchema<NonEmptyString> {}
export const NonEmptyString: NonEmptyStringSchema = S
  .NonEmptyString
  .pipe(
    fromBrand<NonEmptyString>(nominal<NonEmptyString>(), {
      identifier: "NonEmptyString",
      jsonSchema: {}
    }),
    withDefaultMake
  )

export interface NonEmptyString64kBrand extends Simplify<B.Brand<"NonEmptyString64k"> & NonEmptyStringBrand> {}
export type NonEmptyString64k = string & NonEmptyString64kBrand
export interface NonEmptyString64kSchema extends BrandedStringSchema<NonEmptyString64k> {}
export const NonEmptyString64k: NonEmptyString64kSchema = S
  .NonEmptyString
  .pipe(
    S.check(S.isMaxLength(64 * 1024)),
    fromBrand<NonEmptyString64k>(nominal<NonEmptyString64k>(), {
      identifier: "NonEmptyString64k",
      jsonSchema: {}
    }),
    withDefaultMake
  )

export interface NonEmptyString2kBrand extends Simplify<B.Brand<"NonEmptyString2k"> & NonEmptyString64kBrand> {}
export type NonEmptyString2k = string & NonEmptyString2kBrand
export interface NonEmptyString2kSchema extends BrandedStringSchema<NonEmptyString2k> {}
export const NonEmptyString2k: NonEmptyString2kSchema = S
  .NonEmptyString
  .pipe(
    S.check(S.isMaxLength(2 * 1024)),
    fromBrand<NonEmptyString2k>(nominal<NonEmptyString2k>(), {
      identifier: "NonEmptyString2k",
      jsonSchema: {}
    }),
    withDefaultMake
  )

export interface NonEmptyString255Brand extends Simplify<B.Brand<"NonEmptyString255"> & NonEmptyString2kBrand> {}
export type NonEmptyString255 = string & NonEmptyString255Brand
export interface NonEmptyString255Schema extends BrandedStringSchema<NonEmptyString255> {}
export const NonEmptyString255: NonEmptyString255Schema = S
  .NonEmptyString
  .pipe(
    S.check(S.isMaxLength(255)),
    fromBrand<NonEmptyString255>(nominal<NonEmptyString255>(), {
      identifier: "NonEmptyString255",
      jsonSchema: {}
    }),
    withDefaultMake
  )

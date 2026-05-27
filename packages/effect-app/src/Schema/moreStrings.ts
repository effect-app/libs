/**
 * Branded string ID schemas with `.withConstructorDefault` extensions.
 *
 * Each `.withConstructorDefault` here is **only** applied when the field is
 * omitted during construction (`.make(...)`). It is **not** applied during
 * decode and therefore cannot be used to JIT-migrate database fields.
 *
 * For persisted data, prefer an explicit, preferably versioned migration
 * over decode-time fallbacks. See `./ext.ts` for the full policy note.
 */
import type { Refinement } from "effect-app/Function"
import { extendM } from "effect-app/utils"
import * as Effect from "effect/Effect"
import { pipe } from "effect/Function"
import * as S from "effect/Schema"
import type { Simplify } from "effect/Types"
import { customRandom, nanoid, urlAlphabet } from "nanoid"
import validator from "validator"
import { fromBrand, nominal } from "./brand.js"
import { withDefaultMake, type WithDefaults } from "./ext.js"
import { type B } from "./schema.js"
import type { NonEmptyString255Brand, NonEmptyStringBrand } from "./strings.js"

type BrandedStringSchema<A extends string> = S.Codec<A, string> & WithDefaults<S.Codec<A, string>>
type BrandedStringSchemaWithConstructorDefault<A extends string> = BrandedStringSchema<A> & {
  readonly withConstructorDefault: S.withConstructorDefault<S.Codec<A, string> & S.WithoutConstructorDefault>
}

const nonEmptyString = S.NonEmptyString

/**
 * A string that is at least 1 character long and a maximum of 50.
 */
export interface NonEmptyString50Brand extends Simplify<B.Brand<"NonEmptyString50"> & NonEmptyString64Brand> {}

/**
 * A string that is at least 1 character long and a maximum of 50.
 */
export type NonEmptyString50 = string & NonEmptyString50Brand

/**
 * A string that is at least 1 character long and a maximum of 50.
 */
export interface NonEmptyString50Schema extends BrandedStringSchema<NonEmptyString50> {}
export const NonEmptyString50: NonEmptyString50Schema = nonEmptyString.pipe(
  S.check(S.isMaxLength(50)),
  fromBrand<NonEmptyString50>(nominal<NonEmptyString50>(), {
    identifier: "NonEmptyString50",
    jsonSchema: {}
  }),
  withDefaultMake
)

/**
 * A string that is at least 1 character long and a maximum of 64.
 */
export interface NonEmptyString64Brand extends Simplify<B.Brand<"NonEmptyString64"> & NonEmptyString80Brand> {}

/**
 * A string that is at least 1 character long and a maximum of 64.
 */
export type NonEmptyString64 = string & NonEmptyString64Brand

/**
 * A string that is at least 1 character long and a maximum of 64.
 */
export interface NonEmptyString64Schema extends BrandedStringSchema<NonEmptyString64> {}
export const NonEmptyString64: NonEmptyString64Schema = nonEmptyString.pipe(
  S.check(S.isMaxLength(64)),
  fromBrand<NonEmptyString64>(nominal<NonEmptyString64>(), {
    identifier: "NonEmptyString64",
    jsonSchema: {}
  }),
  withDefaultMake
)

/**
 * A string that is at least 1 character long and a maximum of 80.
 */
export interface NonEmptyString80Brand extends Simplify<B.Brand<"NonEmptyString80"> & NonEmptyString100Brand> {}

/**
 * A string that is at least 1 character long and a maximum of 80.
 */
export type NonEmptyString80 = string & NonEmptyString80Brand

/**
 * A string that is at least 1 character long and a maximum of 80.
 */

export interface NonEmptyString80Schema extends BrandedStringSchema<NonEmptyString80> {}
export const NonEmptyString80: NonEmptyString80Schema = nonEmptyString.pipe(
  S.check(S.isMaxLength(80)),
  fromBrand<NonEmptyString80>(nominal<NonEmptyString80>(), {
    identifier: "NonEmptyString80",
    jsonSchema: {}
  }),
  withDefaultMake
)

/**
 * A string that is at least 1 character long and a maximum of 100.
 */
export interface NonEmptyString100Brand extends Simplify<B.Brand<"NonEmptyString100"> & NonEmptyString255Brand> {}

/**
 * A string that is at least 1 character long and a maximum of 100.
 */
export type NonEmptyString100 = string & NonEmptyString100Brand

/**
 * A string that is at least 1 character long and a maximum of 100.
 */
export interface NonEmptyString100Schema extends BrandedStringSchema<NonEmptyString100> {}
export const NonEmptyString100: NonEmptyString100Schema = nonEmptyString.pipe(
  S.check(S.isMaxLength(100)),
  fromBrand<NonEmptyString100>(nominal<NonEmptyString100>(), {
    identifier: "NonEmptyString100",
    jsonSchema: {}
  }),
  withDefaultMake
)

/**
 * A string that is at least 3 character long and a maximum of 255.
 */
export interface Min3String255Brand extends Simplify<B.Brand<"Min3String255"> & NonEmptyString255Brand> {}

/**
 * A string that is at least 3 character long and a maximum of 255.
 */
export type Min3String255 = string & Min3String255Brand

/**
 * A string that is at least 3 character long and a maximum of 255.
 */
export interface Min3String255Schema extends BrandedStringSchema<Min3String255> {}
export const Min3String255: Min3String255Schema = pipe(
  S.String,
  S.check(S.isMinLength(3), S.isMaxLength(255)),
  fromBrand<Min3String255>(nominal<Min3String255>(), {
    identifier: "Min3String255",
    jsonSchema: {}
  }),
  withDefaultMake
)

/**
 * A string that is at least 6 characters long and a maximum of 50.
 */
export interface StringIdBrand extends Simplify<B.Brand<"StringId"> & NonEmptyString50Brand> {}

/**
 * A string that is at least 6 characters long and a maximum of 50.
 */
export type StringId = string & StringIdBrand

const makeStringId = (s?: string): StringId =>
  s !== undefined ? S.decodeSync(StringId)(s) : nanoid() as unknown as StringId
const minLength = 6
const maxLength = 50
const size = 21
const length = 10 * size
const StringIdArb = (): S.LazyArbitrary<StringId> => (fc) =>
  fc
    .uint8Array({ minLength: length, maxLength: length })
    .map((_) => customRandom(urlAlphabet, size, (size) => _.subarray(0, size))() as StringId)
/**
 * A string that is at least 6 characters long and a maximum of 50.
 *
 * `.withConstructorDefault` => fresh `nanoid()` (construction-only; not
 * applied during decode — see file-level note).
 */
export interface StringIdSchema extends BrandedStringSchemaWithConstructorDefault<StringId> {
  readonly make: (s?: string) => StringId
}
export const StringId: StringIdSchema = extendM(
  pipe(
    S.String,
    S.check(S.isMinLength(minLength), S.isMaxLength(maxLength)),
    fromBrand<StringId>(nominal<StringId>(), {
      identifier: "StringId",
      toArbitrary: () => (fc) => StringIdArb()(fc),
      jsonSchema: {}
    })
  ),
  (s) => ({
    make: makeStringId,
    /**
     * Construction-only default: fresh `nanoid()`-shaped `StringId`. Applied
     * only when the field is omitted from `.make(...)` input. NOT applied
     * during decode — cannot be used to JIT-migrate database fields. See
     * file-level note.
     */
    withConstructorDefault: s.pipe(S.withConstructorDefault(Effect.sync(makeStringId)))
  })
)
  .pipe(withDefaultMake)

// const prefixedStringIdUnsafe = (prefix: string) => StringId(prefix + StringId.make())

// const prefixedStringIdUnsafeThunk = (prefix: string) => () => prefixedStringIdUnsafe(prefix)

/**
 * Build a `StringId` schema whose values are required to start with a fixed
 * `prefix` (joined with `separator`, default `-`).
 *
 * The returned schema exposes `.withConstructorDefault` that mints a fresh
 * prefixed id. Construction-only — not applied during decode; see file-level
 * note.
 */
export function prefixedStringId<Type extends StringId>() {
  return <Prefix extends string, Separator extends string = "-">(
    prefix: Prefix,
    name: string,
    separator?: Separator
  ) => {
    type FullPrefix = `${Prefix}${Separator}`
    const pref = `${prefix}${separator ?? "-"}` as FullPrefix
    const arb = (): S.LazyArbitrary<Type> => (fc) =>
      StringIdArb()(fc).map(
        (x) => (pref + x.substring(0, 50 - pref.length)) as Type
      )
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const s = StringId
      .pipe(
        S.refine((x: string): x is Type => x.startsWith(pref), {
          identifier: name
        }),
        S.annotate({
          toArbitrary: () => (fc) => arb()(fc)
        })
      )
    const schema = s.pipe(withDefaultMake)
    const make = () => (pref + StringId.make().substring(0, 50 - pref.length)) as Type

    return extendM(
      schema,
      (ex): PrefixedStringUtils<Type, Prefix, Separator> => ({
        make,
        /**
         * Automatically adds the prefix.
         */
        unsafeFrom: (str: string) => ex(pref + str),
        /**
         * Must provide a literal string starting with prefix.
         */
        prefixSafe: <REST extends string>(str: `${Prefix}${Separator}${REST}`) => ex(str),
        prefix,
        /**
         * Construction-only default: fresh prefixed id. Applied only when
         * the field is omitted from `.make(...)` input. NOT applied during
         * decode — cannot be used to JIT-migrate database fields. See
         * file-level note.
         */
        withConstructorDefault: schema.pipe(
          S.withConstructorDefault<S.Codec<Type, string> & S.WithoutConstructorDefault>(
            Effect.sync(make)
          )
        )
      })
    )
  }
}

/**
 * Build a branded `StringId` schema for the given branded `Id` type.
 *
 * Exposes `.withConstructorDefault` that mints a fresh `nanoid()`-shaped id.
 * Construction-only — not applied during decode; see file-level note.
 */
export const brandedStringId = <
  Id
>() =>
  withDefaultMake(
    Object.assign(Object.create(StringId), StringId) as S.Codec<Id, string> & {
      /**
       * Construction-only default: fresh `nanoid()`-shaped id. Applied only
       * when the field is omitted from `.make(...)` input. NOT applied
       * during decode — cannot be used to JIT-migrate database fields. See
       * file-level note.
       */
      withConstructorDefault: S.withConstructorDefault<S.Codec<Id, string> & S.WithoutConstructorDefault>
      make: () => Id
    } & WithDefaults<S.Codec<Id, string>>
  )

export interface PrefixedStringUtils<
  Type extends StringId,
  Prefix extends string,
  Separator extends string
> {
  readonly make: () => Type
  readonly unsafeFrom: (str: string) => Type
  prefixSafe: <REST extends string>(str: `${Prefix}${Separator}${REST}`) => Type
  readonly prefix: Prefix
  /**
   * Construction-only default: fresh prefixed id. Applied only when the
   * field is omitted from `.make(...)` input. NOT applied during decode —
   * cannot be used to JIT-migrate database fields. See file-level note.
   */
  readonly withConstructorDefault: S.withConstructorDefault<S.Codec<Type, string> & S.WithoutConstructorDefault>
}

export interface UrlBrand extends Simplify<B.Brand<"Url"> & NonEmptyStringBrand> {}

export type Url = string & UrlBrand

const isUrl: Refinement<string, Url> = (s: string): s is Url => {
  return validator.default.isURL(s, { require_tld: false })
}

export interface UrlSchema extends BrandedStringSchema<Url> {}
export const Url: UrlSchema = S
  .String
  .pipe(
    S.annotate({
      title: "Url",
      format: "uri"
    }),
    S.refine(isUrl, {
      identifier: "Url",
      jsonSchema: { format: "uri" }
    }),
    S.annotate({
      toArbitrary: () => (fc) => fc.webUrl().map((_) => _ as Url)
    }),
    withDefaultMake
  )

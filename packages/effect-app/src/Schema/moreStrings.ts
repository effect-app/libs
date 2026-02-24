import { pipe } from "effect"
import type { Refinement } from "effect-app/Function"
import { extendM } from "effect-app/utils"
import * as S from "effect/Schema"
import type { Simplify } from "effect/Types"
import { customRandom, nanoid, urlAlphabet } from "nanoid"
import validator from "validator"
import { fromBrand, nominal } from "./brand.js"
import { withDefaultConstructor, withDefaultMake, type WithDefaults } from "./ext.js"
import { type B } from "./schema.js"
import type { NonEmptyString255Brand, NonEmptyStringBrand } from "./strings.js"

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
export const NonEmptyString50 = nonEmptyString.pipe(
  S.check(S.isMaxLength(50)),
  fromBrand(nominal<NonEmptyString50>(), {
    identifier: "NonEmptyString50",
    title: "NonEmptyString50",
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
export const NonEmptyString64 = nonEmptyString.pipe(
  S.check(S.isMaxLength(64)),
  fromBrand(nominal<NonEmptyString64>(), {
    identifier: "NonEmptyString64",
    title: "NonEmptyString64",
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

export const NonEmptyString80 = nonEmptyString.pipe(
  S.check(S.isMaxLength(80)),
  fromBrand(nominal<NonEmptyString80>(), {
    identifier: "NonEmptyString80",
    title: "NonEmptyString80",
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
export const NonEmptyString100 = nonEmptyString.pipe(
  S.check(S.isMaxLength(100)),
  fromBrand(nominal<NonEmptyString100>(), {
    identifier: "NonEmptyString100",
    title: "NonEmptyString100",
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
export const Min3String255 = pipe(
  S.String,
  S.check(S.isMinLength(3), S.isMaxLength(255)),
  fromBrand(nominal<Min3String255>(), { identifier: "Min3String255", title: "Min3String255", jsonSchema: {} }),
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

const makeStringId = (): StringId => nanoid() as unknown as StringId
const minLength = 6
const maxLength = 50
const size = 21
const length = 10 * size
const StringIdArb = (): any => (fc: any) =>
  fc
    .uint8Array({ minLength: length, maxLength: length })
    .map((_: any) => customRandom(urlAlphabet, size, (size: number) => _.subarray(0, size))())

/**
 * A string that is at least 6 characters long and a maximum of 50.
 */
export const StringId = extendM(
  pipe(
    S.String,
    S.check(S.isMinLength(minLength), S.isMaxLength(maxLength)),
    fromBrand(nominal<StringId>(), {
      identifier: "StringId",
      title: "StringId",
      arbitrary: StringIdArb,
      jsonSchema: {}
    })
  ),
  (s) => ({
    make: makeStringId,
    withDefault: s.pipe(withDefaultConstructor(makeStringId))
  })
)
  .pipe(withDefaultMake)

// const prefixedStringIdUnsafe = (prefix: string) => StringId(prefix + StringId.make())

// const prefixedStringIdUnsafeThunk = (prefix: string) => () => prefixedStringIdUnsafe(prefix)

export function prefixedStringId<Brand extends StringId>() {
  return <Prefix extends string, Separator extends string = "-">(
    prefix: Prefix,
    name: string,
    separator?: Separator
  ) => {
    type FullPrefix = `${Prefix}${Separator}`
    const pref = `${prefix}${separator ?? "-"}` as FullPrefix
    const arb = (): any => (fc: any) =>
      StringIdArb()(fc).map(
        (x: any) => (pref + x.substring(0, 50 - pref.length)) as Brand
      )
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const s: S.Schema<string & Brand> = StringId
      .pipe(
        S.refine((x: string): x is string & Brand => x.startsWith(pref), {
          arbitrary: arb,
          identifier: name,
          title: name
        })
      ) as any
    const schema = s.pipe(withDefaultMake)
    const make = () => (pref + StringId.make().substring(0, 50 - pref.length)) as Brand

    return extendM(
      schema,
      (ex): PrefixedStringUtils<Brand, Prefix, Separator> => ({
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
        withDefault: schema.pipe(withDefaultConstructor(make))
      })
    )
  }
}

export const brandedStringId = <
  Brand extends StringIdBrand
>() =>
  withDefaultMake(
    Object.assign(Object.create(StringId), StringId) as S.Schema<string & Brand> & {
      make: () => string & Brand
      withDefault: any
    } & WithDefaults<S.Schema<string & Brand>>
  )

export interface PrefixedStringUtils<
  Brand extends StringId,
  Prefix extends string,
  Separator extends string
> {
  readonly make: () => Brand
  readonly unsafeFrom: (str: string) => Brand
  prefixSafe: <REST extends string>(str: `${Prefix}${Separator}${REST}`) => Brand
  readonly prefix: Prefix
  readonly withDefault: any
}

export interface UrlBrand extends Simplify<B.Brand<"Url"> & NonEmptyStringBrand> {}

export type Url = string & UrlBrand

const isUrl: Refinement<string, Url> = (s: string): s is Url => {
  return validator.default.isURL(s, { require_tld: false })
}

export const Url = S
  .String
  .pipe(
    S.refine(isUrl, {
      arbitrary: (): any => (fc: any) => fc.webUrl().map((_: any) => _ as Url),
      identifier: "Url",
      title: "Url",
      jsonSchema: { format: "uri" }
    }),
    withDefaultMake
  )

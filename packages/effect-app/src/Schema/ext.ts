/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import { Effect, Option, pipe, type SchemaAST, SchemaGetter, SchemaIssue, SchemaTransformation } from "effect"
import * as S from "effect/Schema"
import { isDateValid } from "effect/Schema"
import { type NonEmptyReadonlyArray } from "../Array.js"
import * as Context from "../Context.js"
import { extendM, typedKeysOf } from "../utils.js"
import { type AST } from "./schema.js"

type ProvidedCodec<Self extends S.Top, R> = S.Codec<
  Self["Type"],
  Self["Encoded"],
  Exclude<Self["DecodingServices"], R>,
  Exclude<Self["EncodingServices"], R>
>

// TODO: v4 migration — withConstructorDefault signature changed, propertySignature removed
// Constraint relaxed from `Self extends S.Top & S.WithoutConstructorDefault` to `Self extends S.Top`
// because `.pipe()` widens the schema type to `Top` which doesn't satisfy `WithoutConstructorDefault`.
// The narrowing assertions below are safe — we're asserting "this schema hasn't had a default applied yet".
export const withDefaultConstructor = <A>(
  makeDefault: () => NoInfer<A>
) =>
<Self extends S.Top>(self: Self): S.withConstructorDefault<Self & S.WithoutConstructorDefault> => {
  type Narrowed = Self & S.WithoutConstructorDefault
  return S.withConstructorDefault<Narrowed>(
    () => Option.some(makeDefault() as Narrowed["~type.make.in"])
  )(self as Narrowed)
}

// TODO: v4 migration - Date is no longer by default encoded to string.
/*
  in v4, there's the notion of `toCodecJson`, as a declaration and as a schema transformer.
  this means that Date, Map/Set, etc, remain the same type Encoded as Decoded, but when transformed to and from JSON, will go through
  the toCodecJson transformation, which for e.g Date will be the dateFromString transformation.

  While this is a cool feature, our stack (especially the Store/Repository api) is based on having an Encoded shape representing the JSON shape, so we revert back to that for now.
*/

/**
 * Formats a `Date` as an ISO 8601 string, returning `"Invalid Date"` for
 * invalid dates instead of throwing.
 *
 * When to use:
 * - You want a safe `toISOString()` that never throws.
 *
 * Behavior:
 * - Returns `date.toISOString()` on success.
 * - Returns `"Invalid Date"` if `toISOString()` throws (e.g. for
 *   `new Date(NaN)`).
 * - Pure function; does not mutate input.
 *
 * **Example** (Safe date formatting)
 *
 * ```ts
 * import { Formatter } from "effect"
 *
 * console.log(Formatter.formatDate(new Date("2024-01-15T10:30:00Z")))
 * // 2024-01-15T10:30:00.000Z
 *
 * console.log(Formatter.formatDate(new Date("invalid")))
 * // Invalid Date
 * ```
 *
 * See also: {@link format}
 *
 * @internal
 */
export function formatDate(date: Date): string {
  try {
    return date.toISOString()
  } catch {
    return "Invalid Date"
  }
}

/**
 * Decodes a `string` into a `Date` and encodes a `Date` back to a `string`.
 *
 * When to use this:
 * - Parsing ISO 8601 date strings from APIs or user input.
 *
 * Behavior:
 * - Decode: creates a `Date` from the string (like `new Date(s)`).
 * - Encode: converts the `Date` to an ISO string (like `date.toISOString()`),
 *   returning `"Invalid Date"` for invalid dates.
 *
 * **Example** (Date from string)
 *
 * ```ts
 * import { Schema, SchemaTransformation } from "effect"
 *
 * const schema = Schema.String.pipe(
 *   Schema.decodeTo(Schema.Date, SchemaTransformation.dateFromString)
 * )
 * ```
 *
 * See also:
 * - {@link numberFromString}
 * - {@link dateTimeUtcFromString}
 *
 * @category Coercions
 * @since 4.0.0
 */
export const dateFromString: SchemaTransformation.Transformation<globalThis.Date, string> = new SchemaTransformation
  .Transformation(
  SchemaGetter.Date(),
  SchemaGetter.transform(formatDate)
)

const DateString = S.String.annotate({
  identifier: "Date",
  description: "a string in ISO 8601 format that will be decoded as a Date",
  format: "date-time"
})

/**
 * Schema type for {@link DateFromString}.
 *
 * @category Schemas
 * @since 4.0.0
 */
export interface DateFromString extends S.decodeTo<S.Date, S.String> {}

/**
 * A transformation schema that parses an ISO 8601 string into a `Date`.
 *
 * Decoding:
 * - A `string` is decoded as a `Date`.
 *
 * Encoding:
 * - A `Date` is encoded as a `string`.
 *
 * @since 4.0.0
 */
export const DateFromString: DateFromString = DateString.pipe(S.decodeTo(S.Date, dateFromString))

/**
 * Like the default Schema `Date` but from String with `withDefault` => now
 */
export const Date = Object.assign(DateFromString, {
  withDefault: DateFromString.pipe(withDefaultConstructor(() => new global.Date()))
})

/**
 * Like the default Schema `DateValid` but from String with `withDefault` => now
 */
export const DateValid = Object.assign(Date.check(isDateValid()), {
  withDefault: DateFromString.pipe(withDefaultConstructor(() => new global.Date()))
})

/**
 * Like the default Schema `Boolean` but with `withDefault` => false
 */
export const Boolean = Object.assign(S.Boolean, {
  withDefault: S.Boolean.pipe(withDefaultConstructor(() => false))
})

/**
 * You probably want to use `Finite` instead of this.
 * Like the default Schema `Number` but with `withDefault` => 0
 */
export const Number = Object.assign(S.Number, { withDefault: S.Number.pipe(withDefaultConstructor(() => 0)) })

/**
 * Like the default Schema `Finite` but with `withDefault` => 0
 */
export const Finite = Object.assign(S.Finite, { withDefault: S.Finite.pipe(withDefaultConstructor(() => 0)) })

/**
 * Like the default Schema `Literal` but with `withDefault` => literals[0]
 */
export const Literal = <Literals extends NonEmptyReadonlyArray<AST.LiteralValue>>(...literals: Literals) =>
  pipe(
    S.Literals(literals),
    (s) =>
      Object.assign(s, {
        changeDefault: <A extends Literals[number]>(a: A) => {
          return Object.assign(S.Literals(literals), {
            Default: a,
            withDefault: s.pipe(withDefaultConstructor(() => a))
          }) // todo: copy annotations from original?
        },
        Default: literals[0] as typeof literals[0],
        withDefault: s.pipe(withDefaultConstructor(() => literals[0]))
      })
  )

/**
 * Like the default Schema `Array` but with `withDefault` => []
 */
export function Array<ValueSchema extends S.Top>(value: ValueSchema) {
  return pipe(
    S.Array(value),
    (s) => Object.assign(s, { withDefault: s.pipe(withDefaultConstructor(() => [])) })
  )
}

/**
 * An annotated `S.Array` of unique items that decodes to a `ReadonlySet`.
 */
export const ReadonlySetFromArray = <ValueSchema extends S.Top>(value: ValueSchema): S.Codec<
  ReadonlySet<ValueSchema["Type"]>,
  readonly ValueSchema["Encoded"][],
  ValueSchema["DecodingServices"],
  ValueSchema["EncodingServices"]
> => {
  const from = S
    .Array(value)
    .annotate({ expected: "an array of unique items that will be decoded as a ReadonlySet" })
  const to = S.instanceOf(Set) as S.instanceOf<ReadonlySet<S.Schema.Type<ValueSchema>>>
  const schema = from.pipe(
    S.decodeTo(
      to,
      SchemaTransformation.transform({
        decode: (arr) => new Set(arr) as ReadonlySet<S.Schema.Type<ValueSchema>>,
        encode: (set) => [...set]
      })
    )
  )
  return S.revealCodec(schema)
}

/**
 * An annotated `S.Array` of key-value tuples that decodes to a `ReadonlyMap`.
 */
export const ReadonlyMapFromArray = <KeySchema extends S.Top, ValueSchema extends S.Top>(pair: {
  readonly key: KeySchema
  readonly value: ValueSchema
}): S.Codec<
  ReadonlyMap<KeySchema["Type"], S.Schema.Type<ValueSchema>>,
  readonly (readonly [KeySchema["Encoded"], ValueSchema["Encoded"]])[],
  KeySchema["DecodingServices"] | ValueSchema["DecodingServices"],
  KeySchema["EncodingServices"] | ValueSchema["EncodingServices"]
> => {
  const from = S
    .Array(S.Tuple([pair.key, pair.value]))
    .annotate({ expected: "an array of key-value tuples that will be decoded as a ReadonlyMap" })
  const to = S.instanceOf(Map) as S.instanceOf<
    ReadonlyMap<S.Schema.Type<KeySchema>, S.Schema.Type<ValueSchema>>
  >
  const schema = from.pipe(
    S.decodeTo(
      to,
      SchemaTransformation.transform({
        decode: (
          arr
        ) => new Map(arr) as ReadonlyMap<S.Schema.Type<KeySchema>, S.Schema.Type<ValueSchema>>,
        encode: (
          map
        ) => [...map.entries()] as any // fu
      })
    )
  )
  return S.revealCodec(schema)
}

/**
 * Like the default Schema `ReadonlySet` but from Array with `withDefault` => new Set()
 */
export const ReadonlySet = <ValueSchema extends S.Top>(value: ValueSchema) =>
  pipe(
    ReadonlySetFromArray(value),
    (s) =>
      Object.assign(s, { withDefault: s.pipe(withDefaultConstructor(() => new Set<S.Schema.Type<ValueSchema>>())) })
  )

/**
 * Like the default Schema `ReadonlyMap` but from Array with `withDefault` => new Map()
 */
export const ReadonlyMap = <KeySchema extends S.Top, ValueSchema extends S.Top>(pair: {
  readonly key: KeySchema
  readonly value: ValueSchema
}) =>
  pipe(
    ReadonlyMapFromArray(pair),
    (s) => Object.assign(s, { withDefault: s.pipe(withDefaultConstructor(() => new Map())) })
  )

/**
 * Like the default Schema `NullOr` but with `withDefault` => null
 */
export const NullOr = <Schema extends S.Top>(self: Schema) =>
  pipe(
    S.NullOr(self),
    (s) => Object.assign(s, { withDefault: s.pipe(withDefaultConstructor(() => null)) })
  )

export const defaultDate = <Schema extends S.Top>(schema: Schema) =>
  schema.pipe(withDefaultConstructor(() => new global.Date()))

export const defaultBool = <Schema extends S.Top>(schema: Schema) => schema.pipe(withDefaultConstructor(() => false))

export const defaultNullable = <Schema extends S.Top>(schema: Schema) => schema.pipe(withDefaultConstructor(() => null))

export const defaultArray = <Schema extends S.Top>(schema: Schema) => schema.pipe(withDefaultConstructor(() => []))

export const defaultMap = <Schema extends S.Top>(schema: Schema) => schema.pipe(withDefaultConstructor(() => new Map()))

export const defaultSet = <Schema extends S.Top>(schema: Schema) => schema.pipe(withDefaultConstructor(() => new Set()))

export const withDefaultMake = <Self extends S.Top>(s: Self) => {
  const a = Object.assign(S.decodeSync(s as any) as WithDefaults<Self>, s)
  Object.setPrototypeOf(a, s)
  return a

  // return s as Self & WithDefaults<Self>
}

export type WithDefaults<Self extends S.Top> = (
  i: Self["Encoded"],
  options?: SchemaAST.ParseOptions
) => Self["Type"]

// type GetKeys<U> = U extends Record<infer K, any> ? K : never
// type UnionToIntersection2<U extends object> = {
//   readonly [K in GetKeys<U>]: U extends Record<K, infer T> ? T : never
// }

// export type Test<P extends B.Brand<any>> = {
//   [K in keyof P[B.BrandTypeId]]: K extends string | symbol ? {
//       readonly [k in K]: k
//     }
//     : never
// }[keyof P[B.BrandTypeId]]
// export type UnionToIntersection3<U> = (U extends any ? (k: U) => void : never) extends ((k: infer I) => void) ? I
//   : never

export const inputDate = extendM(
  S.Union([S.DateValid, Date]).pipe(S.revealCodec),
  (s) => ({ withDefault: s.pipe(withDefaultConstructor(() => new globalThis.Date())) })
)

export interface UnionBrand {}

// TODO: v4 migration — makeOpt used internal PropertySignature types that are removed in v4
// Simplified to use v4's S.optional / S.optionalKey directly
export function makeOptional<NER extends S.Struct.Fields>(
  t: NER
): {
  [K in keyof NER]: NER[K] extends S.Top ? ReturnType<typeof S.optional<NER[K] & S.Top>> : any
} {
  return typedKeysOf(t).reduce((prev, cur) => {
    prev[cur] = S.optional(t[cur] as any)
    return prev
  }, {} as any)
}

export function makeExactOptional<NER extends S.Struct.Fields>(
  t: NER
): {
  [K in keyof NER]: NER[K] extends S.Top ? ReturnType<typeof S.optionalKey<NER[K] & S.Top>> : any
} {
  return typedKeysOf(t).reduce((prev, cur) => {
    prev[cur] = S.optionalKey(t[cur] as any)
    return prev
  }, {} as any)
}

/** A version of transform which is only a one way mapping of From->To */
export const transformTo = <To extends S.Top, From extends S.Top>(
  from: From,
  to: To,
  decode: (
    fromA: From["Type"],
    options: SchemaAST.ParseOptions
  ) => To["Encoded"]
) =>
  from.pipe(
    S.decodeTo(
      to,
      SchemaTransformation.transformOrFail({
        decode: (input: any, options: any) => Effect.sync(() => decode(input, options)),
        encode: (i: any) =>
          Effect.fail(
            new SchemaIssue.Forbidden(
              Option.some(i),
              { message: "One way schema transformation, encoding is not allowed" }
            )
          )
      })
    )
  )

/** A version of transformOrFail which is only a one way mapping of From->To */
export const transformToOrFail = <To extends S.Top, From extends S.Top, RD>(
  from: From,
  to: To,
  decode: (
    fromA: From["Type"],
    options: SchemaAST.ParseOptions
  ) => Effect.Effect<To["Encoded"], SchemaIssue.Issue, RD>
) =>
  from.pipe(
    S.decodeTo(
      to,
      SchemaTransformation.transformOrFail({
        decode,
        encode: (i: any) =>
          Effect.fail(
            new SchemaIssue.Forbidden(
              Option.some(i),
              { message: "One way schema transformation, encoding is not allowed" }
            )
          )
      })
    )
  )

export const provide = <Self extends S.Top, R>(
  self: Self,
  context: Context.Context<R>
): ProvidedCodec<Self, R> => {
  const prov = Effect.provide(context)
  return self.pipe(
    S.middlewareDecoding((effect) => prov(effect)),
    S.middlewareEncoding((effect) => prov(effect))
  ) as ProvidedCodec<Self, R>
}
export const contextFromServices = <
  Self extends S.Top,
  Tags extends ReadonlyArray<Context.Key<any, any>>
>(
  self: Self,
  ...services: Tags
): Effect.Effect<
  ProvidedCodec<Self, Context.Service.Identifier<Tags[number]>>,
  never,
  Context.Service.Identifier<Tags[number]>
> =>
  Effect.gen(function*() {
    const context: Context.Context<Context.Service.Identifier<Tags[number]>> = Context.pick(...services)(
      yield* Effect.services<Context.Service.Identifier<Tags[number]>>()
    )
    return provide(self, context)
  })

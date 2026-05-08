/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/**
 * # `withConstructorDefault` policy
 *
 * The `withConstructorDefault` properties exported throughout this module
 * (and from `numbers.ts`, `moreStrings.ts`, `ids.ts`) attach a default value
 * that is **only** applied during construction — i.e. when the field is
 * omitted from the input to a Schema constructor / `.make(...)` call.
 *
 * They are **NOT** applied during `decode` (JSON, database rows, RPC payloads,
 * etc.). Decoding a payload with a missing field will still fail with a parse
 * error, exactly as if the default were not present.
 *
 * Concretely this means `withConstructorDefault` MUST NOT be relied on as a
 * just-in-time migration mechanism for database fields. If a stored record is
 * missing a newly added field, the constructor default will not fill it in on
 * read — decoding will fail.
 *
 * ## Don't reach for `withDecodingDefault*` either
 *
 * The sibling `withDecodingDefaultType` (and `withDecodingDefault`) extensions
 * exist, but they are discouraged for migrating persisted data. A missing
 * field in a stored record is just as likely to be data corruption as it is
 * an old-shape document; silently substituting a default hides the problem
 * and can poison downstream aggregates.
 *
 * Prefer an **explicit, preferably versioned** migration of database data
 * (a schema-version field, a one-shot backfill, or a transform on read that
 * is gated on an explicit version marker) over shoving missing fields under
 * the rug with a decode-time default.
 */
import { Config, Effect, Function, Option, pipe, type SchemaAST, SchemaIssue, SchemaTransformation } from "effect"
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

const concurrencySetting = Effect.runSync(
  Config
    .literal("unbounded", "SCHEMA_CONCURRENCY")
    .pipe(Config.orElse(() => Config.number("SCHEMA_CONCURRENCY")), Config.option)
    .asEffect()
)

export const DefaultParseOptions: SchemaAST.ParseOptions = {
  concurrency: Option.getOrElse(concurrencySetting, () => "unbounded" as const)
}

/**
 * Parse-options annotation used on schema constructors for decode paths where callers
 * cannot currently pass parse options (notably some RPC / HttpApi integration paths).
 *
 * Keep this annotation in place so those framework-managed decodes still run with
 * unbounded concurrency by default.
 */
export const concurrencyUnbounded = { parseOptions: DefaultParseOptions } as const

type DecodeLike = (schema: any) => (input: any, options?: SchemaAST.ParseOptions) => any

export const withDefaultParseOptions = <Decode extends DecodeLike>(
  decode: Decode,
  defaultParseOptions: SchemaAST.ParseOptions = DefaultParseOptions
): Decode =>
  ((schema: any) => {
    const run = decode(schema)
    return (input: any, options?: SchemaAST.ParseOptions) => run(input, { ...defaultParseOptions, ...options })
  }) as Decode

// TODO: v4 migration - Date is no longer by default encoded to string.

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
export const DateFromString: DateFromString = DateString.pipe(S.decodeTo(S.Date, SchemaTransformation.dateFromString))

/** Like the default Schema `Date` but from String, with default helpers. */
export const Date = Object.assign(DateFromString, {
  /**
   * Construction-only default `new Date()`. Applied only when the field is
   * omitted from `.make(...)` input. NOT applied during decode — cannot be
   * used to JIT-migrate database fields. See file-level note.
   */
  withConstructorDefault: DateFromString.pipe(S.withConstructorDefault(Effect.sync(() => new global.Date()))),
  /**
   * Decode-time default `new Date()`. **Discouraged for persisted data:** a
   * missing field may be data corruption, not an old-shape document; silently
   * substituting `new Date()` hides the problem. Prefer an explicit,
   * preferably versioned migration over a decode-time fallback. See
   * file-level note.
   */
  withDecodingDefaultType: DateFromString.pipe(S.withDecodingDefaultType(Effect.sync(() => new global.Date())))
})

/** Like the default Schema `DateValid` but from String, with default helpers. */
export const DateValid = Object.assign(Date.check(isDateValid()), {
  /**
   * Construction-only default `new Date()`. Applied only when the field is
   * omitted from `.make(...)` input. NOT applied during decode — cannot be
   * used to JIT-migrate database fields. See file-level note.
   */
  withConstructorDefault: DateFromString.pipe(S.withConstructorDefault(Effect.sync(() => new global.Date()))),
  /**
   * Decode-time default `new Date()`. **Discouraged for persisted data:** a
   * missing field may be data corruption, not an old-shape document; silently
   * substituting `new Date()` hides the problem. Prefer an explicit,
   * preferably versioned migration over a decode-time fallback. See
   * file-level note.
   */
  withDecodingDefaultType: DateFromString.pipe(S.withDecodingDefaultType(Effect.sync(() => new global.Date())))
})

/** Like the default Schema `Boolean` but with default helpers. */
export const Boolean = Object.assign(S.Boolean, {
  /**
   * Construction-only default `false`. Applied only when the field is
   * omitted from `.make(...)` input. NOT applied during decode — cannot be
   * used to JIT-migrate database fields. See file-level note.
   */
  withConstructorDefault: S.Boolean.pipe(S.withConstructorDefault(Effect.succeed(false))),
  /**
   * Decode-time default `false`. **Discouraged for persisted data:** a
   * missing field may be data corruption, not an old-shape document; silently
   * substituting `false` hides the problem. Prefer an explicit, preferably
   * versioned migration over a decode-time fallback. See file-level note.
   */
  withDecodingDefaultType: S.Boolean.pipe(S.withDecodingDefaultType(Effect.succeed(false)))
})

/**
 * You probably want to use `Finite` instead of this. Like the default Schema
 * `Number` but with default helpers.
 */
export const Number = Object.assign(S.Number, {
  /**
   * Construction-only default `0`. Applied only when the field is omitted
   * from `.make(...)` input. NOT applied during decode — cannot be used to
   * JIT-migrate database fields. See file-level note.
   */
  withConstructorDefault: S.Number.pipe(S.withConstructorDefault(Effect.succeed(0))),
  /**
   * Decode-time default `0`. **Discouraged for persisted data:** a missing
   * field may be data corruption, not an old-shape document; silently
   * substituting `0` hides the problem. Prefer an explicit, preferably
   * versioned migration over a decode-time fallback. See file-level note.
   */
  withDecodingDefaultType: S.Number.pipe(S.withDecodingDefaultType(Effect.succeed(0)))
})

/** Like the default Schema `Finite` but with default helpers. */
export const Finite = Object.assign(S.Finite, {
  /**
   * Construction-only default `0`. Applied only when the field is omitted
   * from `.make(...)` input. NOT applied during decode — cannot be used to
   * JIT-migrate database fields. See file-level note.
   */
  withConstructorDefault: S.Finite.pipe(S.withConstructorDefault(Effect.succeed(0))),
  /**
   * Decode-time default `0`. **Discouraged for persisted data:** a missing
   * field may be data corruption, not an old-shape document; silently
   * substituting `0` hides the problem. Prefer an explicit, preferably
   * versioned migration over a decode-time fallback. See file-level note.
   */
  withDecodingDefaultType: S.Finite.pipe(S.withDecodingDefaultType(Effect.succeed(0)))
})

/** Like the default Schema `Literals` but with default helpers. Default value is `literals[0]`. */
export const Literals = <const Literals extends NonEmptyReadonlyArray<AST.LiteralValue>>(literals: Literals) =>
  pipe(
    S.Literals(literals),
    (s) =>
      Object.assign(s, {
        /** Override the default literal value used by `withConstructorDefault` / `withDecodingDefaultType`. */
        changeDefault: <A extends Literals[number]>(a: A) => {
          return Object.assign(S.Literals(literals), {
            Default: a,
            /**
             * Construction-only default. Applied only when the field is
             * omitted from `.make(...)` input. NOT applied during decode —
             * cannot be used to JIT-migrate database fields. See file-level
             * note.
             */
            withConstructorDefault: s.pipe(S.withConstructorDefault(Effect.succeed(a))),
            /**
             * Decode-time default. **Discouraged for persisted data:** a
             * missing field may be data corruption, not an old-shape
             * document; silently substituting hides the problem. Prefer an
             * explicit, preferably versioned migration over a decode-time
             * fallback. See file-level note.
             */
            withDecodingDefaultType: s.pipe(S.withDecodingDefaultType(Effect.succeed(a)))
          }) // todo: copy annotations from original?
        },
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-type-assertion -- load-bearing: Object.assign widens the field type without it, breaking `expectTypeOf(l.Default).toEqualTypeOf<"a">()` in tests
        Default: literals[0] as Literals[0],
        /**
         * Construction-only default `literals[0]`. Applied only when the
         * field is omitted from `.make(...)` input. NOT applied during
         * decode — cannot be used to JIT-migrate database fields. See
         * file-level note.
         */
        withConstructorDefault: s.pipe(S.withConstructorDefault(Effect.succeed(literals[0]))),
        /**
         * Decode-time default `literals[0]`. **Discouraged for persisted
         * data:** a missing field may be data corruption, not an old-shape
         * document; silently substituting hides the problem. Prefer an
         * explicit, preferably versioned migration over a decode-time
         * fallback. See file-level note.
         */
        withDecodingDefaultType: s.pipe(S.withDecodingDefaultType(Effect.succeed(literals[0])))
      })
  )

/** Like the default Schema `Array` but with default helpers. */
export function Array<ValueSchema extends S.Top>(value: ValueSchema) {
  return pipe(
    S.Array(value).annotate(concurrencyUnbounded),
    (s) =>
      Object.assign(s, {
        /**
         * Construction-only default `[]`. Applied only when the field is
         * omitted from `.make(...)` input. NOT applied during decode —
         * cannot be used to JIT-migrate database fields. See file-level
         * note.
         */
        withConstructorDefault: s.pipe(S.withConstructorDefault(Effect.sync(() => []))),
        /**
         * Decode-time default `[]`. **Discouraged for persisted data:** a
         * missing field may be data corruption, not an old-shape document;
         * silently substituting `[]` hides the problem. Prefer an explicit,
         * preferably versioned migration over a decode-time fallback. See
         * file-level note.
         */
        withDecodingDefaultType: s.pipe(S.withDecodingDefaultType(Effect.sync(() => [])))
      })
  )
}

/**
 * An annotated `S.Array` of unique items that decodes to a `ReadonlySet`.
 */
export const ReadonlySetFromArray = <ValueSchema extends S.Top>(value: ValueSchema) => {
  const from = S
    .Array(value)
    .annotate({ ...concurrencyUnbounded, expected: "an array of unique items that will be decoded as a ReadonlySet" })
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
  return schema
}

/**
 * An annotated `S.Array` of key-value tuples that decodes to a `ReadonlyMap`.
 */
export const ReadonlyMapFromArray = <KeySchema extends S.Top, ValueSchema extends S.Top>(pair: {
  readonly key: KeySchema
  readonly value: ValueSchema
}) => {
  const from = S
    .Array(S.Tuple([pair.key, pair.value]))
    .annotate({
      ...concurrencyUnbounded,
      expected: "an array of key-value tuples that will be decoded as a ReadonlyMap"
    })
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
  return schema
}

/** Like the default Schema `ReadonlySet` but from Array, with default helpers. */
export const ReadonlySet = <ValueSchema extends S.Top>(value: ValueSchema) =>
  pipe(
    ReadonlySetFromArray(value),
    (s) =>
      Object.assign(s, {
        /**
         * Construction-only default `new Set()`. Applied only when the field
         * is omitted from `.make(...)` input. NOT applied during decode —
         * cannot be used to JIT-migrate database fields. See file-level
         * note.
         */
        withConstructorDefault: s.pipe(
          S.withConstructorDefault(Effect.sync(() => new Set<S.Schema.Type<ValueSchema>>()))
        ),
        /**
         * Decode-time default `new Set()`. **Discouraged for persisted
         * data:** a missing field may be data corruption, not an old-shape
         * document; silently substituting an empty set hides the problem.
         * Prefer an explicit, preferably versioned migration over a
         * decode-time fallback. See file-level note.
         */
        withDecodingDefaultType: s.pipe(
          S.withDecodingDefaultType(Effect.sync(() => new Set<S.Schema.Type<ValueSchema>>()))
        )
      })
  )

/** Like the default Schema `ReadonlyMap` but from Array, with default helpers. */
export const ReadonlyMap = <KeySchema extends S.Top, ValueSchema extends S.Top>(pair: {
  readonly key: KeySchema
  readonly value: ValueSchema
}) =>
  pipe(
    ReadonlyMapFromArray(pair),
    (s) =>
      Object.assign(s, {
        /**
         * Construction-only default `new Map()`. Applied only when the field
         * is omitted from `.make(...)` input. NOT applied during decode —
         * cannot be used to JIT-migrate database fields. See file-level
         * note.
         */
        withConstructorDefault: s.pipe(S.withConstructorDefault(Effect.sync(() => new Map()))),
        /**
         * Decode-time default `new Map()`. **Discouraged for persisted
         * data:** a missing field may be data corruption, not an old-shape
         * document; silently substituting an empty map hides the problem.
         * Prefer an explicit, preferably versioned migration over a
         * decode-time fallback. See file-level note.
         */
        withDecodingDefaultType: s.pipe(S.withDecodingDefaultType(Effect.sync(() => new Map())))
      })
  )

/** Like the default Schema `NullOr` but with default helpers. */
export const NullOr = <Schema extends S.Top>(self: Schema) =>
  pipe(
    S.NullOr(self),
    (s) =>
      Object.assign(s, {
        /**
         * Construction-only default `null`. Applied only when the field is
         * omitted from `.make(...)` input. NOT applied during decode —
         * cannot be used to JIT-migrate database fields. See file-level
         * note.
         */
        withConstructorDefault: s.pipe(S.withConstructorDefault(Effect.succeed(null))),
        /**
         * Decode-time default `null`. **Discouraged for persisted data:** a
         * missing field may be data corruption, not an old-shape document;
         * silently substituting `null` hides the problem. Prefer an
         * explicit, preferably versioned migration over a decode-time
         * fallback. See file-level note.
         */
        withDecodingDefaultType: s.pipe(S.withDecodingDefaultType(Effect.succeed(null)))
      })
  )

/**
 * Attach a `withConstructorDefault` of `new Date()` to any schema.
 *
 * **Construction-only.** Applied only when the field is omitted from
 * `.make(...)` input. NOT applied during decode — cannot be used to
 * JIT-migrate database fields. See file-level note.
 */
export const defaultDate = <Schema extends S.Top & S.WithoutConstructorDefault>(schema: Schema) =>
  schema.pipe(S.withConstructorDefault(Effect.sync(() => new global.Date())))

/**
 * Attach a `withConstructorDefault` of `false` to any schema.
 *
 * **Construction-only.** Applied only when the field is omitted from
 * `.make(...)` input. NOT applied during decode — cannot be used to
 * JIT-migrate database fields. See file-level note.
 */
export const defaultBool = <Schema extends S.Top & S.WithoutConstructorDefault>(schema: Schema) =>
  schema.pipe(S.withConstructorDefault(Effect.succeed(false)))

/**
 * Attach a `withConstructorDefault` of `null` to any schema.
 *
 * **Construction-only.** Applied only when the field is omitted from
 * `.make(...)` input. NOT applied during decode — cannot be used to
 * JIT-migrate database fields. See file-level note.
 */
export const defaultNullable = <Schema extends S.Top & S.WithoutConstructorDefault>(schema: Schema) =>
  schema.pipe(S.withConstructorDefault(Effect.succeed(null)))

/**
 * Attach a `withConstructorDefault` of `[]` to any schema.
 *
 * **Construction-only.** Applied only when the field is omitted from
 * `.make(...)` input. NOT applied during decode — cannot be used to
 * JIT-migrate database fields. See file-level note.
 */
export const defaultArray = <Schema extends S.Top & S.WithoutConstructorDefault>(schema: Schema) =>
  schema.pipe(S.withConstructorDefault(Effect.sync(() => [])))

/**
 * Attach a `withConstructorDefault` of `new Map()` to any schema.
 *
 * **Construction-only.** Applied only when the field is omitted from
 * `.make(...)` input. NOT applied during decode — cannot be used to
 * JIT-migrate database fields. See file-level note.
 */
export const defaultMap = <Schema extends S.Top & S.WithoutConstructorDefault>(schema: Schema) =>
  schema.pipe(S.withConstructorDefault(Effect.sync(() => new Map())))

/**
 * Attach a `withConstructorDefault` of `new Set()` to any schema.
 *
 * **Construction-only.** Applied only when the field is omitted from
 * `.make(...)` input. NOT applied during decode — cannot be used to
 * JIT-migrate database fields. See file-level note.
 */
export const defaultSet = <Schema extends S.Top & S.WithoutConstructorDefault>(schema: Schema) =>
  schema.pipe(S.withConstructorDefault(Effect.sync(() => new Set())))

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

/** Union of `DateValid` and `Date`, with default helpers. */
export const inputDate = extendM(
  S.Union([S.DateValid, Date]),
  (s) => ({
    /**
     * Construction-only default `new Date()`. Applied only when the field is
     * omitted from `.make(...)` input. NOT applied during decode — cannot be
     * used to JIT-migrate database fields. See file-level note.
     */
    withConstructorDefault: s.pipe(S.withConstructorDefault(Effect.sync(() => new globalThis.Date()))),
    /**
     * Decode-time default `new Date()`. **Discouraged for persisted data:** a
     * missing field may be data corruption, not an old-shape document;
     * silently substituting `new Date()` hides the problem. Prefer an
     * explicit, preferably versioned migration over a decode-time fallback.
     * See file-level note.
     */
    withDecodingDefaultType: s.pipe(S.withDecodingDefaultType(Effect.sync(() => new globalThis.Date())))
  })
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

export const provide: {
  <R>(context: Context.Context<R>): <Self extends S.Top>(self: Self) => ProvidedCodec<Self, R>
  <Self extends S.Top, R>(self: Self, context: Context.Context<R>): ProvidedCodec<Self, R>
} = Function.dual(2, <Self extends S.Top, R>(self: Self, context: Context.Context<R>): ProvidedCodec<Self, R> => {
  const prov = Effect.provide(context)
  return self.pipe(
    S.middlewareDecoding((effect) => prov(effect)),
    S.middlewareEncoding((effect) => prov(effect))
  )
})
export const contextFromServices = Effect.fnUntraced(function*<
  Self extends S.Top,
  Tags extends ReadonlyArray<Context.Key<any, any>>
>(self: Self, ...services: Tags) {
  const context: Context.Context<Context.Service.Identifier<Tags[number]>> = Context.pick(...services)(
    yield* Effect.context<Context.Service.Identifier<Tags[number]>>()
  )
  return provide(self, context)
}) as <
  Self extends S.Top,
  Tags extends ReadonlyArray<Context.Key<any, any>>
>(
  self: Self,
  ...services: Tags
) => Effect.Effect<
  ProvidedCodec<Self, Context.Service.Identifier<Tags[number]>>,
  never,
  Context.Service.Identifier<Tags[number]>
>

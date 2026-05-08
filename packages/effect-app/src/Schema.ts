import { SchemaAST, type Tracer } from "effect"
import * as S from "effect/Schema"
import { type Simplify } from "effect/Struct"
import type { RequiredKeys } from "effect/Types"
import type { NonEmptyReadonlyArray } from "./Array.js"
import { fakerArb } from "./faker.js"
import { Email as EmailT, type Email as EmailType } from "./Schema/email.js"
import { concurrencyUnbounded, withDefaultMake, withDefaultParseOptions } from "./Schema/ext.js"
import { PhoneNumber as PhoneNumberT, type PhoneNumber as PhoneNumberType } from "./Schema/phoneNumber.js"
import { type AST } from "./Schema/schema.js"
import { copy, extendM, type StructuralCopyOrigin } from "./utils.js"

// ---------------------------------------------------------------------------
// Default helpers — re-exported from effect/Schema
//
// The five helpers below are surfaced explicitly so the (important) policy
// around them lives next to the export. See also the file-level note in
// `./Schema/ext.ts` and the documented wrappers in
// `./Schema/ext.ts`, `./Schema/numbers.ts`, `./Schema/moreStrings.ts`,
// and `./ids.ts`.
//
// **Construction-only**: `withConstructorDefault` fills the field when it
// is omitted from `.make(...)` input. It is NOT applied during decode, so
// it CANNOT be used to just-in-time migrate database fields. A stored
// record missing the field will still fail to decode.
//
// **`withDecodingDefault*` is discouraged**: a missing field in persisted
// data is just as likely to be data corruption as it is an old-shape
// document; silently substituting a default hides the problem and can
// poison downstream aggregates. Prefer an explicit, preferably versioned
// migration of database data over shoving missing fields under the rug.
// ---------------------------------------------------------------------------

/**
 * Attach a default value used **only** when constructing a value (e.g. via
 * `.make(...)` or struct constructors) and the field is omitted from input.
 *
 * **Not applied during decode.** Decoding a payload that is missing the
 * field will still raise a parse error. Do **not** rely on this to migrate
 * database fields just-in-time — see the section header above.
 *
 * @see {@link withDecodingDefault} / {@link withDecodingDefaultType} —
 *   decode-time variants (discouraged for persisted data; use explicit,
 *   versioned migrations instead).
 */
export { withConstructorDefault } from "effect/Schema"

/**
 * Attach a default value used during decode when the field's `Encoded` value
 * is missing **or** `undefined`. The default is specified as an `Encoded`
 * value and threaded through the schema's decode step.
 *
 * **Discouraged for persisted data.** A missing field in a stored record is
 * just as likely to be data corruption as it is an old-shape document;
 * silently substituting a default hides the problem. Prefer an explicit,
 * preferably versioned migration of database data — see the section header
 * above.
 *
 * @see {@link withDecodingDefaultKey} — key-absent-only variant
 * @see {@link withDecodingDefaultType} — `Type`-side variant
 * @see {@link withConstructorDefault} — for `.make(...)`-time defaults
 */
export { withDecodingDefault } from "effect/Schema"

/**
 * Attach a default value used during decode when the field **key is absent**
 * (note: not when present and `undefined`). The default is an `Encoded`
 * value.
 *
 * **Discouraged for persisted data** — same reasoning as
 * {@link withDecodingDefault}. Use explicit, preferably versioned migrations
 * over decode-time fallbacks.
 *
 * @see {@link withDecodingDefault} — value-absent-or-undefined variant
 * @see {@link withDecodingDefaultTypeKey} — `Type`-side variant
 * @see {@link withConstructorDefault} — for `.make(...)`-time defaults
 */
export { withDecodingDefaultKey } from "effect/Schema"

/**
 * Attach a default value used during decode when the field is missing **or**
 * `undefined`. The default is specified as a `Type` value (i.e. on the
 * decoded side).
 *
 * **Discouraged for persisted data** — same reasoning as
 * {@link withDecodingDefault}. Use explicit, preferably versioned migrations
 * over decode-time fallbacks.
 *
 * @see {@link withDecodingDefault} — `Encoded`-side variant
 * @see {@link withDecodingDefaultTypeKey} — key-absent-only variant
 * @see {@link withConstructorDefault} — for `.make(...)`-time defaults
 */
export { withDecodingDefaultType } from "effect/Schema"

/**
 * Attach a default value used during decode when the field **key is absent**
 * (note: not when present and `undefined`). The default is a `Type` value.
 *
 * **Discouraged for persisted data** — same reasoning as
 * {@link withDecodingDefault}. Use explicit, preferably versioned migrations
 * over decode-time fallbacks.
 *
 * @see {@link withDecodingDefaultKey} — `Encoded`-side variant
 * @see {@link withDecodingDefaultType} — value-absent-or-undefined variant
 * @see {@link withConstructorDefault} — for `.make(...)`-time defaults
 */
export { withDecodingDefaultTypeKey } from "effect/Schema"

export * from "effect/Schema"

export * from "./Schema/Class.js"
export { Class, ErrorClass, Opaque, TaggedClass, TaggedErrorClass } from "./Schema/Class.js"

export { fromBrand, nominal } from "./Schema/brand.js"
export { Array, Boolean, Date, DateFromString, DateValid, Finite, Literals, NullOr, Number, ReadonlyMap, ReadonlySet } from "./Schema/ext.js"
export { Int, NonNegativeInt } from "./Schema/numbers.js"

export * from "./Schema/email.js"
export * from "./Schema/ext.js"
export * from "./Schema/moreStrings.js"
export * from "./Schema/numbers.js"
export * from "./Schema/phoneNumber.js"
export * from "./Schema/schema.js"
export * from "./Schema/SpecialJsonSchema.js"
export * from "./Schema/SpecialOpenApi.js"
export * from "./Schema/strings.js"
export { NonEmptyString } from "./Schema/strings.js"

export * as SchemaIssue from "effect/SchemaIssue"

export const decodeEffectConcurrently: typeof S.decodeEffect = withDefaultParseOptions(S.decodeEffect)
export const decodeUnknownEffectConcurrently: typeof S.decodeUnknownEffect = withDefaultParseOptions(
  S.decodeUnknownEffect
)
export * as SchemaParser from "./Schema/SchemaParser.js"

export { Void as Void_ } from "effect/Schema"

// ---------------------------------------------------------------------------
// Struct / NonEmptyArray / Record
// ---------------------------------------------------------------------------

export function Struct<const Fields extends S.Struct.Fields>(
  fields: Fields
): Struct<Fields> {
  const result = S.Struct(fields).annotate(concurrencyUnbounded)
  const allowVoidMake = (schema: any): any => {
    // Normalize omitted input to an empty object so optional/default-only structs can be constructed with make().
    const origMake: any = schema.make
    const origMakeOption: any = schema.makeOption
    const origMakeEffect: any = schema.makeEffect
    schema.make = function(this: any, input: any, options?: any) {
      return origMake.call(this, input === undefined ? {} : input, options)
    }
    schema.makeOption = function(this: any, input: any, options?: any) {
      return origMakeOption.call(this, input === undefined ? {} : input, options)
    }
    schema.makeEffect = function(this: any, input: any, options?: any) {
      return origMakeEffect.call(this, input === undefined ? {} : input, options)
    }
    return schema
  }
  // eslint-disable-next-line @typescript-eslint/unbound-method, @typescript-eslint/no-unsafe-assignment
  const origMapFields: any = result.mapFields
  // eslint-disable-next-line @typescript-eslint/unbound-method, @typescript-eslint/no-unsafe-assignment
  const origAnnotate: any = result.annotate
  // eslint-disable-next-line @typescript-eslint/unbound-method, @typescript-eslint/no-unsafe-assignment
  const origAnnotateKey: any = result.annotateKey

  const preserveCopyAndMethods = (schema: any): any => {
    schema.copy = copy
    schema.mapFields = function(this: any, f: any, options?: any) {
      return (result as any).mapFields.call(this, f, options)
    }
    schema.annotate = function(this: any, annotations?: any) {
      return (result as any).annotate.call(this, annotations)
    }
    schema.annotateKey = function(this: any, annotations?: any) {
      return (result as any).annotateKey.call(this, annotations)
    }
    return allowVoidMake(schema)
  }
  ;(result as any).mapFields = function(this: any, f: any, options?: any) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    const mapped = origMapFields.call(this, f, options).annotate(concurrencyUnbounded)
    return preserveCopyAndMethods(mapped)
  }
  ;(result as any).annotate = function(this: any, annotations?: any) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    const annotated = origAnnotate.call(this, annotations)
    return preserveCopyAndMethods(annotated)
  }
  ;(result as any).annotateKey = function(this: any, annotations?: any) {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call
    const annotated = origAnnotateKey.call(this, annotations)
    return preserveCopyAndMethods(annotated)
  }
  ;(result as any).copy = copy
  allowVoidMake(result)
  return result as Struct<Fields>
}

export interface Struct<Fields extends S.Struct.Fields> extends
  S.Bottom<
    Struct.Type<Fields>,
    Struct.Encoded<Fields>,
    Struct.DecodingServices<Fields>,
    Struct.EncodingServices<Fields>,
    AST.Objects,
    // Rebuild is what's returned from annotate etc
    Struct<Fields>,
    Struct.MakeIn<Fields>,
    Struct.Iso<Fields>
  >
{
  /**
   * The field definitions of this struct. Spread them into a new struct to
   * reuse fields across schemas.
   *
   * **Example** (Reusing fields across structs)
   *
   * ```ts
   * import { Schema } from "effect"
   *
   * const Timestamped = Schema.Struct({
   *   createdAt: Schema.Date,
   *   updatedAt: Schema.Date
   * })
   *
   * const User = Schema.Struct({
   *   ...Timestamped.fields,
   *   name: Schema.String,
   *   email: Schema.String
   * })
   * ```
   */
  readonly fields: Fields
  /**
   * Returns a new struct with the fields modified by the provided function.
   *
   * **Options**
   *
   * - `unsafePreserveChecks` - if `true`, keep any `.check(...)` constraints
   *   that were attached to the original union. Defaults to `false`.
   *
   *   **Warning**: This is an unsafe operation. Since `mapFields`
   *   transformations change the schema type, the original refinement functions
   *   may no longer be valid or safe to apply to the transformed schema. Only
   *   use this option if you have verified that your refinements remain correct
   *   after the transformation.
   */
  mapFields<To extends Struct.Fields>(
    f: (fields: Fields) => To,
    options?: {
      readonly unsafePreserveChecks?: boolean | undefined
    } | undefined
  ): Struct<Simplify<Readonly<To>>>

  // added copy
  readonly copy: StructuralCopyOrigin<Struct.Type<Fields>>
}

export declare namespace Struct {
  export type Fields = S.Struct.Fields
  export type Type<F extends S.Struct.Fields> = S.Struct.Type<F>
  export type Encoded<F extends S.Struct.Fields> = S.Struct.Encoded<F>
  export type DecodingServices<F extends S.Struct.Fields> = S.Struct.DecodingServices<F>
  export type EncodingServices<F extends S.Struct.Fields> = S.Struct.EncodingServices<F>
  // changed; all optional allows void
  export type MakeIn<F extends S.Struct.Fields> = RequiredKeys<S.Struct.MakeIn<F>> extends never
    ? void | S.Struct.MakeIn<F>
    : S.Struct.MakeIn<F>
  export type Iso<F extends S.Struct.Fields> = S.Struct.Iso<F>
}

export type StructNestedEncodedError<T> = {
  readonly _tag: "StructNestedEncodedError"
  readonly message: "Expected a Struct schema or a schema with from.Encoded"
  readonly schema: T
}

export type StructNestedEncoded<T> = T extends { fields: infer Fields extends S.Struct.Fields } ? Struct.Encoded<Fields>
  : T extends { readonly from: { readonly Encoded: infer Encoded } } ? Encoded
  : StructNestedEncodedError<T>

export function NonEmptyArray<Value extends S.Top>(value: Value): S.NonEmptyArray<Value> {
  return S.NonEmptyArray(value).annotate(concurrencyUnbounded)
}

export function TaggedStruct<const Tag extends SchemaAST.LiteralValue, const Fields extends S.Struct.Fields>(
  value: Tag,
  fields: Fields
): TaggedStruct<Tag, Fields> {
  return Struct({ _tag: S.tag(value), ...fields }) as any
}
export interface TaggedStruct<Tag extends SchemaAST.LiteralValue, Fields extends S.Struct.Fields>
  extends Struct<{ readonly _tag: S.tag<Tag> } & Fields>
{}
export declare namespace TaggedStruct {
  export type Fields = S.Struct.Fields
  export type Type<Tag extends SchemaAST.LiteralValue, F extends S.Struct.Fields> = S.Struct.Type<
    { readonly _tag: S.tag<Tag> } & F
  >
  export type Encoded<Tag extends SchemaAST.LiteralValue, F extends S.Struct.Fields> = S.Struct.Encoded<
    { readonly _tag: S.tag<Tag> } & F
  >
  export type DecodingServices<Tag extends SchemaAST.LiteralValue, F extends S.Struct.Fields> =
    S.Struct.DecodingServices<
      { readonly _tag: S.tag<Tag> } & F
    >
  export type EncodingServices<Tag extends SchemaAST.LiteralValue, F extends S.Struct.Fields> =
    S.Struct.EncodingServices<
      { readonly _tag: S.tag<Tag> } & F
    >
  export type MakeIn<Tag extends SchemaAST.LiteralValue, F extends S.Struct.Fields> = S.Struct.MakeIn<
    { readonly _tag: S.tag<Tag> } & F
  >
  export type Iso<Tag extends SchemaAST.LiteralValue, F extends S.Struct.Fields> = S.Struct.Iso<
    { readonly _tag: S.tag<Tag> } & F
  >
}

export function Record<Key extends S.Record.Key, Value extends S.Top>(
  key: Key,
  value: Value
): S.$Record<Key, Value> {
  return S.Record(key, value).annotate(concurrencyUnbounded)
}
export declare namespace Record {
  export type Key = S.Record.Key
  export type Type<K extends S.Record.Key, V extends S.Top> = S.Record.Type<K, V>
  export type Encoded<K extends S.Record.Key, V extends S.Top> = S.Record.Encoded<K, V>
}

export const SpanId = Symbol()
export type SpanId = typeof SpanId

export interface WithOptionalSpan {
  [SpanId]?: Tracer.Span
}

const makeEmail = S.decodeSync(EmailT as any) as (value: string) => EmailType
const makePhoneNumber = S.decodeSync(PhoneNumberT as any) as (value: string) => PhoneNumberType

export const Email = EmailT
  .pipe(
    S.annotate({
      // eslint-disable-next-line @typescript-eslint/unbound-method
      toArbitrary: () => (fc) => fakerArb((faker) => faker.internet.exampleEmail)(fc).map(makeEmail)
    }),
    withDefaultMake
  )

export type Email = EmailType

export const PhoneNumber = PhoneNumberT
  .pipe(
    S.annotate({
      toArbitrary: () => (fc) =>
        // eslint-disable-next-line @typescript-eslint/unbound-method
        fakerArb((faker) => faker.phone.number)(fc).map(makePhoneNumber)
    }),
    withDefaultMake
  )

export type PhoneNumber = PhoneNumberType

// Copied from SchemaAST.collectSentinels (marked @internal in effect).
// Returns all { key, literal } pairs that can discriminate a union member.
const getTagFromAST = (schema: S.Top): string => {
  const sentinels = collectSentinelsFromAST(schema.ast)
  const sentinel = sentinels.find((s) => s.key === "_tag")
  if (sentinel !== undefined && typeof sentinel.literal === "string") return sentinel.literal
  throw new Error("No _tag literal found on schema member")
}

function collectSentinelsFromAST(
  ast: SchemaAST.AST
): Array<{ key: PropertyKey; literal: SchemaAST.LiteralValue | symbol }> {
  switch (ast._tag) {
    case "Declaration": {
      const s = ast.annotations?.["~sentinels"]
      return Array.isArray(s) ? s : []
    }
    case "Objects":
      return ast.propertySignatures.flatMap(
        (ps): Array<{ key: PropertyKey; literal: SchemaAST.LiteralValue | symbol }> => {
          const type = ps.type
          if (!SchemaAST.isOptional(type)) {
            if (SchemaAST.isLiteral(type)) return [{ key: ps.name, literal: type.literal }]
            if (SchemaAST.isUniqueSymbol(type)) return [{ key: ps.name, literal: type.symbol }]
          }
          return []
        }
      )
    case "Suspend":
      return collectSentinelsFromAST(ast.thunk())
    default:
      return []
  }
}

export const tags = <
  Members extends NonEmptyReadonlyArray<(S.Top & { readonly Type: { readonly _tag: string } })>
>(
  self: Members
) =>
  S.Literals(
    self.map(getTagFromAST) as {
      [Index in keyof Members]: Members[Index]["Type"]["_tag"]
    }
  ) as S.Literals<
    {
      [Index in keyof Members]: Members[Index]["Type"]["_tag"]
    }
  >

type TaggedUnionMembers = NonEmptyReadonlyArray<
  S.Top & { readonly Type: { readonly _tag: string } }
>

type TaggedUnionTags<Members extends TaggedUnionMembers> = S.Literals<
  {
    [Index in keyof Members]: Members[Index]["Type"]["_tag"]
  }
>

type TaggedPropertyKeys<A, Members extends TaggedUnionMembers> = {
  [K in keyof A & string]: A[K] extends Members[number]["Type"] ? K : never
}[keyof A & string]

type PropertyGuardsFor<
  Members extends TaggedUnionMembers,
  K extends string,
  A
> =
  & {
    readonly [M in Members[number] as `is${M["Type"]["_tag"]}`]: (
      target: A
    ) => target is A & { readonly [P in K]: M["Type"] }
  }
  & {
    readonly isAnyOf: <const Tags extends ReadonlyArray<Members[number]["Type"]["_tag"]>>(
      tags: Tags
    ) => (
      target: A
    ) => target is A & { readonly [P in K]: Extract<Members[number]["Type"], { readonly _tag: Tags[number] }> }
  }

type PropertyGuards<
  Members extends TaggedUnionMembers,
  K extends string
> =
  & {
    readonly [M in Members[number] as `is${M["Type"]["_tag"]}`]: <
      T extends { readonly [P in K]: Members[number]["Type"] }
    >(target: T) => target is T & { readonly [P in K]: M["Type"] }
  }
  & {
    readonly isAnyOf: <const Tags extends ReadonlyArray<Members[number]["Type"]["_tag"]>>(
      tags: Tags
    ) => <T extends { readonly [P in K]: Members[number]["Type"] }>(
      target: T
    ) => target is T & { readonly [P in K]: Extract<Members[number]["Type"], { readonly _tag: Tags[number] }> }
  }

type TaggedUnionWithTags<Members extends TaggedUnionMembers> = S.toTaggedUnion<"_tag", Members> & {
  readonly tags: TaggedUnionTags<Members>
  readonly generateGuards: <K extends string>(property: K) => PropertyGuards<Members, K>
  readonly generateGuardsFor: <A>() => <K extends TaggedPropertyKeys<A, Members>>(
    property: K
  ) => PropertyGuardsFor<Members, K, A>
}

const extendTaggedUnionWithTags = <Members extends TaggedUnionMembers>(
  schema: S.Union<Members>
): TaggedUnionWithTags<Members> =>
  extendM(schema.pipe(S.toTaggedUnion("_tag")), (tagged) => {
    const makeGuards = (property: string) => {
      const result: any = {}
      const guards: Record<string, (u: unknown) => boolean> = tagged.guards
      for (const tag of Object.keys(guards)) {
        const guard = guards[tag]!
        result[`is${tag}`] = (target: any) => guard(target[property])
      }
      result.isAnyOf = (memberTags: Array<string>) => {
        const check = tagged.isAnyOf(memberTags)
        return (target: any) => check(target[property])
      }
      return result
    }
    return {
      tags: tags(schema.members),
      generateGuards: makeGuards,
      generateGuardsFor: () => makeGuards
    }
  })

export const ExtendTaggedUnion = <Members extends TaggedUnionMembers>(
  schema: S.Union<Members>
): TaggedUnionWithTags<Members> => extendTaggedUnionWithTags(schema)

export const TaggedUnion = <
  Members extends TaggedUnionMembers
>(members: Members): TaggedUnionWithTags<Members> => extendTaggedUnionWithTags(S.Union(members))

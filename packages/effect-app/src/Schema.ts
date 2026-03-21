import { Array, Option, pipe, SchemaAST, type Tracer } from "effect"
import * as S from "effect/Schema"
import type { NonEmptyReadonlyArray } from "./Array.js"
import { fakerArb } from "./faker.js"
import { Email as EmailT, type Email as EmailType } from "./Schema/email.js"
import { withDefaultMake } from "./Schema/ext.js"
import { PhoneNumber as PhoneNumberT, type PhoneNumber as PhoneNumberType } from "./Schema/phoneNumber.js"
import type { AST } from "./Schema/schema.js"
import { extendM } from "./utils.js"

export * from "effect/Schema"
// v4: TaggedError renamed to TaggedErrorClass
export { TaggedErrorClass as TaggedError } from "effect/Schema"

export * from "./Schema/Class.js"
export { Class, TaggedClass } from "./Schema/Class.js"

export { fromBrand, nominal } from "./Schema/brand.js"
export { Array, Boolean, Date, Literal, Map, NullOr, Number, ReadonlyMap, ReadonlySet } from "./Schema/ext.js"
export { Int, NonNegativeInt } from "./Schema/numbers.js"

export * from "./Schema/email.js"
export * from "./Schema/ext.js"
export * from "./Schema/moreStrings.js"
export * from "./Schema/numbers.js"
export * from "./Schema/phoneNumber.js"
export * from "./Schema/schema.js"
export * from "./Schema/strings.js"
export { NonEmptyString } from "./Schema/strings.js"

export * as SchemaIssue from "effect/SchemaIssue"
export * as SchemaParser from "effect/SchemaParser"

export { Void as Void_ } from "effect/Schema"

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

export const makeIs = <A extends { _tag: string }, I, RD, RE>(
  schema: S.Codec<A, I, RD, RE>
) => {
  // In v4, transformations are stored as encoding on nodes, not as wrapper nodes.
  // Union member ASTs are directly Objects (TypeLiteral equivalent).
  if (SchemaAST.isUnion(schema.ast)) {
    return schema.ast.types.reduce((acc, t: AST.AST) => {
      if (!SchemaAST.isObjects(t)) return acc
      const tag = Array.findFirst(t.propertySignatures, (_: any) => {
        if (_.name === "_tag" && SchemaAST.isLiteral(_.type)) {
          return Option.some(_.type)
        }
        return Option.none()
      })
      const ast = Option.getOrUndefined(tag)
      if (!ast) {
        return acc
      }
      return {
        ...acc,
        [String((ast as SchemaAST.Literal).literal)]: (x: { _tag: string }) =>
          x._tag === (ast as SchemaAST.Literal).literal
      }
    }, {} as Is<A>)
  }
  throw new Error("Unsupported")
}

export const makeIsAnyOf = <A extends { _tag: string }, I, RD, RE>(
  schema: S.Codec<A, I, RD, RE>
): IsAny<A> => {
  if (SchemaAST.isUnion(schema.ast)) {
    return <Keys extends A["_tag"][]>(...keys: Keys) => (a: A): a is ExtractUnion<A, ElemType<Keys>> =>
      keys.includes(a._tag)
  }
  throw new Error("Unsupported")
}

export type ExtractUnion<A extends { _tag: string }, Tags extends A["_tag"]> = Extract<A, Record<"_tag", Tags>>
export type Is<A extends { _tag: string }> = { [K in A as K["_tag"]]: (a: A) => a is K }
export type ElemType<A> = A extends Array<infer E> ? E : never
export interface IsAny<A extends { _tag: string }> {
  <Keys extends A["_tag"][]>(...keys: Keys): (a: A) => a is ExtractUnion<A, ElemType<Keys>>
}

const getTagLiteral = <Tag extends string>(schema: S.tag<Tag>): Tag => {
  if (!SchemaAST.isLiteral(schema.ast)) {
    throw new Error("Unsupported _tag schema: expected a literal AST")
  }
  return schema.ast.literal as Tag
}

type TaggedUnionMap<Members extends readonly (S.Top & { fields: { _tag: S.tag<string> } })[]> = {
  [Key in Members[number] as Key["fields"]["_tag"]["Type"]]: Key
}

export const taggedUnionMap = <
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Members extends readonly (S.Top & { fields: { _tag: S.tag<string> } })[]
>(
  self: Members
) => {
  const out = {} as TaggedUnionMap<Members>
  for (const key of self) {
    const tag = getTagLiteral(key.fields._tag) as keyof TaggedUnionMap<Members>
    out[tag] = key as TaggedUnionMap<Members>[typeof tag]
  }
  return out
}

export const tags = <
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Members extends NonEmptyReadonlyArray<(S.Top & { fields: { _tag: S.tag<string> } })>
>(
  self: Members
) =>
  S.Literals(
    self.map((key) => getTagLiteral(key.fields._tag)) as {
      [Index in keyof Members]: S.Schema.Type<Members[Index]["fields"]["_tag"]>
    }
  ) as S.Literals<
    {
      [Index in keyof Members]: S.Schema.Type<Members[Index]["fields"]["_tag"]>
    }
  >

export const ExtendTaggedUnion = <A extends { readonly _tag: string }, I, R>(
  schema: S.Codec<A, I, R>
) =>
  extendM(
    schema,
    (_) => ({
      // is: S.is(schema), // only works with never DecodingServices
      isA: makeIs(_),
      isAnyOf: makeIsAnyOf(_) /*, map: taggedUnionMap(a) */
    })
  )

export const TaggedUnion = <
  Members extends NonEmptyReadonlyArray<
    S.Codec<{ readonly _tag: string }, any, any, any> & { fields: { _tag: S.tag<string> } }
  >
>(...a: Members) =>
  pipe(
    S.Union(a),
    (_) =>
      extendM(_, (_) => ({
        // is: S.is(_), // only works with never DecodingServices
        isA: makeIs(_),
        isAnyOf: makeIsAnyOf(_),
        tagMap: taggedUnionMap(a),
        tags: tags(a)
      }))
  )

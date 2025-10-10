import { Array, Option, pipe, SchemaAST, type Tracer } from "effect"
import * as S from "effect/Schema"
import type { NonEmptyReadonlyArray } from "./Array.js"
import { fakerArb } from "./faker.js"
import { Email as EmailT } from "./Schema/email.js"
import { withDefaultMake } from "./Schema/ext.js"
import { PhoneNumber as PhoneNumberT } from "./Schema/phoneNumber.js"
import type { A, AST } from "./Schema/schema.js"
import { extendM } from "./utils.js"

export * from "effect/Schema"

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

export * as ParseResult from "effect/ParseResult"

export { Void as Void_ } from "effect/Schema"

export const SpanId = Symbol()
export type SpanId = typeof SpanId

export interface WithOptionalSpan {
  [SpanId]?: Tracer.Span
}

export const Email = EmailT
  .pipe(
    S.annotations({
      // eslint-disable-next-line @typescript-eslint/unbound-method
      arbitrary: (): A.LazyArbitrary<Email> => (fc) => fakerArb((faker) => faker.internet.exampleEmail)(fc).map(Email)
    }),
    withDefaultMake
  )

export type Email = EmailT

export const PhoneNumber = PhoneNumberT
  .pipe(
    S.annotations({
      arbitrary: (): A.LazyArbitrary<PhoneNumber> => (fc) =>
        // eslint-disable-next-line @typescript-eslint/unbound-method
        fakerArb((faker) => faker.phone.number)(fc).map(PhoneNumber)
    }),
    withDefaultMake
  )

export const makeIs = <A extends { _tag: string }, I, R>(
  schema: S.Schema<A, I, R>
) => {
  const getToBottom = (ast: AST.AST) => {
    if (SchemaAST.isTransformation(ast)) {
      if (SchemaAST.isDeclaration(ast.to)) {
        return getToBottom(ast.from)
      }
      return getToBottom(ast.to)
    }
    return ast
  }
  if (SchemaAST.isUnion(schema.ast)) {
    return schema.ast.types.reduce((acc, t) => {
      t = getToBottom(t)
      if (!SchemaAST.isTypeLiteral(t)) return acc
      const tag = Array.findFirst(t.propertySignatures, (_) => {
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
        [String(ast.literal)]: (x: { _tag: string }) => x._tag === ast.literal
      }
    }, {} as Is<A>)
  }
  throw new Error("Unsupported")
}

export const makeIsAnyOf = <A extends { _tag: string }, I, R>(
  schema: S.Schema<A, I, R>
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

export const taggedUnionMap = <
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Members extends readonly (S.Schema<{ _tag: string }, any, any> & { fields: { _tag: S.tag<string> } })[]
>(
  self: Members
) =>
  self.reduce((acc, key) => {
    // TODO: check upstream what's going on with literals of _tag
    const ast = key.fields._tag.ast as S.PropertySignatureDeclaration
    const tag = (ast.type as SchemaAST.Literal).literal as string // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
    ;(acc as any)[tag] = key as any
    return acc
  }, {} as { [Key in Members[number] as ReturnType<Key["fields"]["_tag"][S.TypeId]["_A"]>]: Key })

export const tags = <
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Members extends NonEmptyReadonlyArray<(S.Schema<{ _tag: string }, any, any> & { fields: { _tag: S.tag<string> } })>
>(
  self: Members
) =>
  S.Literal(...self.map((key) => {
    const ast = key.fields._tag.ast as S.PropertySignatureDeclaration
    const tag = (ast.type as SchemaAST.Literal).literal
    return tag
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  })) as any as S.Literal<
    {
      [Index in keyof Members]: S.Schema.Type<Members[Index]["fields"]["_tag"]>
    }
  >
export const ExtendTaggedUnion = <A extends { _tag: string }, I, R>(
  schema: S.Schema<A, I, R>
) =>
  extendM(schema, (_) => ({ is: S.is(schema), isA: makeIs(_), isAnyOf: makeIsAnyOf(_) /*, map: taggedUnionMap(a) */ }))

export const TaggedUnion = <
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Members extends SchemaAST.Members<S.Schema.Any & { fields: { _tag: S.tag<any> } }>
>(...a: Members) =>
  pipe(
    S.Union(...a),
    (_) =>
      extendM(_, (_) => ({
        is: S.is(_),
        isA: makeIs(_),
        isAnyOf: makeIsAnyOf(_),
        tagMap: taggedUnionMap(a),
        tags: tags(a)
      }))
  )

export type PhoneNumber = PhoneNumberT

import { Array, Option, pipe, SchemaAST, type Tracer } from "effect"
import * as S from "effect/Schema"
import type { NonEmptyReadonlyArray } from "./Array.js"
import { fakerArb } from "./faker.js"
import { Email as EmailT } from "./Schema/email.js"
import { withDefaultMake } from "./Schema/ext.js"
import { PhoneNumber as PhoneNumberT } from "./Schema/phoneNumber.js"
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

export const Email = EmailT
  .pipe(
    S.annotate({
      // eslint-disable-next-line @typescript-eslint/unbound-method
      arbitrary: (): any => (fc: any) => fakerArb((faker) => faker.internet.exampleEmail)(fc).map(Email)
    }),
    withDefaultMake
  )

export type Email = EmailT

export const PhoneNumber = PhoneNumberT
  .pipe(
    S.annotate({
      arbitrary: (): any => (fc: any) =>
        // eslint-disable-next-line @typescript-eslint/unbound-method
        fakerArb((faker) => faker.phone.number)(fc).map(PhoneNumber)
    }),
    withDefaultMake
  )

export const makeIs = <A extends { _tag: string }>(
  schema: S.Codec<A>
) => {
  // In v4, transformations are stored as encoding on nodes, not as wrapper nodes.
  // Union member ASTs are directly Objects (TypeLiteral equivalent).
  if (SchemaAST.isUnion(schema.ast)) {
    return schema.ast.types.reduce((acc: any, t: AST.AST) => {
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

export const makeIsAnyOf = <A extends { _tag: string }>(
  schema: S.Codec<A>
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
  Members extends readonly (S.Top & { fields: { _tag: S.tag<string> } })[]
>(
  self: Members
) =>
  self.reduce((acc, key) => {
    // TODO: v4 migration — PropertySignatureDeclaration removed, need v4 AST traversal
    const ast = key.fields._tag.ast as any
    const tag = ((ast.type ?? ast) as SchemaAST.Literal).literal as string // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
    ;(acc as any)[tag] = key as any
    return acc
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }, {} as any)

export const tags = <
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Members extends NonEmptyReadonlyArray<(S.Top & { fields: { _tag: S.tag<string> } })>
>(
  self: Members
) =>
  S.Literals(self.map((key) => {
    // TODO: v4 migration — PropertySignatureDeclaration removed, need v4 AST traversal
    const ast = key.fields._tag.ast as any
    const tag = ((ast.type ?? ast) as SchemaAST.Literal).literal
    return tag
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  })) as any

export const ExtendTaggedUnion = <A extends { _tag: string }>(
  schema: S.Codec<A>
) =>
  extendM(
    schema,
    (_) => ({
      is: S.is(schema as any),
      isA: makeIs(_ as any),
      isAnyOf: makeIsAnyOf(_ as any) /*, map: taggedUnionMap(a) */
    })
  )

export const TaggedUnion = <
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  Members extends readonly (S.Top & { fields: { _tag: S.tag<any> } })[]
>(...a: Members) =>
  pipe(
    S.Union(a),
    (_) =>
      extendM(_, (_) => ({
        is: S.is(_ as any),
        isA: makeIs(_ as any),
        isAnyOf: makeIsAnyOf(_ as any),
        tagMap: taggedUnionMap(a),
        tags: tags(a as any)
      }))
  )

export type PhoneNumber = PhoneNumberT

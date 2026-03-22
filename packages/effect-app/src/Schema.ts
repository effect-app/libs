import { SchemaAST, type Tracer } from "effect"
import * as S from "effect/Schema"
import type { NonEmptyReadonlyArray } from "./Array.js"
import { fakerArb } from "./faker.js"
import { Email as EmailT, type Email as EmailType } from "./Schema/email.js"
import { withDefaultMake } from "./Schema/ext.js"
import { PhoneNumber as PhoneNumberT, type PhoneNumber as PhoneNumberType } from "./Schema/phoneNumber.js"
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

const getTagFromAST = (schema: S.Top): string => {
  let ast = schema.ast
  if (SchemaAST.isSuspend(ast)) ast = ast.thunk()
  if (SchemaAST.isObjects(ast)) {
    for (const ps of ast.propertySignatures) {
      if (ps.name === "_tag" && !SchemaAST.isOptional(ps.type) && SchemaAST.isLiteral(ps.type)) {
        return ps.type.literal as string
      }
    }
  }
  throw new Error("No _tag literal found on schema member")
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

type TaggedUnionWithTags<Members extends TaggedUnionMembers> = S.toTaggedUnion<"_tag", Members> & {
  readonly tags: TaggedUnionTags<Members>
}

const extendTaggedUnionWithTags = <Members extends TaggedUnionMembers>(
  schema: S.Union<Members>
): TaggedUnionWithTags<Members> => extendM(schema.pipe(S.toTaggedUnion("_tag")), () => ({ tags: tags(schema.members) }))

export const ExtendTaggedUnion = <Members extends TaggedUnionMembers>(
  schema: S.Union<Members>
): TaggedUnionWithTags<Members> => extendTaggedUnionWithTags(schema)

export const TaggedUnion = <
  Members extends TaggedUnionMembers
>(...a: Members): TaggedUnionWithTags<Members> => extendTaggedUnionWithTags(S.Union(a))

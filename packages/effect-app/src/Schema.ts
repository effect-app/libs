import { SchemaAST, type Tracer } from "effect"
import * as S from "effect/Schema"
import type { NonEmptyReadonlyArray } from "./Array.js"
import { fakerArb } from "./faker.js"
import { Email as EmailT, type Email as EmailType } from "./Schema/email.js"
import { withDefaultMake } from "./Schema/ext.js"
import { PhoneNumber as PhoneNumberT, type PhoneNumber as PhoneNumberType } from "./Schema/phoneNumber.js"
import { extendM } from "./utils.js"

export * from "effect/Schema"

export * from "./Schema/Class.js"
export { Class, TaggedClass } from "./Schema/Class.js"

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
      for (const [tag, guard] of Object.entries(tagged.guards) as Array<[string, (u: unknown) => boolean]>) {
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
>(...a: Members): TaggedUnionWithTags<Members> => extendTaggedUnionWithTags(S.Union(a))

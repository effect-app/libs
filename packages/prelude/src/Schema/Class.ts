/* eslint-disable @typescript-eslint/no-explicit-any */
import { type Effect, type ParseResult, pipe, Struct as Struct2, type Types } from "effect"
import type { Schema, Struct } from "effect/Schema"
import * as S from "effect/Schema"
import type { ParseOptions } from "effect/SchemaAST"
import type { Simplify } from "effect/Types"
import type { AST } from "./schema.js"

type _OptionalKeys<O> = {
  [K in keyof O]-?: {} extends Pick<O, K> ? K
    : never
}[keyof O]

type FilterOptionalKeys<A> = Omit<A, _OptionalKeys<A>>

export interface EnhancedClass<Self, Fields extends Struct.Fields, I, R, C, Inherited, Proto>
  extends Schema<Self, I, R>, PropsExtensions<Fields>
{
  new(
    props: Types.Equals<C, {}> extends true ? void | {}
      : Types.Equals<FilterOptionalKeys<C>, {}> extends true ? void | C
      : C,
    disableValidation?: boolean
  ): Struct.Type<Fields> & Omit<Inherited, keyof Fields> & Proto

  readonly fields: Simplify<Fields>

  readonly extend: <Extended = never>(identifier?: string) => <newFields extends Struct.Fields>(
    newFieldsOr: newFields | HasFields<newFields>,
    annotations?: S.Annotations.Schema<Extended>
  ) => [Extended] extends [never] ? MissingSelfGeneric<"Base.extend">
    : EnhancedClass<
      Extended,
      Fields & newFields,
      Simplify<I & Struct.Encoded<newFields>>,
      R | Struct.Context<newFields>,
      Simplify<C & S.Struct.Constructor<newFields>>,
      Self,
      Proto
    >

  readonly transformOrFail: <Transformed = never>(identifier?: string) => <
    newFields extends Struct.Fields,
    R2,
    R3
  >(
    fields: newFields,
    options: {
      readonly decode: (
        input: Types.Simplify<Struct.Type<Fields>>,
        options: ParseOptions,
        ast: AST.Transformation
      ) => Effect.Effect<Types.Simplify<Struct.Type<Fields & newFields>>, ParseResult.ParseIssue, R2>
      readonly encode: (
        input: Types.Simplify<Struct.Type<Fields & newFields>>,
        options: ParseOptions,
        ast: AST.Transformation
      ) => Effect.Effect<Struct.Type<Fields>, ParseResult.ParseIssue, R3>
    },
    annotations?: S.Annotations.Schema<Transformed>
  ) => [Transformed] extends [never] ? MissingSelfGeneric<"Base.transform">
    : EnhancedClass<
      Transformed,
      Fields & newFields,
      I,
      R | Struct.Context<newFields> | R2 | R3,
      C & Struct.Constructor<newFields>,
      Self,
      Proto
    >

  readonly transformOrFailFrom: <Transformed = never>(identifier?: string) => <
    newFields extends Struct.Fields,
    R2,
    R3
  >(
    fields: newFields,
    options: {
      readonly decode: (
        input: Types.Simplify<I>,
        options: ParseOptions,
        ast: AST.Transformation
      ) => Effect.Effect<Types.Simplify<I & Struct.Encoded<newFields>>, ParseResult.ParseIssue, R2>
      readonly encode: (
        input: Types.Simplify<I & Struct.Encoded<newFields>>,
        options: ParseOptions,
        ast: AST.Transformation
      ) => Effect.Effect<I, ParseResult.ParseIssue, R3>
    },
    annotations?: S.Annotations.Schema<Transformed>
  ) => [Transformed] extends [never] ? MissingSelfGeneric<"Base.transformFrom">
    : EnhancedClass<
      Transformed,
      Fields & newFields,
      I,
      R | Struct.Context<newFields> | R2 | R3,
      Simplify<C & S.Struct.Constructor<newFields>>,
      Self,
      Proto
    >
}
type MissingSelfGeneric<Usage extends string, Params extends string = ""> =
  `Missing \`Self\` generic - use \`class Self extends ${Usage}<Self>()(${Params}{ ... })\``

export interface PropsExtensions<Fields> {
  // include: <NewProps extends S.Struct.Fields>(
  //   fnc: (fields: Fields) => NewProps
  // ) => NewProps
  pick: <P extends keyof Fields>(...keys: readonly P[]) => Pick<Fields, P>
  omit: <P extends keyof Fields>(...keys: readonly P[]) => Omit<Fields, P>
}

type HasFields<Fields extends Struct.Fields> = {
  readonly fields: Fields
} | {
  readonly from: HasFields<Fields>
}

// const isPropertySignature = (u: unknown): u is PropertySignature.All =>
//   Predicate.hasProperty(u, PropertySignatureTypeId)

// const isField = (u: unknown) => S.isSchema(u) || S.isPropertySignature(u)

// const isFields = <Fields extends Struct.Fields>(fields: object): fields is Fields =>
//   ownKeys(fields).every((key) => isField((fields as any)[key]))

// const getFields = <Fields extends Struct.Fields>(hasFields: HasFields<Fields>): Fields =>
//   "fields" in hasFields ? hasFields.fields : getFields(hasFields.from)

// const getSchemaFromFieldsOr = <Fields extends Struct.Fields>(fieldsOr: Fields | HasFields<Fields>): Schema.Any =>
//   isFields(fieldsOr) ? Struct(fieldsOr) : S.isSchema(fieldsOr) ? fieldsOr : Struct(getFields(fieldsOr))

// const getFieldsFromFieldsOr = <Fields extends Struct.Fields>(fieldsOr: Fields | HasFields<Fields>): Fields =>
//   isFields(fieldsOr) ? fieldsOr : getFields(fieldsOr)

// export function include<Fields extends S.Struct.Fields>(fields: Fields | HasFields<Fields>) {
//   return <NewProps extends S.Struct.Fields>(
//     fnc: (fields: Fields) => NewProps
//   ) => include_(fields, fnc)
// }

// export function include_<
//   Fields extends S.Struct.Fields,
//   NewProps extends S.Struct.Fields
// >(fields: Fields | HasFields<Fields>, fnc: (fields: Fields) => NewProps) {
//   return fnc("fields" in fields ? fields.fields : fields)
// }

export const Class: <Self = never>(identifier?: string) => <Fields extends S.Struct.Fields>(
  fieldsOr: Fields | HasFields<Fields>,
  annotations?: S.Annotations.Schema<Self>
) => [Self] extends [never] ? MissingSelfGeneric<"Class">
  : EnhancedClass<
    Self,
    Fields,
    Simplify<Struct.Encoded<Fields>>,
    Schema.Context<Fields[keyof Fields]>,
    Simplify<S.Struct.Constructor<Fields>>,
    {},
    {}
  > = (identifier) => (fields, annotations) => {
    const cls = S.Class as any
    return class extends cls(identifier)(fields, annotations) {
      constructor(a, b = true) {
        super(a, b)
      }
      // static readonly include = include(fields)
      static readonly pick = (...selection: any[]) => pipe(fields, Struct2.pick(...selection))
      static readonly omit = (...selection: any[]) => pipe(fields, Struct2.omit(...selection))
    } as any
  }

export const TaggedClass: <Self = never>(identifier?: string) => <Tag extends string, Fields extends S.Struct.Fields>(
  tag: Tag,
  fieldsOr: Fields | HasFields<Fields>,
  annotations?: S.Annotations.Schema<Self>
) => [Self] extends [never] ? MissingSelfGeneric<"Class">
  : EnhancedClass<
    Self,
    { readonly _tag: S.tag<Tag> } & Fields,
    Simplify<{ readonly _tag: Tag } & Struct.Encoded<Fields>>,
    Schema.Context<Fields[keyof Fields]>,
    Simplify<S.Struct.Constructor<Fields>>,
    {},
    {}
  > = (identifier) => (tag, fields, annotations) => {
    const cls = S.TaggedClass as any
    return class extends cls(identifier)(tag, fields, annotations) {
      constructor(a, b = true) {
        super(a, b)
      }
      // static readonly include = include(fields)
      static readonly pick = (...selection: any[]) => pipe(fields, Struct2.pick(...selection))
      static readonly omit = (...selection: any[]) => pipe(fields, Struct2.omit(...selection))
    } as any
  }

export const ExtendedClass: <Self, SelfFrom>(identifier?: string) => <Fields extends S.Struct.Fields>(
  fieldsOr: Fields | HasFields<Fields>,
  annotations?: S.Annotations.Schema<Self>
) => EnhancedClass<
  Self,
  Fields,
  SelfFrom,
  Schema.Context<Fields[keyof Fields]>,
  Simplify<S.Struct.Constructor<Fields>>,
  {},
  {}
> = Class as any

export const ExtendedTaggedClass: <Self, SelfFrom>(
  identifier?: string
) => <Tag extends string, Fields extends S.Struct.Fields>(
  tag: Tag,
  fieldsOr: Fields | HasFields<Fields>,
  annotations?: S.Annotations.Schema<Self>
) => EnhancedClass<
  Self,
  { readonly _tag: S.tag<Tag> } & Fields,
  SelfFrom,
  Schema.Context<Fields[keyof Fields]>,
  Simplify<S.Struct.Constructor<Fields>>,
  {},
  {}
> = TaggedClass as any

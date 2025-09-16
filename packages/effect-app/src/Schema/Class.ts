/* eslint-disable @typescript-eslint/no-explicit-any */
import { pipe, Struct as Struct2 } from "effect"
import type { Schema, Struct } from "effect/Schema"
import * as S from "effect/Schema"
import type { Simplify } from "effect/Types"

type ClassAnnotations<Self, A> =
  | S.Annotations.Schema<Self>
  | readonly [
    // Annotations for the "to" schema
    S.Annotations.Schema<Self> | undefined,
    // Annotations for the "transformation schema
    (S.Annotations.Schema<Self> | undefined)?,
    // Annotations for the "from" schema
    S.Annotations.Schema<A>?
  ]

export interface EnhancedClass<Self, Fields extends Struct.Fields, I, R, C, Inherited, Proto>
  extends S.Class<Self, Fields, I, R, C, Inherited, Proto>, /* Reason for enhancement */ PropsExtensions<Fields>
{
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

export const Class: <Self = never>(identifier: string) => <Fields extends S.Struct.Fields>(
  fieldsOr: Fields | HasFields<Fields>,
  annotations?: ClassAnnotations<Self, Struct.Type<Fields>>
) => [Self] extends [never] ? MissingSelfGeneric<"Class">
  : EnhancedClass<
    Self,
    Fields,
    Simplify<Struct.Encoded<Fields>>,
    Struct.Context<Fields>,
    Simplify<S.Struct.Constructor<Fields>>,
    {},
    {}
  > = (identifier) => (fields, annotations) => {
    const cls = S.Class as any
    return class extends cls(identifier)(fields, annotations) {
      constructor(a: any, b = true) {
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
  annotations?: ClassAnnotations<Self, Struct.Type<Fields>>
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
      constructor(a: any, b = true) {
        super(a, b)
      }
      // static readonly include = include(fields)
      static readonly pick = (...selection: any[]) => pipe(fields, Struct2.pick(...selection))
      static readonly omit = (...selection: any[]) => pipe(fields, Struct2.omit(...selection))
    } as any
  }

export const ExtendedClass: <Self, SelfFrom>(identifier: string) => <Fields extends S.Struct.Fields>(
  fieldsOr: Fields | HasFields<Fields>,
  annotations?: ClassAnnotations<Self, Struct.Type<Fields>>
) => EnhancedClass<
  Self,
  Fields,
  SelfFrom,
  Schema.Context<Fields[keyof Fields]>,
  Simplify<S.Struct.Constructor<Fields>>,
  {},
  {}
> = Class as any

export interface EnhancedTaggedClass<Self, Tag extends string, Fields extends Struct.Fields, SelfFrom>
  extends
    EnhancedClass<
      Self,
      Fields,
      SelfFrom,
      Struct.Context<Fields>,
      Struct.Constructor<Omit<Fields, "_tag">>,
      {},
      {}
    >
{
  readonly _tag: Tag
}

export const ExtendedTaggedClass: <Self, SelfFrom>(
  identifier?: string
) => <Tag extends string, Fields extends S.Struct.Fields>(
  tag: Tag,
  fieldsOr: Fields | HasFields<Fields>,
  annotations?: ClassAnnotations<Self, Struct.Type<Fields>>
) => EnhancedTaggedClass<
  Self,
  Tag,
  { readonly _tag: S.tag<Tag> } & Fields,
  SelfFrom
> = TaggedClass as any

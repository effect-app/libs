/* eslint-disable @typescript-eslint/no-explicit-any */
import { pipe, Struct as Struct2 } from "effect"
import type { Struct } from "effect/Schema"
import * as S from "effect/Schema"

type ClassAnnotations<Self> = S.Annotations.Declaration<Self, readonly [any]>

export interface EnhancedClass<Self, SchemaS extends S.Top & { readonly fields: Struct.Fields }, Inherited>
  extends S.Class<Self, SchemaS, Inherited>, /* Reason for enhancement */ PropsExtensions<SchemaS["fields"]>
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

export type Class<Self, S extends S.Top & { readonly fields: Struct.Fields }, Inherited> = S.Class<Self, S, Inherited>

export const Class: <Self = never>(identifier: string) => <Fields extends S.Struct.Fields>(
  fieldsOr: Fields | HasFields<Fields>,
  annotations?: ClassAnnotations<Self>
) => [Self] extends [never] ? MissingSelfGeneric<"Class">
  : EnhancedClass<
    Self,
    S.Struct<Fields>,
    {}
  > = (identifier) => (fields, annotations) => {
    const cls = S.Class as any
    return class extends cls(identifier)(fields, annotations) {
      // static readonly include = include(fields)
      static readonly pick = (...selection: any[]) => pipe(this["fields"], Struct2.pick(selection))
      static readonly omit = (...selection: any[]) => pipe(this["fields"], Struct2.omit(selection))
    } as any
  }

export const TaggedClass: <Self = never>(identifier?: string) => <Tag extends string, Fields extends S.Struct.Fields>(
  tag: Tag,
  fieldsOr: Fields | HasFields<Fields>,
  annotations?: ClassAnnotations<Self>
) => [Self] extends [never] ? MissingSelfGeneric<"Class">
  : EnhancedClass<
    Self,
    S.Struct<{ readonly _tag: S.tag<Tag> } & Fields>,
    {}
  > = (identifier) => (tag, fields, annotations) => {
    const cls = S.TaggedClass as any
    return class extends cls(identifier)(tag, fields, annotations) {
      // static readonly include = include(fields)
      static readonly pick = (...selection: any[]) => pipe(this["fields"], Struct2.pick(selection))
      static readonly omit = (...selection: any[]) => pipe(this["fields"], Struct2.omit(selection))
    } as any
  }

export const ExtendedClass: <Self, _SelfFrom>(identifier: string) => <Fields extends S.Struct.Fields>(
  fieldsOr: Fields | HasFields<Fields>,
  annotations?: ClassAnnotations<Self>
) => EnhancedClass<
  Self,
  S.Struct<Fields>,
  {}
> = Class as any

export interface EnhancedTaggedClass<Self, Tag extends string, Fields extends Struct.Fields, SelfFrom>
  extends
    EnhancedClass<
      Self,
      S.Struct<Fields> & { readonly Encoded: SelfFrom },
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
  annotations?: ClassAnnotations<Self>
) => EnhancedTaggedClass<
  Self,
  Tag,
  { readonly _tag: S.tag<Tag> } & Fields,
  SelfFrom
> = TaggedClass as any

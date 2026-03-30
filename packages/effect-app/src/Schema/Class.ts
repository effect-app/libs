/* eslint-disable @typescript-eslint/no-explicit-any */
import { Effect, Option, pipe, Schema, SchemaAST, SchemaIssue, Struct as Struct2 } from "effect"
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
  pick: <P extends keyof Fields>(...keys: readonly P[]) => Pick<Fields, P>
  omit: <P extends keyof Fields>(...keys: readonly P[]) => Omit<Fields, P>
}

type HasFields<Fields extends Struct.Fields> = {
  readonly fields: Fields
} | {
  readonly from: HasFields<Fields>
}

export type Class<Self, S extends S.Top & { readonly fields: Struct.Fields }, Inherited> = S.Class<Self, S, Inherited>

/**
 * Build a modified Declaration that accepts struct-matching values during
 * encoding, given the original Declaration and the class's fields.
 */
function makeRelaxedDeclaration(
  ast: SchemaAST.Declaration,
  fields: Schema.Struct.Fields,
  cls: any
): SchemaAST.Declaration {
  const structSchema = Schema.Struct(fields)
  const isStructValue = Schema.is(structSchema)
  return new SchemaAST.Declaration(
    ast.typeParameters,
    () => (input: unknown, self: SchemaAST.Declaration) => {
      if (input instanceof cls || isStructValue(input)) {
        return Effect.succeed(input)
      }
      return Effect.fail(new SchemaIssue.InvalidType(self, Option.some(input)))
    },
    ast.annotations,
    ast.checks,
    ast.encoding,
    ast.context
  )
}

// ---------------------------------------------------------------------------
// Class — like Schema.Class but with relaxed encoding
// ---------------------------------------------------------------------------

/**
 * Like `Schema.Class`, but the resulting class accepts plain objects matching
 * the struct schema during encoding — not only `instanceof` or type-id
 * checks.
 *
 * @example
 * ```ts
 * import { Schema } from "effect"
 * import { Class } from "./Class.js"
 *
 * class A extends Class<A>("A")({ a: Schema.String }) {}
 *
 * // Construction works as normal:
 * new A({ a: "hello" })
 *
 * // Encoding accepts plain objects:
 * Schema.encodeUnknownSync(A)({ a: "hello" }) // { a: "hello" }
 * ```
 */
export const Class: <Self = never>(identifier: string) => <Fields extends S.Struct.Fields>(
  fieldsOr: Fields | HasFields<Fields>,
  annotations?: ClassAnnotations<Self>
) => [Self] extends [never] ? MissingSelfGeneric<"Class">
  : EnhancedClass<
    Self,
    S.Struct<Fields>,
    {}
  > = (identifier) => (fields, annotations) => {
    // Build the original Schema.Class
    const Base = (S.Class as any)(identifier)(fields, annotations)
    // Get the original ast getter from the base class
    const originalAstDescriptor = Object.getOwnPropertyDescriptor(Base, "ast")!

    // Cache per-class to avoid recomputing
    const astCache = new WeakMap<any, SchemaAST.Declaration>()

    return class extends Base {
      static get ast(): SchemaAST.Declaration {
        let cached = astCache.get(this)
        if (cached !== undefined) return cached
        // Call the original getter with `this` bound to the actual user class,
        // so getClassSchema(this) creates a schema that uses `new this(...)`.
        const originalAst = originalAstDescriptor.get!.call(this) as SchemaAST.Declaration
        cached = makeRelaxedDeclaration(originalAst, Base.fields, this)
        astCache.set(this, cached)
        return cached
      }
      static readonly pick = (...selection: any[]) => pipe(this["fields"], Struct2.pick(selection))
      static readonly omit = (...selection: any[]) => pipe(this["fields"], Struct2.omit(selection))
    } as any
  }

// ---------------------------------------------------------------------------
// TaggedClass — like Schema.TaggedClass but with relaxed encoding
// ---------------------------------------------------------------------------

/**
 * Like `Schema.TaggedClass`, but the resulting class accepts plain objects
 * matching the struct schema during encoding.
 *
 * @example
 * ```ts
 * import { Schema } from "effect"
 * import { TaggedClass } from "./Class.js"
 *
 * class Circle extends TaggedClass<Circle>()("Circle", {
 *   radius: Schema.Number
 * }) {}
 *
 * Schema.encodeUnknownSync(Circle)({ _tag: "Circle", radius: 5 })
 * ```
 */
export const TaggedClass: <Self = never>(
  identifier?: string
) => <Tag extends string, Fields extends S.Struct.Fields>(
  tag: Tag,
  fieldsOr: Fields | HasFields<Fields>,
  annotations?: ClassAnnotations<Self>
) => [Self] extends [never] ? MissingSelfGeneric<"TaggedClass">
  : EnhancedClass<
    Self,
    S.Struct<{ readonly _tag: S.tag<Tag> } & Fields>,
    {}
  > = (identifier) => (tag, fields, annotations) => {
    const Base = (S.TaggedClass as any)(identifier)(tag, fields, annotations)
    const originalAstDescriptor = Object.getOwnPropertyDescriptor(Base, "ast")!
    const astCache = new WeakMap<any, SchemaAST.Declaration>()

    return class extends Base {
      static get ast(): SchemaAST.Declaration {
        let cached = astCache.get(this)
        if (cached !== undefined) return cached
        const originalAst = originalAstDescriptor.get!.call(this) as SchemaAST.Declaration
        cached = makeRelaxedDeclaration(originalAst, Base.fields, this)
        astCache.set(this, cached)
        return cached
      }
      static readonly pick = (...selection: any[]) => pipe(this["fields"], Struct2.pick(selection))
      static readonly omit = (...selection: any[]) => pipe(this["fields"], Struct2.omit(selection))
    } as any
  }

// ---------------------------------------------------------------------------
// ExtendedClass — like Class but with extra type parameter for hierarchies
// ---------------------------------------------------------------------------

export const ExtendedClass: <Self, _SelfFrom>(identifier: string) => <Fields extends S.Struct.Fields>(
  fieldsOr: Fields | HasFields<Fields>,
  annotations?: ClassAnnotations<Self>
) => EnhancedClass<
  Self,
  S.Struct<Fields>,
  {}
> = Class as any

// ---------------------------------------------------------------------------
// ExtendedTaggedClass — like TaggedClass but with extra type parameter for hierarchies
// ---------------------------------------------------------------------------

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

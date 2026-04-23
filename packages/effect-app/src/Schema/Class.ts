/* eslint-disable @typescript-eslint/no-explicit-any */
import { Effect, Option, Schema, SchemaAST, SchemaIssue } from "effect"
import * as S from "effect/Schema"
import * as SchemaParser from "effect/SchemaParser"
import { copyOrigin } from "../utils.js"
import { concurrencyUnbounded } from "./ext.js"

type ClassAnnotations<Self> = S.Annotations.Declaration<Self, readonly [any]>

export interface EnhancedClass<Self, SchemaS extends S.Top & { readonly fields: S.Struct.Fields }, Inherited>
  extends S.Class<Self, SchemaS, Inherited>
{
  /**
   * See `copyOrigin` docs in `utils.ts` for return-type design details.
   */
  readonly copy: ReturnType<typeof copyOrigin<new(_: any) => Self>>
}
type MissingSelfGeneric<Usage extends string, Params extends string = ""> =
  `Missing \`Self\` generic - use \`class Self extends ${Usage}<Self>()(${Params}{ ... })\``

type HasFields<Fields extends S.Struct.Fields> = {
  readonly fields: Fields
} | {
  readonly from: HasFields<Fields>
}

type ClassOptions = {
  readonly strict?: boolean
}

export type Class<Self, S extends S.Top & { readonly fields: S.Struct.Fields }, Inherited> = EnhancedClass<
  Self,
  S,
  Inherited
>

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
  const decodeStruct = SchemaParser.decodeUnknownEffect(structSchema)
  const existingParseOptions = ast.annotations?.["parseOptions"] as SchemaAST.ParseOptions | undefined
  const annotations = {
    ...ast.annotations,
    parseOptions: { ...existingParseOptions, concurrency: "unbounded" as const }
  }
  return new SchemaAST.Declaration(
    ast.typeParameters,
    () => (input: unknown, self: SchemaAST.Declaration, options: SchemaAST.ParseOptions) => {
      if (input instanceof cls) {
        return Effect.succeed(input)
      }
      if (input !== null && typeof input === "object") {
        return decodeStruct(input, options)
      }
      return Effect.fail(new SchemaIssue.InvalidType(self, Option.some(input)))
    },
    annotations,
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
  annotations?: ClassAnnotations<Self>,
  options?: ClassOptions
) => [Self] extends [never] ? MissingSelfGeneric<"Class">
  : EnhancedClass<
    Self,
    S.Struct<Fields>,
    {}
  > = (identifier) => (fields, annotations, options) => {
    const relaxed = !(options?.strict ?? false)
    // Build the original Schema.Class
    const Base = (S.Class as any)(identifier)(fields, annotations)
    // Get the original ast getter from the base class
    const originalAstDescriptor = Object.getOwnPropertyDescriptor(Base, "ast")!

    // Cache per-class to avoid recomputing
    const astCache = new WeakMap<any, SchemaAST.Declaration>()
    const copyCache = new WeakMap<any, ReturnType<typeof copyOrigin>>()

    return class extends Base {
      static get copy() {
        let cached = copyCache.get(this)
        if (cached === undefined) {
          cached = copyOrigin(this)
          copyCache.set(this, cached)
        }
        return cached
      }
      static get ast(): SchemaAST.Declaration {
        let cached = astCache.get(this)
        if (cached !== undefined) return cached
        // Call the original getter with `this` bound to the actual user class,
        // so getClassSchema(this) creates a schema that uses `new this(...)`.
        const originalAst = originalAstDescriptor.get!.call(this) as SchemaAST.Declaration
        cached = relaxed ? makeRelaxedDeclaration(originalAst, Base.fields, this) : originalAst
        astCache.set(this, cached)
        return cached
      }
      static mapFields(f: any, options?: any) {
        return Base.mapFields(f, options).annotate(concurrencyUnbounded)
      }
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
  annotations?: ClassAnnotations<Self>,
  options?: ClassOptions
) => [Self] extends [never] ? MissingSelfGeneric<"TaggedClass">
  : EnhancedClass<
    Self,
    S.Struct<{ readonly _tag: S.tag<Tag> } & Fields>,
    {}
  > = (identifier) => (tag, fields, annotations, options) => {
    const relaxed = !(options?.strict ?? false)
    const Base = (S.TaggedClass as any)(identifier)(tag, fields, annotations)
    const originalAstDescriptor = Object.getOwnPropertyDescriptor(Base, "ast")!
    const astCache = new WeakMap<any, SchemaAST.Declaration>()
    const copyCache = new WeakMap<any, ReturnType<typeof copyOrigin>>()

    return class extends Base {
      static get copy() {
        let cached = copyCache.get(this)
        if (cached === undefined) {
          cached = copyOrigin(this)
          copyCache.set(this, cached)
        }
        return cached
      }
      static get ast(): SchemaAST.Declaration {
        let cached = astCache.get(this)
        if (cached !== undefined) return cached
        const originalAst = originalAstDescriptor.get!.call(this) as SchemaAST.Declaration
        cached = relaxed ? makeRelaxedDeclaration(originalAst, Base.fields, this) : originalAst
        astCache.set(this, cached)
        return cached
      }
      static mapFields(f: any, options?: any) {
        return Base.mapFields(f, options).annotate(concurrencyUnbounded)
      }
    } as any
  }

// ---------------------------------------------------------------------------
// ExtendedClass — like Class but with extra type parameter for hierarchies
// ---------------------------------------------------------------------------

export const ExtendedClass: <Self, _SelfFrom>(identifier: string) => <Fields extends S.Struct.Fields>(
  fieldsOr: Fields | HasFields<Fields>,
  annotations?: ClassAnnotations<Self>,
  options?: ClassOptions
) => EnhancedClass<
  Self,
  S.Struct<Fields>,
  {}
> = Class as any

// ---------------------------------------------------------------------------
// ExtendedTaggedClass — like TaggedClass but with extra type parameter for hierarchies
// ---------------------------------------------------------------------------

export interface EnhancedTaggedClass<Self, Tag extends string, Fields extends S.Struct.Fields, SelfFrom>
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
  annotations?: ClassAnnotations<Self>,
  options?: ClassOptions
) => EnhancedTaggedClass<
  Self,
  Tag,
  { readonly _tag: S.tag<Tag> } & Fields,
  SelfFrom
> = TaggedClass as any

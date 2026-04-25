/* eslint-disable @typescript-eslint/no-explicit-any */
import { type Cause, Effect, Option, Schema, SchemaAST, SchemaIssue } from "effect"
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

declare const ExtendedSchemaNoEncoded: unique symbol

type ExtendedSchemaNoEncoded = typeof ExtendedSchemaNoEncoded

type WithEncoded<SchemaS extends S.Top, Encoded> = Omit<SchemaS, "Encoded"> & { readonly Encoded: Encoded }

type ExtendedSchema<SchemaS extends S.Top, Encoded> = [Encoded] extends [ExtendedSchemaNoEncoded] ? SchemaS
  : WithEncoded<SchemaS, Encoded>

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
  const decodeStruct = SchemaParser.decodeUnknownEffect(S.toType(structSchema))
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
export const Class: <Self = never, Encoded = ExtendedSchemaNoEncoded>(
  identifier: string
) => <Fields extends S.Struct.Fields>(
  fieldsOr: Fields | HasFields<Fields>,
  annotations?: ClassAnnotations<Self>,
  options?: ClassOptions
) => [Self] extends [never] ? MissingSelfGeneric<"Class">
  : EnhancedClass<
    Self,
    ExtendedSchema<S.Struct<Fields>, Encoded>,
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
export const TaggedClass: <Self = never, Encoded = ExtendedSchemaNoEncoded>(
  identifier?: string
) => <Tag extends string, Fields extends S.Struct.Fields>(
  tag: Tag,
  fieldsOr: Fields | HasFields<Fields>,
  annotations?: ClassAnnotations<Self>,
  options?: ClassOptions
) => [Self] extends [never] ? MissingSelfGeneric<"TaggedClass">
  : EnhancedClass<
    Self,
    ExtendedSchema<S.Struct<{ readonly _tag: S.tag<Tag> } & Fields>, Encoded>,
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
// ErrorClass — like Schema.ErrorClass but with relaxed encoding
// ---------------------------------------------------------------------------

export const ErrorClass: <Self = never, Encoded = ExtendedSchemaNoEncoded, Brand = {}>(
  identifier: string
) => <Fields extends S.Struct.Fields>(
  fieldsOr: Fields | HasFields<Fields>,
  annotations?: ClassAnnotations<Self>,
  options?: ClassOptions
) => [Self] extends [never] ? MissingSelfGeneric<"ErrorClass">
  : EnhancedClass<
    Self,
    ExtendedSchema<S.Struct<Fields>, Encoded>,
    Cause.YieldableError & Brand
  > = (identifier) => (fields, annotations, options) => {
    const relaxed = !(options?.strict ?? false)
    const Base = (S.ErrorClass as any)(identifier)(fields, annotations)
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
// TaggedErrorClass — like Schema.TaggedErrorClass but with relaxed encoding
// ---------------------------------------------------------------------------

export const TaggedErrorClass: <Self = never, Encoded = ExtendedSchemaNoEncoded, Brand = {}>(
  identifier?: string
) => <Tag extends string, Fields extends S.Struct.Fields>(
  tag: Tag,
  fieldsOr: Fields | HasFields<Fields>,
  annotations?: ClassAnnotations<Self>,
  options?: ClassOptions
) => [Self] extends [never] ? MissingSelfGeneric<"TaggedErrorClass">
  : EnhancedClass<
    Self,
    ExtendedSchema<S.Struct<{ readonly _tag: S.tag<Tag> } & Fields>, Encoded>,
    Cause.YieldableError & Brand
  > = (identifier) => (tag, fields, annotations, options) => {
    const relaxed = !(options?.strict ?? false)
    const Base = (S.TaggedErrorClass as any)(identifier)(tag, fields, annotations)
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

const ExtendedOpaque: <Self, Encoded = ExtendedSchemaNoEncoded, Brand = {}>() => <SchemaS extends S.Top>(
  schema: SchemaS
) => S.Opaque<Self, ExtendedSchema<SchemaS, Encoded>, Brand> & Omit<SchemaS, keyof S.Top> = S.Opaque as any

export const Opaque = ExtendedOpaque

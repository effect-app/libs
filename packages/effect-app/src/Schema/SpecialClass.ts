/**
 * SpecialClass — Schema.Class variants where encoding accepts any value
 * matching the underlying struct schema, not just class instances or objects
 * carrying the class type-id.
 *
 * `SpecialClass` and `SpecialTaggedClass` mirror the API of `Schema.Class`
 * and `Schema.TaggedClass` respectively, but the resulting classes use a
 * relaxed encoding check.
 *
 * `specialClass` is a lower-level utility that transforms an existing
 * Schema.Class into one with relaxed encoding.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { Effect, Option, pipe, Pipeable, Schema, SchemaAST, SchemaIssue, SchemaParser, Struct as Struct2 } from "effect"
import type { Struct } from "effect/Schema"
import * as S from "effect/Schema"
import type { EnhancedClass, EnhancedTaggedClass } from "./Class.js"

type ClassAnnotations<Self> = S.Annotations.Declaration<Self, readonly [any]>

type MissingSelfGeneric<Usage extends string, Params extends string = ""> =
  `Missing \`Self\` generic - use \`class Self extends ${Usage}<Self>()(${Params}{ ... })\``

type HasFields<Fields extends Struct.Fields> = {
  readonly fields: Fields
} | {
  readonly from: HasFields<Fields>
}

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
// SpecialClass — like Class but with relaxed encoding
// ---------------------------------------------------------------------------

/**
 * Like `Schema.Class`, but the resulting class accepts plain objects matching
 * the struct schema during encoding — not only `instanceof` or type-id
 * checks.
 *
 * @example
 * ```ts
 * import { Schema } from "effect"
 * import { SpecialClass } from "./SpecialClass.js"
 *
 * class A extends SpecialClass<A>("A")({ a: Schema.String }) {}
 *
 * // Construction works as normal:
 * new A({ a: "hello" })
 *
 * // Encoding accepts plain objects:
 * Schema.encodeUnknownSync(A)({ a: "hello" }) // { a: "hello" }
 * ```
 */
export const SpecialClass: <Self = never>(identifier: string) => <Fields extends S.Struct.Fields>(
  fieldsOr: Fields | HasFields<Fields>,
  annotations?: ClassAnnotations<Self>
) => [Self] extends [never] ? MissingSelfGeneric<"SpecialClass">
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
// SpecialTaggedClass — like TaggedClass but with relaxed encoding
// ---------------------------------------------------------------------------

/**
 * Like `Schema.TaggedClass`, but the resulting class accepts plain objects
 * matching the struct schema during encoding.
 *
 * @example
 * ```ts
 * import { Schema } from "effect"
 * import { SpecialTaggedClass } from "./SpecialClass.js"
 *
 * class Circle extends SpecialTaggedClass<Circle>()("Circle", {
 *   radius: Schema.Number
 * }) {}
 *
 * Schema.encodeUnknownSync(Circle)({ _tag: "Circle", radius: 5 })
 * ```
 */
export const SpecialTaggedClass: <Self = never>(identifier?: string) => <Tag extends string, Fields extends S.Struct.Fields>(
  tag: Tag,
  fieldsOr: Fields | HasFields<Fields>,
  annotations?: ClassAnnotations<Self>
) => [Self] extends [never] ? MissingSelfGeneric<"SpecialTaggedClass">
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
// SpecialExtendedClass — like ExtendedClass but with relaxed encoding
// ---------------------------------------------------------------------------

/**
 * Like `ExtendedClass`, but the resulting class accepts plain objects
 * matching the struct schema during encoding.
 *
 * This is the same as `SpecialClass` but with an extra `_SelfFrom` type
 * parameter for use in extended class hierarchies.
 */
export const SpecialExtendedClass: <Self, _SelfFrom>(identifier: string) => <Fields extends S.Struct.Fields>(
  fieldsOr: Fields | HasFields<Fields>,
  annotations?: ClassAnnotations<Self>
) => EnhancedClass<
  Self,
  S.Struct<Fields>,
  {}
> = SpecialClass as any

// ---------------------------------------------------------------------------
// SpecialExtendedTaggedClass — like ExtendedTaggedClass but with relaxed encoding
// ---------------------------------------------------------------------------

/**
 * Like `ExtendedTaggedClass`, but the resulting class accepts plain objects
 * matching the struct schema during encoding.
 *
 * This is the same as `SpecialTaggedClass` but with an extra `SelfFrom` type
 * parameter for use in extended tagged class hierarchies.
 */
export const SpecialExtendedTaggedClass: <Self, SelfFrom>(
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
> = SpecialTaggedClass as any

// ---------------------------------------------------------------------------
// specialClass — low-level transform for an existing Schema.Class
// ---------------------------------------------------------------------------

type AnyClass = new(...args: any[]) => any

/**
 * Transforms an existing `Schema.Class` so its Declaration accepts any value
 * matching the underlying struct schema during encoding.
 *
 * Returns a class constructor that is also a schema, just like the original.
 * Supports `new`, `instanceof`, `fields`, `identifier`, etc.
 *
 * Prefer `SpecialClass` / `SpecialTaggedClass` for new classes. Use this
 * when you need to transform a class that already exists.
 *
 * @example
 * ```ts
 * import { Schema } from "effect"
 * import { specialClass } from "./SpecialClass.js"
 *
 * class A extends Schema.Class<A>("A")({ a: Schema.String }) {}
 * const SpecialA = specialClass(A)
 *
 * new SpecialA({ a: "hello" })
 * Schema.encodeUnknownSync(SpecialA)({ a: "hello" })
 * ```
 */
export function specialClass<C extends AnyClass & { readonly ast: SchemaAST.Declaration; readonly fields: Schema.Struct.Fields }>(
  cls: C
): C {
  const structSchema = Schema.Struct(cls.fields as Schema.Struct.Fields)
  const isStruct = Schema.is(structSchema)

  let memoAst: SchemaAST.Declaration | undefined
  function getModifiedAst(): SchemaAST.Declaration {
    if (memoAst !== undefined) return memoAst
    const ast = cls.ast
    memoAst = new SchemaAST.Declaration(
      ast.typeParameters,
      () => (input: unknown, self: SchemaAST.Declaration) => {
        if (input instanceof cls || isStruct(input)) {
          return Effect.succeed(input)
        }
        return Effect.fail(new SchemaIssue.InvalidType(self, Option.some(input)))
      },
      ast.annotations,
      ast.checks,
      ast.encoding,
      ast.context
    )
    return memoAst
  }

  const Sub = class extends (cls as any) {} as any
  // Copy static own properties from original class (fields, identifier, etc.)
  const descriptors = Object.getOwnPropertyDescriptors(cls)
  for (const [key, desc] of Object.entries(descriptors)) {
    if (key === "prototype" || key === "length" || key === "name") continue
    if (key === "ast") continue // overridden below
    Object.defineProperty(Sub, key, desc)
  }

  // Override the ast getter to return the modified Declaration
  Object.defineProperty(Sub, "ast", {
    get: getModifiedAst,
    configurable: true,
    enumerable: false
  })

  // Override rebuild to use internal make (creates a plain schema from ast)
  Sub.rebuild = (ast: SchemaAST.Declaration) => {
    const self: any = Object.create(schemaProto)
    self.ast = ast
    self.rebuild = (a: SchemaAST.AST) => Sub.rebuild(a)
    self.makeUnsafe = SchemaParser.makeUnsafe(self)
    self.makeOption = SchemaParser.makeOption(self)
    return self
  }

  Sub.annotate = function(annotations: any) {
    return Sub.rebuild(SchemaAST.annotate(Sub.ast, annotations))
  }
  Sub.annotateKey = function(annotations: any) {
    return Sub.rebuild(SchemaAST.annotateKey(Sub.ast, annotations))
  }
  Sub.check = function(...checks: any[]) {
    return Sub.rebuild(SchemaAST.appendChecks(Sub.ast, checks))
  }
  Sub.makeUnsafe = function(input: any, options?: any) {
    return new Sub(input, options)
  }
  Sub.makeOption = function(input: any, options?: any) {
    return SchemaParser.makeOption(Sub as any)(input, options)
  }
  Sub.pipe = function() {
    return Pipeable.pipeArguments(Sub, arguments)
  }

  return Sub as C
}

// Minimal schema proto for rebuild results (plain schemas)
const TypeId = "~effect/Schema/Schema"
const schemaProto = {
  [TypeId]: TypeId,
  pipe() {
    return Pipeable.pipeArguments(this, arguments)
  },
  annotate(this: Schema.Top, annotations: any) {
    return this.rebuild(SchemaAST.annotate(this.ast, annotations))
  },
  annotateKey(this: Schema.Top, annotations: any) {
    return this.rebuild(SchemaAST.annotateKey(this.ast, annotations))
  },
  check(this: Schema.Top, ...checks: any[]) {
    return this.rebuild(SchemaAST.appendChecks(this.ast, checks as any))
  }
}

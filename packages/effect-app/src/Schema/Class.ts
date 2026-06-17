/* eslint-disable @typescript-eslint/no-explicit-any */
import type * as Cause from "effect/Cause"
import * as Effect from "effect/Effect"
import * as Option from "effect/Option"
import * as S from "effect/Schema"
import * as SchemaAST from "effect/SchemaAST"
import * as SchemaIssue from "effect/SchemaIssue"
import { copyOrigin } from "../utils.ts"
import { concurrencyUnbounded } from "./ext.ts"
import * as SchemaParser from "./SchemaParser.ts"

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

export declare const ExtendedSchemaNoEncoded: unique symbol

export type ExtendedSchemaNoEncoded = typeof ExtendedSchemaNoEncoded

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
  fields: S.Struct.Fields,
  cls: any
): SchemaAST.Declaration {
  const parseOptions = ast.annotations?.["parseOptions"] as SchemaAST.ParseOptions | undefined
  const structSchema = S.Struct(fields)
  const annotatedStruct = parseOptions ? S.toType(structSchema).annotate({ parseOptions }) : S.toType(structSchema)
  const decodeStruct = SchemaParser.decodeUnknownEffect(annotatedStruct)

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
 * import * as Schema from "effect/Schema"
 * import { Class } from "./Class.ts"
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
export const Class: <Self = never, Encoded = ExtendedSchemaNoEncoded, Brand = {}>(
  identifier: string
) => <Fields extends S.Struct.Fields>(
  fieldsOr: Fields | HasFields<Fields>,
  annotations?: ClassAnnotations<Self>,
  options?: ClassOptions
) => [Self] extends [never] ? MissingSelfGeneric<"Class">
  : EnhancedClass<
    Self,
    ExtendedSchema<S.Struct<Fields>, Encoded>,
    Brand
  > = (identifier) => (fields, annotations, options) => {
    const relaxed = options?.strict === false
    // Build the original Schema.Class
    const Base = (S.Class as any)(identifier)(fields, { ...concurrencyUnbounded, ...annotations })
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
 * import * as Schema from "effect/Schema"
 * import { TaggedClass } from "./Class.ts"
 *
 * class Circle extends TaggedClass<Circle>()("Circle", {
 *   radius: Schema.Number
 * }) {}
 *
 * Schema.encodeUnknownSync(Circle)({ _tag: "Circle", radius: 5 })
 * ```
 */
export const TaggedClass: <Self = never, Encoded = ExtendedSchemaNoEncoded, Brand = {}>(
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
    Brand
  > = (identifier) => (tag, fields, annotations, options) => {
    const relaxed = options?.strict === false
    const Base = (S.TaggedClass as any)(identifier)(tag, fields, { ...concurrencyUnbounded, ...annotations })
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
    const relaxed = options?.strict === false
    const Base = (S.ErrorClass as any)(identifier)(fields, { ...concurrencyUnbounded, ...annotations })
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
    const relaxed = options?.strict === false
    const Base = (S.TaggedErrorClass as any)(identifier)(tag, fields, { ...concurrencyUnbounded, ...annotations })
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

export interface Opaque<Self, Encoded, SchemaS extends S.Top, Brand>
  extends S.Opaque<Self, ExtendedSchema<SchemaS, Encoded>, Brand>
{}

export const Opaque: <Self, Encoded = ExtendedSchemaNoEncoded, Brand = {}>() => <S extends S.Top>(
  schema: S
) => Opaque<Self, Encoded, S, Brand> & Omit<S, keyof S.Top> = S.Opaque as any

/**
 * Like {@link Opaque}, but the class **instance type is exactly `Self`** (the supplied
 * decoded `Type`) instead of the structurally-computed `struct["Type"] & Brand`.
 *
 * Stock `Opaque` types the instance as `struct["Type"] & Brand` and only overrides the
 * schema's `Type`/`Encoded` *members* with `Self`/`Encoded`. So `make`/`copy`/consumers
 * still resolve the struct's mapped `Type`. With a codegen-supplied pre-expanded literal
 * `Type` interface, `OpaqueType` lets all of those resolve a single **named** interface
 * (resolved once per checker) instead of re-deriving the mapped `Type` — cutting
 * instantiation on `Type`-touching consumers.
 *
 * Use with `class X extends OpaqueType<X.Type, X.Encoded>()(struct) {}` where `X.Type`
 * and `X.Encoded` are generated literal interfaces (see `@effect-app/eslint-codegen-model`,
 * `static` + `type` mode).
 *
 * KNOWN GAP — **no branding**: the instance type is a plain structural `Self`, so opaque
 * types of identical shape are mutually assignable. (Stock `Opaque` is also structural by
 * default — `Brand` defaults to `{}` — so this only differs if you passed a non-default
 * `Brand`.) Re-introducing a nominal brand on top of a supplied `Self` (e.g. branding the
 * generated `Type` interface) is not yet implemented.
 *
 * NOTE: only `Type` (via `Self`) and `Encoded` are supplied statically here; `make`'s input
 * (`~type.make.in`) and other derived members are still computed from the struct. See
 * a future `OpaqueShape`-style helper if those also need to be supplied.
 */
export interface OpaqueType<Self, Encoded, SchemaS extends S.Top, Brand>
  extends S.Opaque<Self, ExtendedSchema<SchemaS, Encoded>, Brand>
{
  new(_: never): Self
}

export const OpaqueType: <Self, Encoded = ExtendedSchemaNoEncoded, Brand = {}>() => <S extends S.Top>(
  schema: S
) => OpaqueType<Self, Encoded, S, Brand> & Omit<S, keyof S.Top> = S.Opaque as any

// Override both the `Encoded` and make-input (`~type.make.in`) members in one go,
// like `ExtendedSchema` does for `Encoded` alone.
type ExtendedShape<SchemaS extends S.Top, Encoded, MakeIn> =
  & Omit<SchemaS, "Encoded" | "~type.make.in">
  & { readonly Encoded: Encoded; readonly "~type.make.in": MakeIn }

type OpaqueFacadeConstructorArgs<MakeIn> = {} extends MakeIn ? [props?: MakeIn, options?: S.MakeOptions]
  : [props: MakeIn, options?: S.MakeOptions]

// Only the codec channels are required. `copy`/`fields`/`mapFields` are NOT
// required here: transformed schemas (`.pipe(S.encodeKeys/annotate/filter/...)`)
// don't expose them at the static level, and requiring them would reject those
// models from facading. When present they still flow through via
// `OpaqueFacadeStatics`; when absent the facade simply doesn't offer them.
type OpaqueFacadeInput<DecodingServices, EncodingServices> = S.Top & {
  readonly DecodingServices: DecodingServices
  readonly EncodingServices: EncodingServices
}

type OpaqueFacadeClassInput<DecodingServices, EncodingServices> =
  & OpaqueFacadeInput<
    DecodingServices,
    EncodingServices
  >
  & (abstract new(...args: Array<never>) => unknown)

type OpaqueFacadeEncodeKeyMapping<SchemaS extends { readonly fields: S.Struct.Fields }> = {
  readonly [K in keyof SchemaS["fields"]]?: PropertyKey
}

type PrototypeFunction = Function & { prototype: object }

const makeEncodeKeysFacadeAst = <
  SchemaS extends OpaqueFacadeClassInput<any, any> & { readonly fields: S.Struct.Fields },
  const Mapping extends OpaqueFacadeEncodeKeyMapping<SchemaS>
>(
  schema: SchemaS,
  mapping: Mapping,
  Public: PrototypeFunction
): SchemaAST.AST => {
  function DecodeCtor(this: unknown, input: unknown, options?: unknown) {
    return Reflect.construct(schema, [input, options], Public) as object
  }

  Object.setPrototypeOf(DecodeCtor, schema)
  DecodeCtor.prototype = Public.prototype

  const decodeSchema: SchemaS = DecodeCtor as any
  return decodeSchema.pipe(S.encodeKeys(mapping)).ast
}

// Carry the schema's own statics, dropping the generic `S.Top` machinery and
// `prototype`. EXCEPT `to`: models compose each other via `X.to.fields` /
// `X.to.copy` at definition time, so it must survive on the facade.
type OpaqueFacadeStatics<SchemaS extends S.Top> = Omit<SchemaS, Exclude<keyof S.Top, "to"> | "prototype">

/**
 * Like {@link OpaqueType}, but ALSO supplies a static **make-input** shape, so
 * `make`/`copy` resolve a named `MakeIn` interface instead of re-deriving the struct's
 * mapped `~type.make.in`. Use with codegen-supplied `X.Type` / `X.Encoded` / `X.Make`:
 *
 * ```ts
 * class X extends OpaqueShape<X.Type, X.Encoded, X.Make>()(struct) {}
 * ```
 *
 * `decode`/`encode` already use the supplied `Type`/`Encoded` (they read the schema's
 * `Type`/`Encoded` members, which are `Self`/`Encoded` here) — no separate override needed.
 *
 * NOTE — measured gain is modest (~5%): the struct passed to the wrapper is still
 * constructed in full (definition cost dominates); the static shapes only cheapen
 * consumer-side reads of `Type`/`Encoded`/`MakeIn`. Same `no-branding` gap as
 * {@link OpaqueType}.
 */
export interface OpaqueShape<Self, Encoded, MakeIn, SchemaS extends S.Top, Brand>
  extends S.Opaque<Self, ExtendedShape<SchemaS, Encoded, MakeIn>, Brand>
{
  new(_: never): Self
}

export const OpaqueShape: <Self, Encoded, MakeIn, Brand = {}>() => <S extends S.Top>(
  schema: S
) => OpaqueShape<Self, Encoded, MakeIn, S, Brand> & Omit<S, keyof S.Top> = S.Opaque as any

/**
 * Shallow public view for generated model facades.
 *
 * The runtime value can still be the full private schema class, but emitted
 * declarations expose only named `Type` / `Encoded` / `Make` interfaces and a
 * small static surface. This keeps downstream project references from pulling
 * the private struct field map back through `typeof Model`.
 */
export interface OpaqueSchemaFacade<
  Self,
  Encoded,
  MakeIn,
  DecodingServices = never,
  EncodingServices = DecodingServices,
  Brand = {}
> extends
  S.Bottom<
    Self,
    Encoded,
    DecodingServices,
    EncodingServices,
    SchemaAST.AST,
    S.Codec<Self, Encoded, DecodingServices, EncodingServices>,
    MakeIn,
    Self,
    readonly [],
    MakeIn
  >
{
  new(...args: OpaqueFacadeConstructorArgs<MakeIn>): Self & Brand
  readonly copy: ReturnType<typeof copyOrigin<new(_: MakeIn) => Self>>
  // NOTE: `fields` / `mapFields` are intentionally NOT redeclared here. They are
  // carried (precise) from the underlying schema via `OpaqueFacadeStatics`. A wide
  // `mapFields(f: (fields: S.Struct.Fields) => To)` override would win overload
  // resolution and erase field precision in `Q.project(X.mapFields(...))`.
}

export interface OpaqueFacade<
  Self,
  Encoded,
  MakeIn,
  DecodingServices = never,
  EncodingServices = DecodingServices,
  Brand = {}
> extends
  S.Bottom<
    Self,
    Encoded,
    DecodingServices,
    EncodingServices,
    SchemaAST.AST,
    S.Codec<Self, Encoded, DecodingServices, EncodingServices>,
    MakeIn,
    Self,
    readonly [],
    MakeIn
  >
{
  new(...args: OpaqueFacadeConstructorArgs<MakeIn>): Brand
  readonly copy: ReturnType<typeof copyOrigin<new(_: MakeIn) => Self>>
}
export function OpaqueFacade<
  Self,
  Encoded,
  MakeIn,
  DecodingServices = never,
  EncodingServices = DecodingServices,
  Brand = {}
>() {
  return <SchemaS extends OpaqueFacadeInput<DecodingServices, EncodingServices>>(
    schema: SchemaS
  ):
    & OpaqueFacade<Self, Encoded, MakeIn, DecodingServices, EncodingServices, Brand>
    & OpaqueFacadeStatics<SchemaS> =>
  {
    class Facade {}
    return Object.setPrototypeOf(Facade, schema)
  }
}

export function OpaqueSchemaFacade<
  Self,
  Encoded,
  MakeIn,
  DecodingServices = never,
  EncodingServices = DecodingServices,
  Brand = {}
>() {
  return <SchemaS extends OpaqueFacadeInput<DecodingServices, EncodingServices>>(
    schema: SchemaS
  ):
    & OpaqueSchemaFacade<Self, Encoded, MakeIn, DecodingServices, EncodingServices, Brand>
    & OpaqueFacadeStatics<SchemaS> =>
    schema as SchemaS & OpaqueSchemaFacade<Self, Encoded, MakeIn, DecodingServices, EncodingServices, Brand>
}

export interface OpaqueFacadeClass<
  Self,
  Encoded,
  MakeIn,
  DecodingServices = never,
  EncodingServices = DecodingServices,
  Brand = {}
> extends
  S.Bottom<
    Self,
    Encoded,
    DecodingServices,
    EncodingServices,
    SchemaAST.AST,
    S.Codec<Self, Encoded, DecodingServices, EncodingServices>,
    MakeIn,
    Self,
    readonly [],
    MakeIn
  >
{
  new(...args: OpaqueFacadeConstructorArgs<MakeIn>): Brand
  readonly copy: ReturnType<typeof copyOrigin<new(_: MakeIn) => Self>>
  // NOTE: `fields` / `mapFields` intentionally not redeclared — carried precise
  // from the underlying schema via `OpaqueFacadeStatics` (see OpaqueFacade above).
}

export function OpaqueFacadeClass<
  Self,
  Encoded,
  MakeIn,
  DecodingServices = never,
  EncodingServices = DecodingServices,
  Brand = {}
>() {
  return <SchemaS extends OpaqueFacadeClassInput<DecodingServices, EncodingServices>>(
    schema: SchemaS
  ):
    & OpaqueFacadeClass<Self, Encoded, MakeIn, DecodingServices, EncodingServices, Brand>
    & OpaqueFacadeStatics<SchemaS> =>
  {
    type FacadeSchema =
      & OpaqueFacadeClass<Self, Encoded, MakeIn, DecodingServices, EncodingServices, Brand>
      & OpaqueFacadeStatics<SchemaS>

    if (typeof schema === "function") {
      return schema as SchemaS & FacadeSchema
    }

    throw new TypeError("OpaqueFacadeClass requires a class schema")
  }
}

export function OpaqueFacadeClassWithEncodeKeys<
  Self,
  Encoded,
  MakeIn,
  DecodingServices = never,
  EncodingServices = DecodingServices,
  Brand = {}
>() {
  return <
    SchemaS extends OpaqueFacadeClassInput<DecodingServices, EncodingServices> & { readonly fields: S.Struct.Fields },
    const Mapping extends OpaqueFacadeEncodeKeyMapping<SchemaS>
  >(
    schema: SchemaS,
    mapping: Mapping
  ):
    & OpaqueFacadeClass<Self, Encoded, MakeIn, DecodingServices, EncodingServices, Brand>
    & OpaqueFacadeStatics<SchemaS> =>
  {
    if (typeof schema !== "function") {
      throw new TypeError("OpaqueFacadeClassWithEncodeKeys requires a class schema")
    }

    const astCache = new WeakMap<object, SchemaAST.AST>()
    const Base = schema as any

    return class extends Base {
      static get ast(): SchemaAST.AST {
        let cached = astCache.get(this)
        if (cached !== undefined) return cached

        cached = makeEncodeKeysFacadeAst(schema, mapping, this)
        astCache.set(this, cached)
        return cached
      }
    } as any
  }
}

/**
 * Like {@link OpaqueFacadeClass}, but for error models (`TaggedErrorClass` /
 * `ErrorClass`). The decoded instance type carries `Cause.YieldableError`, so
 * `yield* new MyError(...)`, `Effect.fail(myError)`, and `instanceof` all keep
 * working through the facade — the runtime `_X` is the real error class (the
 * facade `X extends ...(_X)` inherits its prototype), and the type reflects it.
 * Nothing is lost vs the underlying error class.
 */
export interface OpaqueErrorFacadeClass<
  Self,
  Encoded,
  MakeIn,
  DecodingServices = never,
  EncodingServices = DecodingServices,
  Brand = {}
> extends
  S.Bottom<
    Self,
    Encoded,
    DecodingServices,
    EncodingServices,
    SchemaAST.AST,
    S.Codec<Self, Encoded, DecodingServices, EncodingServices>,
    MakeIn,
    Self,
    readonly [],
    MakeIn
  >
{
  // YieldableError (not Self) on the constructed instance — like OpaqueFacadeClass's
  // `new(): Brand`, the data type comes from the declaration-merged `interface X`,
  // so `Self` must NOT appear here (would recurse). Merging `X & YieldableError`
  // makes `yield* new X()` / `Effect.fail` / `instanceof` work without losing data.
  new(...args: OpaqueFacadeConstructorArgs<MakeIn>): Cause.YieldableError & Brand
  readonly copy: ReturnType<typeof copyOrigin<new(_: MakeIn) => Self>>
}

export function OpaqueErrorFacadeClass<
  Self,
  Encoded,
  MakeIn,
  DecodingServices = never,
  EncodingServices = DecodingServices,
  Brand = {}
>() {
  return <SchemaS extends OpaqueFacadeClassInput<DecodingServices, EncodingServices>>(
    schema: SchemaS
  ):
    & OpaqueErrorFacadeClass<Self, Encoded, MakeIn, DecodingServices, EncodingServices, Brand>
    & OpaqueFacadeStatics<SchemaS> =>
  {
    type FacadeSchema =
      & OpaqueErrorFacadeClass<Self, Encoded, MakeIn, DecodingServices, EncodingServices, Brand>
      & OpaqueFacadeStatics<SchemaS>

    if (typeof schema === "function") {
      return schema as SchemaS & FacadeSchema
    }

    throw new TypeError("OpaqueErrorFacadeClass requires a class schema")
  }
}

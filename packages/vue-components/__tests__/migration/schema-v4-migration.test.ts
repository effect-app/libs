/**
 * OmegaForm Schema Tests
 *
 * These tests pin the current behavior of generateMetaFromSchema and defaultsValueFromSchema,
 * ensuring regression safety during refactors.
 *
 * Strategy:
 *   1. "current" tests → pin behavior with current schema patterns
 *   2. When refactoring internals, ALL tests must stay green
 *
 * NOTE: Uses `S.withDefaultConstructor` from effect-app (wraps in Option.some),
 *       NOT `S.withConstructorDefault` from native effect (expects raw Option return).
 *
 * ---- v4 breaking changes (from v3) ----
 *
 * 1. Nested union _tag: FIXED — both patterns now produce "select"
 *    S.TaggedStruct produces a bare Literal AST node.
 *    Legacy S.Struct({ _tag: S.Literal("X") }) produces Union([Literal("X")])
 *    after AST.toType. Fixed via unwrapSingleLiteralUnion helper.
 *    A console.warn is emitted for the legacy pattern to encourage migration.
 *
 * 2. Root-level union unionMeta: FIXED — both patterns now generate unionMeta
 *    Same root cause as #1: single-element Union wrapping prevented tag extraction.
 *    Fixed via the same unwrapSingleLiteralUnion helper in metadataFromAst.
 *
 * 3. UndefinedOr defaults include the key with explicit undefined
 *    v3: defaultsValueFromSchema skips keys where the recursive call returns
 *        undefined (if fieldValue !== undefined), so UndefinedOr fields are
 *        omitted from the result object entirely.
 *    v4: the key will be present in the result with an explicit undefined value.
 *
 * 4. S.optionalKey(X).pipe(S.withDecodingDefault(...)) support in defaultsValueFromSchema
 *    v3: not supported (v3 equivalent was S.optionalWith which encoded defaults
 *        inside a PropertySignatureTransformation, opaque to AST inspection).
 *    v4: defaultsValueFromSchema detects PropertySignatureTransformation
 *        and extracts defaults, enabling withDecodingDefault as a new pattern for
 *        declaring field defaults directly on the schema.
 *
 * ---- API mapping ----
 *
 * | v4                                         | v3                             |
 * |--------------------------------------------|--------------------------------|
 * | `S.check(S.isGreaterThanOrEqualTo(x))`     | `S.greaterThanOrEqualTo(x)`    |
 * | `S.check(S.isLessThanOrEqualTo(x))`        | `S.lessThanOrEqualTo(x)`       |
 * | `S.check(S.isGreaterThan(x))`              | `S.greaterThan(x)`             |
 * | `S.check(S.isLessThan(x))`                 | `S.lessThan(x)`                |
 * | `S.check(S.isBetween({minimum, maximum}))` | `S.between(minimum, maximum)`  |
 * | `S.check(S.isInt())`                       | `S.int()`                      |
 * | `S.check(S.isMinLength(x))`                | `S.minLength(x)`               |
 * | `S.check(S.isMaxLength(x))`                | `S.maxLength(x)`               |
 * | `S.Union([...members])`                    | `S.Union(...members)`          |
 * | `S.optionalKey(S.X)`                       | `S.optionalWith`               |
 * |   `.pipe(S.withDecodingDefault(...))`       |   `(S.X, { default: ... })`    |
 */

import { mount } from "@vue/test-utils"
import { S } from "effect-app"
import { describe, expect, it } from "vitest"
import { useOmegaForm } from "../../src/components/OmegaForm"
import { defaultsValueFromSchema, generateMetaFromSchema } from "../../src/components/OmegaForm/OmegaFormStuff"
import OmegaIntlProvider from "../OmegaIntlProvider.vue"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Mount a form and extract its default values */
const mountAndGetDefaults = async (schema: S.Schema<any>, opts?: any) => {
  const wrapper = mount({
    components: { OmegaIntlProvider },
    template: `
      <OmegaIntlProvider>
        <component :is="form.Form" :subscribe="['values']">
          <template #default="{ subscribedValues: { values } }">
            <div data-testid="values">{{ JSON.stringify(values) }}</div>
          </template>
        </component>
      </OmegaIntlProvider>
    `,
    setup() {
      const form = useOmegaForm(schema as any, opts)
      return { form }
    }
  })
  await wrapper.vm.$nextTick()
  return JSON.parse(wrapper.find("[data-testid=\"values\"]").text())
}

// ============================================================================
// 1. generateMetaFromSchema — pin current behavior
// ============================================================================

describe("generateMetaFromSchema", () => {
  describe("simple struct", () => {
    const schema = S.Struct({
      name: S.NonEmptyString255,
      age: S.Number.pipe(S.check(S.isGreaterThanOrEqualTo(0))),
      active: S.Boolean
    })

    it("produces correct metadata for basic types", () => {
      const { meta } = generateMetaFromSchema(schema)
      expect(meta.name?.type).toBe("string")
      expect(meta.name?.required).toBe(true)
      expect(meta.name?.minLength).toBe(1)
      expect(meta.name?.maxLength).toBe(255)
      expect(meta.age?.type).toBe("number")
      expect(meta.age?.required).toBe(true)
      expect(meta.age?.minimum).toBe(0)
      expect(meta.active?.type).toBe("boolean")
      expect(meta.active?.required).toBe(true)
    })
  })

  describe("nullable fields", () => {
    const schema = S.Struct({
      required: S.NonEmptyString255,
      nullable: S.NullOr(S.String),
      optional: S.UndefinedOr(S.String)
    })

    it("nullable/undefined fields are not required", () => {
      const { meta } = generateMetaFromSchema(schema)
      expect(meta.required?.required).toBe(true)
      expect(meta.nullable?.required).toBe(false)
      expect(meta.nullable?.nullableOrUndefined).toBe("null")
      expect(meta.optional?.required).toBe(false)
      expect(meta.optional?.nullableOrUndefined).toBe("undefined")
    })
  })

  describe("nested struct", () => {
    const schema = S.Struct({
      outer: S.Struct({
        inner: S.NonEmptyString255,
        deep: S.Struct({
          value: S.Number
        })
      })
    })

    it("produces dot-notation keys for nested fields", () => {
      const { meta } = generateMetaFromSchema(schema)
      expect(meta["outer.inner"]).toBeDefined()
      expect(meta["outer.inner"]?.type).toBe("string")
      expect(meta["outer.deep.value"]).toBeDefined()
      expect(meta["outer.deep.value"]?.type).toBe("number")
    })
  })

  describe("discriminated union (nested in struct)", () => {
    const schema = S.Struct({
      union: S.Union([
        S.Struct({ _tag: S.Literal("A"), a: S.NonEmptyString255 }),
        S.Struct({ _tag: S.Literal("B"), b: S.Number })
      ])
    })

    it("generates _tag as select with member values", () => {
      const { meta } = generateMetaFromSchema(schema)
      // Works for both S.TaggedStruct and legacy S.Struct({ _tag: S.Literal(...) })
      // thanks to single-element Union unwrapping in createMeta
      expect(meta["union._tag"]?.type).toBe("select")
      expect(meta["union._tag"]?.required).toBe(true)
      expect(meta["union._tag"]?.members).toBeDefined()
    })

    it("generates field metadata for each union branch", () => {
      const { meta } = generateMetaFromSchema(schema)
      expect(meta["union.a"]?.type).toBe("string")
      expect(meta["union.b"]?.type).toBe("number")
    })

    it("nested non-nullable union does not generate unionMeta", () => {
      const { unionMeta } = generateMetaFromSchema(schema)
      expect(Object.keys(unionMeta).length).toBe(0)
    })
  })

  describe("nullable discriminated union", () => {
    const schema = S.Struct({
      union: S.NullOr(
        S.Union([
          S.Struct({ _tag: S.Literal("A"), a: S.NonEmptyString255, common: S.String }),
          S.Struct({ _tag: S.Literal("B"), b: S.Number, common: S.String })
        ])
      )
    })

    it("_tag is not required, other fields are required based on their type", () => {
      const { meta } = generateMetaFromSchema(schema)
      expect(meta["union._tag"]?.required).toBe(false)
      expect(meta["union.a"]?.required).toBe(true)
      expect(meta["union.b"]?.required).toBe(true)
    })
  })

  describe("root-level discriminated union (legacy Literal pattern)", () => {
    const schema = S.Union([
      S.Struct({ _tag: S.Literal("A"), a: S.NonEmptyString255 }),
      S.Struct({ _tag: S.Literal("B"), b: S.Number })
    ])

    it("generates _tag select and per-member fields with unionMeta", () => {
      const { meta, unionMeta } = generateMetaFromSchema(schema)

      expect(meta["_tag"]?.type).toBe("select")
      expect(meta["_tag"]?.required).toBe(true)
      expect(meta.a?.type).toBe("string")
      expect(meta.b?.type).toBe("number")
      expect(Object.keys(unionMeta).length).toBe(2)
    })
  })

  describe("root-level discriminated union (TaggedStruct pattern)", () => {
    const schema = S.Union([
      S.TaggedStruct("A", { a: S.NonEmptyString255 }),
      S.TaggedStruct("B", { b: S.Number })
    ])

    it("generates _tag select and per-member fields with unionMeta", () => {
      const { meta, unionMeta } = generateMetaFromSchema(schema)

      expect(meta["_tag"]?.type).toBe("select")
      expect(meta["_tag"]?.required).toBe(true)
      expect(meta["_tag"]?.members).toEqual(["A", "B"])
      expect(meta.a?.type).toBe("string")
      expect(meta.b?.type).toBe("number")
      expect(Object.keys(unionMeta).length).toBe(2)
      expect(unionMeta["A"]).toBeDefined()
      expect(unionMeta["B"]).toBeDefined()
    })

    it("unionMeta contains per-branch field metadata", () => {
      const { unionMeta } = generateMetaFromSchema(schema)

      expect(unionMeta["A"]?.["a"]?.type).toBe("string")
      expect(unionMeta["A"]?.["a"]?.required).toBe(true)
      expect(unionMeta["B"]?.["b"]?.type).toBe("number")
      expect(unionMeta["B"]?.["b"]?.required).toBe(true)
      // Each branch should NOT contain the other branch's fields
      expect(unionMeta["A"]?.["b"]).toBeUndefined()
      expect(unionMeta["B"]?.["a"]).toBeUndefined()
    })
  })

  describe("literal union (select)", () => {
    const schema = S.Struct({
      direction: S.Union([S.Literal("left"), S.Literal("right"), S.Literal("both")])
    })

    it("generates select type with members", () => {
      const { meta } = generateMetaFromSchema(schema)
      expect(meta.direction?.type).toBe("select")
      expect(meta.direction?.members).toEqual(["left", "right", "both"])
    })
  })
})

// ============================================================================
// 2. defaultsValueFromSchema — pin current behavior
// ============================================================================

describe("defaultsValueFromSchema", () => {
  describe("primitive defaults", () => {
    it("String defaults to empty string", () => {
      const schema = S.Struct({ name: S.String })
      expect(defaultsValueFromSchema(schema)).toEqual({ name: "" })
    })

    it("Boolean defaults to false", () => {
      const schema = S.Struct({ active: S.Boolean })
      expect(defaultsValueFromSchema(schema)).toEqual({ active: false })
    })

    it("NullOr defaults to null", () => {
      const schema = S.Struct({ value: S.NullOr(S.String) })
      expect(defaultsValueFromSchema(schema)).toEqual({ value: null })
    })

    it("UndefinedOr defaults include the key with undefined value", () => {
      const schema = S.Struct({ value: S.UndefinedOr(S.String) })
      const result = defaultsValueFromSchema(schema)
      expect("value" in result).toBe(true)
      expect(result.value).toBeUndefined()
    })
  })

  describe("withDefaultConstructor (effect-app wrapper)", () => {
    it("respects constructor defaults", () => {
      const schema = S.Struct({
        name: S.String.pipe(S.withDefaultConstructor(() => "hello")),
        count: S.Number.pipe(S.withDefaultConstructor(() => 42))
      })
      const defaults = defaultsValueFromSchema(schema)
      expect(defaults.name).toBe("hello")
      expect(defaults.count).toBe(42)
    })

    it("constructor defaults in union members", () => {
      const schema = S.Union([
        S.Struct({
          _tag: S.Literal("A").pipe(S.withDefaultConstructor(() => "A")),
          a: S.String.pipe(S.withDefaultConstructor(() => "defaultA"))
        }),
        S.Struct({
          _tag: S.Literal("B"),
          b: S.String
        })
      ])
      const defaults = defaultsValueFromSchema(schema)
      expect(defaults._tag).toBe("A")
      expect(defaults.a).toBe("defaultA")
    })
  })

  describe("nested struct defaults", () => {
    it("recursively extracts defaults from nested structs", () => {
      const schema = S.Struct({
        outer: S.Struct({
          name: S.String.pipe(S.withDefaultConstructor(() => "nested")),
          value: S.Boolean
        })
      })
      const defaults = defaultsValueFromSchema(schema)
      expect(defaults.outer.name).toBe("nested")
      expect(defaults.outer.value).toBe(false)
    })
  })

  describe("NullOr struct defaults", () => {
    it("NullOr struct defaults to null", () => {
      const schema = S.Struct({
        nested: S.NullOr(S.Struct({ x: S.String }))
      })
      expect(defaultsValueFromSchema(schema)).toEqual({ nested: null })
    })
  })
})

// ============================================================================
// 3. withDecodingDefault — decoding defaults
// ============================================================================

describe("withDecodingDefault decoding defaults", () => {
  it("withDecodingDefault fills value during decoding", () => {
    const schema = S.Struct({
      name: S.optionalKey(S.String).pipe(S.withDecodingDefault(() => "defaultName")),
      age: S.optionalKey(S.Number).pipe(S.withDecodingDefault(() => 0))
    })

    const decoded = S.decodeUnknownSync(schema)({})
    expect(decoded).toEqual({ name: "defaultName", age: 0 })
  })

  it("withDecodingDefault respects provided values", () => {
    const schema = S.Struct({
      name: S.optionalKey(S.String).pipe(S.withDecodingDefault(() => "defaultName"))
    })

    const decoded = S.decodeUnknownSync(schema)({ name: "provided" })
    expect(decoded).toEqual({ name: "provided" })
  })

  it("mixed withDefaultConstructor and withDecodingDefault", () => {
    const schema = S.Struct({
      constructorDefault: S.String.pipe(S.withDefaultConstructor(() => "fromConstructor")),
      decodingDefault: S.optionalKey(S.String).pipe(S.withDecodingDefault(() => "fromDecoding"))
    })

    // defaultsValueFromSchema should pick up constructor default
    const defaults = defaultsValueFromSchema(schema)
    expect(defaults.constructorDefault).toBe("fromConstructor")

    // Decoding should pick up decoding default
    const decoded = S.decodeUnknownSync(schema)({ constructorDefault: "x" })
    expect(decoded).toEqual({ constructorDefault: "x", decodingDefault: "fromDecoding" })
  })

  it("defaultsValueFromSchema extracts withDecodingDefault alongside regular fields", () => {
    const schema = S.Struct({
      name: S.optionalKey(S.String).pipe(S.withDecodingDefault(() => "decodingDefault")),
      required: S.String
    })

    const defaults = defaultsValueFromSchema(schema)
    expect(defaults.required).toBe("")
    expect(defaults.name).toBe("decodingDefault")
  })

  it("withDecodingDefault can replace manual form default initialization", () => {
    const schema = S.Struct({
      name: S.optionalKey(S.String).pipe(S.withDecodingDefault(() => "John")),
      age: S.optionalKey(S.Number).pipe(S.withDecodingDefault(() => 25)),
      active: S.optionalKey(S.Boolean).pipe(S.withDecodingDefault(() => true))
    })

    // Single decode call produces all defaults — no AST walking needed
    const defaults = S.decodeUnknownSync(schema)({})
    expect(defaults).toEqual({ name: "John", age: 25, active: true })

    // Partial input fills in missing defaults
    const partial = S.decodeUnknownSync(schema)({ name: "Dave" })
    expect(partial).toEqual({ name: "Dave", age: 25, active: true })
  })
})

// ============================================================================
// 4. Form-level integration tests — defaults flow end-to-end
// ============================================================================

describe("Form defaults integration", () => {
  it("schema defaults flow into form values", async () => {
    const schema = S.Struct({
      name: S.String.pipe(S.withDefaultConstructor(() => "hello")),
      active: S.Boolean,
      nullable: S.NullOr(S.String)
    })

    const values = await mountAndGetDefaults(schema)
    expect(values.name).toBe("hello")
    expect(values.active).toBe(false)
    expect(values.nullable).toBe(null)
  })

  it("union defaults flow into form values", async () => {
    const schema = S.Union([
      S.Struct({
        _tag: S.Literal("A").pipe(S.withDefaultConstructor(() => "A")),
        value: S.String.pipe(S.withDefaultConstructor(() => "default"))
      }),
      S.Struct({
        _tag: S.Literal("B"),
        value: S.Number
      })
    ])

    const values = await mountAndGetDefaults(schema)
    expect(values._tag).toBe("A")
    expect(values.value).toBe("default")
  })

  it("tanstack defaultValues override schema defaults", async () => {
    const schema = S.Struct({
      name: S.String.pipe(S.withDefaultConstructor(() => "fromSchema")),
      age: S.Number.pipe(S.withDefaultConstructor(() => 0))
    })

    const values = await mountAndGetDefaults(schema, {
      defaultValues: { name: "fromTanstack" }
    })
    expect(values.name).toBe("fromTanstack")
    expect(values.age).toBe(0)
  })
})

// ============================================================================
// 5. Meta generation for number constraints
// ============================================================================

describe("number constraint metadata", () => {
  it("separate isGreaterThanOrEqualTo + isLessThanOrEqualTo extracts min and max", () => {
    const schema = S.Struct({
      value: S.Number.pipe(
        S.check(S.isGreaterThanOrEqualTo(10)),
        S.check(S.isLessThanOrEqualTo(20))
      )
    })
    const { meta } = generateMetaFromSchema(schema)
    expect(meta.value?.type).toBe("number")
    expect(meta.value?.minimum).toBe(10)
    expect(meta.value?.maximum).toBe(20)
  })

  it("isBetween extracts min and max", () => {
    const schema = S.Struct({
      value: S.Number.pipe(S.check(S.isBetween({ minimum: 10, maximum: 20 })))
    })
    const { meta } = generateMetaFromSchema(schema)
    expect(meta.value?.type).toBe("number")
    expect(meta.value?.minimum).toBe(10)
    expect(meta.value?.maximum).toBe(20)
  })

  it("isInt extracts refinement", () => {
    const schema = S.Struct({
      value: S.Number.pipe(S.check(S.isInt()))
    })
    const { meta } = generateMetaFromSchema(schema)
    expect(meta.value?.refinement).toBe("int")
  })

  it("isGreaterThan extracts exclusive minimum", () => {
    const schema = S.Struct({
      value: S.Number.pipe(S.check(S.isGreaterThan(5)))
    })
    const { meta } = generateMetaFromSchema(schema)
    expect(meta.value?.exclusiveMinimum).toBe(5)
  })

  it("isLessThan extracts exclusive maximum", () => {
    const schema = S.Struct({
      value: S.Number.pipe(S.check(S.isLessThan(100)))
    })
    const { meta } = generateMetaFromSchema(schema)
    expect(meta.value?.exclusiveMaximum).toBe(100)
  })
})

// ============================================================================
// 6. Meta generation for string constraints
// ============================================================================

describe("string constraint metadata", () => {
  it("isMinLength and isMaxLength", () => {
    const schema = S.Struct({
      value: S.String.pipe(S.check(S.isMinLength(3)), S.check(S.isMaxLength(50)))
    })
    const { meta } = generateMetaFromSchema(schema)
    expect(meta.value?.minLength).toBe(3)
    expect(meta.value?.maxLength).toBe(50)
  })

  it("Email format detection", () => {
    const schema = S.Struct({
      email: S.Email
    })
    const { meta } = generateMetaFromSchema(schema)
    expect(meta.email?.format).toBe("email")
    expect(meta.email?.type).toBe("string")
  })
})

// ============================================================================
// 7. TaggedStruct API
// ============================================================================

describe("TaggedStruct API", () => {
  it("TaggedStruct creates struct with _tag literal", () => {
    const ts = S.TaggedStruct("A", { a: S.String })
    expect(ts.fields._tag).toBeDefined()
    expect(ts.fields.a).toBeDefined()

    const tagProp = ts.ast.propertySignatures.find((p: any) => p.name === "_tag")
    expect(S.AST.isLiteral(tagProp!.type)).toBe(true)
    expect((tagProp!.type as any).literal).toBe("A")
  })

  it("Union([TaggedStruct, TaggedStruct]) generates field metadata", () => {
    const taggedSchema = S.Struct({
      union: S.Union([
        S.TaggedStruct("A", { a: S.NonEmptyString255 }),
        S.TaggedStruct("B", { b: S.Number })
      ])
    })

    const { meta } = generateMetaFromSchema(taggedSchema)

    expect(meta["union.a"]?.type).toBe("string")
    expect(meta["union.b"]?.type).toBe("number")
    expect(meta["union._tag"]).toBeDefined()
  })

  it("NullOr(Union([TaggedStruct])) works for nullable discriminated unions", () => {
    const schema = S.Struct({
      union: S.NullOr(
        S.Union([
          S.TaggedStruct("A", { a: S.NonEmptyString255, common: S.String }),
          S.TaggedStruct("B", { b: S.Number, common: S.String })
        ])
      )
    })

    const { meta } = generateMetaFromSchema(schema)
    expect(meta["union._tag"]?.required).toBe(false)
    expect(meta["union.a"]?.required).toBe(true)
    expect(meta["union.b"]?.required).toBe(true)
  })

  it("TaggedStruct defaults work with withDefaultConstructor", () => {
    const schema = S.Union([
      S.TaggedStruct("A", {
        a: S.String.pipe(S.withDefaultConstructor(() => "defaultA"))
      }),
      S.TaggedStruct("B", { b: S.Number })
    ])

    const defaults = defaultsValueFromSchema(schema)
    expect(defaults.a).toBe("defaultA")
  })

  it("TaggedStruct decoding works correctly", () => {
    const schema = S.Union([
      S.TaggedStruct("A", { a: S.String }),
      S.TaggedStruct("B", { b: S.Number })
    ])

    const decoded = S.decodeUnknownSync(schema)({ _tag: "A", a: "hello" })
    expect(decoded).toEqual({ _tag: "A", a: "hello" })

    const decoded2 = S.decodeUnknownSync(schema)({ _tag: "B", b: 42 })
    expect(decoded2).toEqual({ _tag: "B", b: 42 })
  })
})

// ============================================================================
// 8. Array metadata
// ============================================================================

describe("array metadata", () => {
  it("Array of primitives generates multiple type", () => {
    const schema = S.Struct({
      tags: S.Array(S.String)
    })
    const { meta } = generateMetaFromSchema(schema)
    expect(meta.tags?.type).toBe("multiple")
  })

  it("Array of structs generates nested field metadata", () => {
    const schema = S.Struct({
      items: S.Array(S.Struct({
        name: S.NonEmptyString255,
        value: S.Number
      }))
    })
    const { meta } = generateMetaFromSchema(schema)
    expect(meta["items.name"]).toBeDefined()
    expect(meta["items.name"]?.type).toBe("string")
    expect(meta["items.value"]?.type).toBe("number")
  })
})

// ============================================================================
// 9. withDecodingDefault form integration
// ============================================================================

describe("withDecodingDefault form integration", () => {
  it("withDecodingDefault defaults flow into form values", async () => {
    const schema = S.Struct({
      name: S.optionalKey(S.String).pipe(S.withDecodingDefault(() => "John")),
      age: S.optionalKey(S.Number).pipe(S.withDecodingDefault(() => 25)),
      active: S.Boolean
    })

    const values = await mountAndGetDefaults(schema)
    expect(values.name).toBe("John")
    expect(values.age).toBe(25)
    expect(values.active).toBe(false)
  })

  it("withDecodingDefault mixed with withDefaultConstructor", async () => {
    const schema = S.Struct({
      fromDecoding: S.optionalKey(S.String).pipe(S.withDecodingDefault(() => "decoding")),
      fromConstructor: S.String.pipe(S.withDefaultConstructor(() => "constructor")),
      plain: S.Boolean
    })

    const values = await mountAndGetDefaults(schema)
    expect(values.fromDecoding).toBe("decoding")
    expect(values.fromConstructor).toBe("constructor")
    expect(values.plain).toBe(false)
  })

  it("tanstack defaultValues override withDecodingDefault", async () => {
    const schema = S.Struct({
      name: S.optionalKey(S.String).pipe(S.withDecodingDefault(() => "fromSchema")),
      other: S.optionalKey(S.Number).pipe(S.withDecodingDefault(() => 99))
    })

    const values = await mountAndGetDefaults(schema, {
      defaultValues: { name: "fromTanstack" }
    })
    expect(values.name).toBe("fromTanstack")
    expect(values.other).toBe(99)
  })
})

// ============================================================================
// 10. Regression guards
// ============================================================================

describe("regression guards", () => {
  it("isBetween extracts min and max metadata", () => {
    const schema = S.Struct({
      value: S.Number.pipe(S.check(S.isBetween({ minimum: 5, maximum: 15 })))
    })
    const { meta } = generateMetaFromSchema(schema)
    expect(meta.value?.minimum).toBe(5)
    expect(meta.value?.maximum).toBe(15)
  })

  it("withDecodingDefault extracted by defaultsValueFromSchema", () => {
    const schema = S.Struct({
      name: S.optionalKey(S.String).pipe(S.withDecodingDefault(() => "myDefault"))
    })
    const defaults = defaultsValueFromSchema(schema)
    expect(defaults.name).toBe("myDefault")
  })

  it("S.TaggedUnion crashes — use S.Union([TaggedStruct]) instead", () => {
    expect(() => {
      S.TaggedUnion("_tag", [
        S.TaggedStruct("A", { a: S.String }),
        S.TaggedStruct("B", { b: S.Number })
      ])
    })
      .toThrow()
  })
})

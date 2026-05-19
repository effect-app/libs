// __tests__/OmegaForm/Defaults.values.test.ts
import * as Effect from "effect-app/Effect"
import * as S from "effect-app/Schema"
import { describe, expect, it } from "vitest"
import { defaultsValueFromSchema } from "../../src/components/OmegaForm"
import { fillNestedDefaults } from "../../src/components/OmegaForm/meta/defaults"

describe("defaultsValueFromSchema", () => {
  it("extracts withConstructorDefault values", () => {
    const schema = S.Struct({
      name: S.String.pipe(S.withConstructorDefault(Effect.succeed("Bob")))
    })
    expect(defaultsValueFromSchema(schema)).toEqual({ name: "Bob" })
  })

  it("extracts withDecodingDefault on optionalKey", () => {
    const schema = S.Struct({
      flag: S.optionalKey(S.String).pipe(S.withDecodingDefault(Effect.succeed("on")))
    })
    expect(defaultsValueFromSchema(schema)).toEqual({ flag: "on" })
  })

  it("returns null for NullOr fields without explicit default", () => {
    const schema = S.Struct({
      x: S.NullOr(S.String)
    })
    expect(defaultsValueFromSchema(schema)).toEqual({ x: null })
  })

  it("returns undefined for UndefinedOr fields without explicit default", () => {
    const schema = S.Struct({
      x: S.UndefinedOr(S.Finite)
    })
    expect(defaultsValueFromSchema(schema)).toEqual({ x: undefined })
  })

  it("returns empty string for plain S.String at the leaf", () => {
    const schema = S.Struct({ x: S.String })
    expect(defaultsValueFromSchema(schema)).toEqual({ x: "" })
  })

  it("returns false for plain S.Boolean at the leaf", () => {
    const schema = S.Struct({ x: S.Boolean })
    expect(defaultsValueFromSchema(schema)).toEqual({ x: false })
  })

  it("preserves values passed via the record argument", () => {
    const schema = S.Struct({ x: S.String, y: S.String })
    expect(defaultsValueFromSchema(schema, { x: "preset" })).toEqual({ x: "preset", y: "" })
  })

  it("merges fields across union members, picking explicit defaults", () => {
    const schema = S.Union([
      S.TaggedStruct("A", { v: S.String.pipe(S.withConstructorDefault(Effect.succeed("a-default"))) }),
      S.TaggedStruct("B", { v: S.String, extra: S.String })
    ])
    expect(defaultsValueFromSchema(schema)).toEqual({ _tag: "A", v: "a-default", extra: "" })
  })
})

describe("fillNestedDefaults", () => {
  it("fills missing nullable children for a materialized nullable struct", () => {
    const schema = S.Struct({
      override: S.NullOr(S.Struct({
        min: S.NullOr(S.NonNegativeNumber),
        max: S.NullOr(S.NonNegativeNumber)
      }))
    })

    expect(fillNestedDefaults(schema.ast, { override: { min: 100 } })).toEqual({
      override: {
        min: 100,
        max: null
      }
    })
  })

  it("does not add fields from another tagged union branch", () => {
    const schema = S.Union([
      S.TaggedStruct("A", { a: S.NullOr(S.String), common: S.String }),
      S.TaggedStruct("B", { b: S.Number, nullableB: S.NullOr(S.Number) })
    ])

    expect(fillNestedDefaults(schema.ast, { _tag: "B", b: 1 })).toEqual({
      _tag: "B",
      b: 1
    })
  })

  it("fills missing nullable children for materialized struct elements of an array", () => {
    const schema = S.Struct({
      items: S.Array(S.NullOr(S.Struct({
        a: S.NullOr(S.String),
        b: S.NullOr(S.String)
      })))
    })

    expect(fillNestedDefaults(schema.ast, { items: [{ a: "x" }, null] })).toEqual({
      items: [{ a: "x", b: null }, null]
    })
  })

  it("returns the same reference when there is nothing to fill", () => {
    const schema = S.Struct({
      items: S.Array(S.NullOr(S.Struct({
        a: S.NullOr(S.String),
        b: S.NullOr(S.String)
      })))
    })

    const value = { items: [{ a: "x", b: null }, null] }
    expect(fillNestedDefaults(schema.ast, value)).toBe(value)
  })
})

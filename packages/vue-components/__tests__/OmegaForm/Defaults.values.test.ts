// __tests__/OmegaForm/Defaults.values.test.ts
import { Effect, S } from "effect-app"
import { describe, expect, it } from "vitest"
import { defaultsValueFromSchema } from "../../src/components/OmegaForm"

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

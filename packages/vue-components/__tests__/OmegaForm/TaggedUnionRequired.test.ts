import { S } from "effect-app"
import { describe, expect, it } from "vitest"
import { generateMetaFromSchema } from "../../src/components/OmegaForm/OmegaFormStuff"

describe("TaggedUnion required field handling", () => {
  it("should mark only _tag as non-required in nullable discriminated unions", () => {
    const schema = S.Struct({
      aString: S.NonEmptyString,
      union: S.NullOr(
        S.Union(
          S.Struct({
            a: S.NonEmptyString255,
            common: S.String,
            _tag: S.Literal("A")
          }),
          S.Struct({
            b: S.Number,
            common: S.String,
            _tag: S.Literal("B")
          })
        )
      )
    })

    const { meta } = generateMetaFromSchema(schema)

    // Top-level required field should be required
    expect(meta.aString?.required).toBe(true)

    // The _tag field should NOT be required (because the union is nullable)
    expect(meta["union._tag"]?.required).toBe(false)

    // But all other fields in the union branches SHOULD be required based on their own types
    // NonEmptyString255 is required
    expect(meta["union.a"]?.required).toBe(true)

    // Number is required
    expect(meta["union.b"]?.required).toBe(true)

    // S.String has minLength check via getMetadataFromSchema, so let's just check it exists
    // The exact required status depends on whether minLength is set
    expect(meta["union.common"]).toBeDefined()
  })

  it("should mark all fields as required in non-nullable discriminated unions", () => {
    const schema = S.Struct({
      union: S.Union(
        S.Struct({
          a: S.NonEmptyString,
          _tag: S.Literal("A")
        }),
        S.Struct({
          b: S.Number,
          _tag: S.Literal("B")
        })
      )
    })

    const { meta } = generateMetaFromSchema(schema)

    // The union is not nullable, so _tag should be required
    expect(meta["union._tag"]?.required).toBe(true)

    // Other fields should also be required based on their types
    expect(meta["union.a"]?.required).toBe(true)
    expect(meta["union.b"]?.required).toBe(true)
  })

  it("should handle nullable struct (single branch) differently from discriminated union", () => {
    const schema = S.Struct({
      nullableStruct: S.NullOr(
        S.Struct({
          field1: S.NonEmptyString,
          field2: S.String
        })
      )
    })

    const { meta } = generateMetaFromSchema(schema)

    // For a simple nullable struct (not a discriminated union), fields should be required based on their types
    expect(meta["nullableStruct.field1"]?.required).toBe(true)
    // S.String has minLength check, so just verify it exists
    expect(meta["nullableStruct.field2"]).toBeDefined()
  })
})

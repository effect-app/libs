// __tests__/OmegaForm/TaggedUnionNested.test.ts
import { S } from "effect-app"
import { describe, expect, it } from "vitest"
import { generateMetaFromSchema } from "../../src/components/OmegaForm/OmegaFormStuff"

const schema = S.Struct({
  aString: S.NonEmptyString255,
  union: S.NullOr(
    S.Union([
      S.TaggedStruct("A", { a: S.NonEmptyString255, common: S.NonEmptyString255 }),
      S.TaggedStruct("B", { b: S.NonEmptyString255, common: S.NonEmptyString255 })
    ])
  )
})

describe("FormTaggedUnion characterization", () => {
  const { meta, unionMeta } = generateMetaFromSchema(schema)

  it("flat meta exposes union._tag as a non-required select", () => {
    expect(meta["union._tag"]).toMatchObject({
      type: "select",
      members: ["A", "B"],
      required: false
    })
  })

  it("flat meta contains all branch fields", () => {
    expect(meta["union.a"]).toBeDefined()
    expect(meta["union.b"]).toBeDefined()
    expect(meta["union.common"]).toBeDefined()
  })

  // Current behavior: unionMeta is only populated when the schema root IS a Union.
  // When the union is nested inside a Struct field, unionMeta remains empty.
  // These tests pin that actual current behavior.
  it("unionMeta['A'] is undefined (nested union not tracked in unionMeta)", () => {
    expect(unionMeta["A"]).toBeUndefined()
  })

  it("unionMeta['B'] is undefined (nested union not tracked in unionMeta)", () => {
    expect(unionMeta["B"]).toBeUndefined()
  })

  it("sibling field aString is unaffected by the neighboring union", () => {
    expect(meta.aString).toMatchObject({
      type: "string",
      required: true,
      minLength: 1,
      maxLength: 255
    })
  })
})

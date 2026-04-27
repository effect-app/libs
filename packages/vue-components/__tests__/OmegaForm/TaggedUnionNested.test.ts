// __tests__/OmegaForm/TaggedUnionNested.test.ts
import { S } from "effect-app"
import { describe, expect, it } from "vitest"
import { generateMetaFromSchema } from "../../src/components/OmegaForm"

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

  // After unification, nested unions also populate unionMeta (same as root unions).
  it("unionMeta['A'] contains A-only field and shared field, but not B-only", () => {
    expect(unionMeta["A"]?.["union.a"]).toBeDefined()
    expect(unionMeta["A"]?.["union.common"]).toBeDefined()
    expect(unionMeta["A"]?.["union.b"]).toBeUndefined()
  })

  it("unionMeta['B'] contains B-only field and shared field, but not A-only", () => {
    expect(unionMeta["B"]?.["union.b"]).toBeDefined()
    expect(unionMeta["B"]?.["union.common"]).toBeDefined()
    expect(unionMeta["B"]?.["union.a"]).toBeUndefined()
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

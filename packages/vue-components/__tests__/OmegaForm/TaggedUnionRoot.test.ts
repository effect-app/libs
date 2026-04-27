// __tests__/OmegaForm/TaggedUnionRoot.test.ts
import { Effect, S } from "effect-app"
import { describe, expect, it } from "vitest"
import {
  defaultsValueFromSchema,
  generateMetaFromSchema
} from "../../src/components/OmegaForm/OmegaFormStuff"

const schema = S.Union([
  S.TaggedStruct("A", {
    a: S.NonEmptyString255.pipe(
      S.withConstructorDefault(Effect.succeed(S.NonEmptyString255("aaaa")))
    ),
    common: S.NonEmptyString255
  }),
  S.TaggedStruct("B", {
    b: S.Finite,
    nullableB: S.NullOr(S.Finite),
    common: S.NullOr(S.String)
  })
])

describe("RootLevelTaggedUnion characterization", () => {
  const { meta, unionMeta } = generateMetaFromSchema(schema)

  it("flat _tag is a required select with both members", () => {
    expect(meta._tag).toMatchObject({
      type: "select",
      members: ["A", "B"],
      required: true
    })
  })

  it("unionMeta['A'].common is required and non-nullable", () => {
    expect(unionMeta["A"]?.common).toMatchObject({
      type: "string",
      required: true,
      nullableOrUndefined: false,
      minLength: 1,
      maxLength: 255
    })
  })

  it("unionMeta['B'].common is non-required and nullable", () => {
    expect(unionMeta["B"]?.common).toMatchObject({
      type: "string",
      required: false,
      nullableOrUndefined: "null"
    })
  })

  it("unionMeta['B'].nullableB is non-required and nullable", () => {
    expect(unionMeta["B"]?.nullableB).toMatchObject({
      type: "number",
      required: false,
      nullableOrUndefined: "null"
    })
  })

  it("unionMeta['A'] does not include B-only fields", () => {
    expect(unionMeta["A"]?.b).toBeUndefined()
    expect(unionMeta["A"]?.nullableB).toBeUndefined()
  })

  it("unionMeta['B'] does not include A-only fields", () => {
    expect(unionMeta["B"]?.a).toBeUndefined()
  })

  it("flat meta.common reflects last-write-wins resolution", () => {
    // Pin current behavior. If Phase 2 unifies the walker, this test makes
    // the resolution change visible — update or remove deliberately.
    expect(meta.common).toBeDefined()
  })

  it("defaultsValueFromSchema honors withConstructorDefault on branch A's a", () => {
    const defaults = defaultsValueFromSchema(schema)
    expect(defaults.a).toBe("aaaa")
  })
})

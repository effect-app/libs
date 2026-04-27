import { S } from "effect-app"
import { describe, expect, it } from "vitest"
import { generateMetaFromSchema } from "../../src/components/OmegaForm"

describe("Discriminator _tag originalSchema validates every member", () => {
  it("root tagged-union: validates alpha and beta", async () => {
    const schema = S.Union([
      S.TaggedStruct("alpha", { alpha: S.NonEmptyString }),
      S.TaggedStruct("beta", { beta: S.NonEmptyString })
    ])
    const { meta } = generateMetaFromSchema(schema)
    const tagMeta = meta._tag as any
    expect(tagMeta?.members).toEqual(["alpha", "beta"])
    const original = tagMeta?.originalSchema
    expect(original).toBeDefined()
    expect(await original["~standard"].validate("alpha")).toEqual({ value: "alpha" })
    expect(await original["~standard"].validate("beta")).toEqual({ value: "beta" })
  })

  it("nested tagged-union inside a struct: validates each tag", async () => {
    const schema = S.Struct({
      myUnion: S.Union([
        S.TaggedStruct("alpha", { alpha: S.NonEmptyString }),
        S.TaggedStruct("beta", { beta: S.NonEmptyString })
      ])
    })
    const { meta } = generateMetaFromSchema(schema)
    const tagMeta = meta["myUnion._tag"] as any
    expect(tagMeta?.members).toEqual(["alpha", "beta"])
    const original = tagMeta?.originalSchema
    expect(original).toBeDefined()
    expect(await original["~standard"].validate("alpha")).toEqual({ value: "alpha" })
    expect(await original["~standard"].validate("beta")).toEqual({ value: "beta" })
  })
})

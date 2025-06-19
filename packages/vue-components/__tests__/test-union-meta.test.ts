import { describe, it, expect } from "vitest"
import { S } from "effect-app"
import { generateMetaFromSchema } from "../src/components/OmegaForm/OmegaFormStuff"

const schema = S.Struct({
  mine: S.Struct({ their: S.Union(S.String, S.Struct({ yours: S.String })) }),
})

describe("test-union-meta", () => {
  it("should generate metadata for union", () => {
    const result = generateMetaFromSchema(schema)
    console.log("Generated metadata:", JSON.stringify(result.meta, null, 2))

    expect(result.meta).toHaveProperty("mine.their")
    expect(result.meta).toHaveProperty("mine.their.yours")
  })
})

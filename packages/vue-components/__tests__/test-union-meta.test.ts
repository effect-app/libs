import { describe, it, expect } from "vitest"
import { S } from "effect-app"
import { generateMetaFromSchema } from "../src/components/OmegaForm/OmegaFormStuff"

// Test the same schema as in SimpleForm.vue
const schema = S.Struct({
  mine: S.Struct({ tgeir: S.Union(S.String, S.Struct({ yours: S.String })) }),
})

describe("test-union-meta", () => {
  it("should generate metadata for union", () => {
    const result = generateMetaFromSchema(schema)
    console.log("Generated metadata:", JSON.stringify(result.meta, null, 2))

    expect(result.meta).toHaveProperty("mine.tgeir")
    expect(result.meta).toHaveProperty("mine.tgeir.yours")
  })
})

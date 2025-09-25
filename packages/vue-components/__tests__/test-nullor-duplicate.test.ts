import { S } from "effect-app"
import { describe, expect, it } from "vitest"
import { generateMetaFromSchema } from "../src/components/OmegaForm/OmegaFormStuff"

// Test schema from Array.vue story
const schema = S.Struct({
  height: S
    .NullOr(
      S.Struct({
        left: S.String,
        right: S.String,
        internal: S.String
      })
    ),
  width: S.Struct({
    left: S.String,
    right: S.String
  })
})

describe("test-nullor-duplicate", () => {
  it("should not create duplicate height keys for NullOr struct", () => {
    const result = generateMetaFromSchema(schema)
    console.log("Generated metadata:", JSON.stringify(result.meta, null, 2))
    console.log("Keys:", Object.keys(result.meta))

    // Should have nested fields for height
    expect(result.meta).toHaveProperty("height.left")
    expect(result.meta).toHaveProperty("height.right")
    expect(result.meta).toHaveProperty("height.internal")

    // Should have nested fields for width
    expect(result.meta).toHaveProperty("width.left")
    expect(result.meta).toHaveProperty("width.right")

    // Should NOT have a parent "height" key (this was the duplicate issue)
    expect(result.meta).not.toHaveProperty("height")

    // Regular structs also don't get parent keys, only their nested fields
    expect(result.meta).not.toHaveProperty("width")
  })
})

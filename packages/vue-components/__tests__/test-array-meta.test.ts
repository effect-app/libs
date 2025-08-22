import { describe, it, expect } from "vitest"
import { S } from "effect-app"
import { generateMetaFromSchema } from "../src/components/OmegaForm/OmegaFormStuff"

const schema = S.Struct({
  a: S.Array(S.Struct({
    b: S.String,
    c: S.Array(S.Struct({
      d: S.String,
    })),
    e: S.Array(S.Number),
  })),
  aMultiple: S.Array(S.String),
})

describe("test-array-meta", () => {
  it("should generate metadata for arrays", () => {
    const result = generateMetaFromSchema(schema)
    console.log("Generated metadata:", JSON.stringify(result.meta, null, 2))

    expect(result.meta).toHaveProperty("a.b")
    expect(result.meta["a.b"].type).toBe("string")
    expect(result.meta).toHaveProperty("a.c.d")
    expect(result.meta["a.c.d"].type).toBe("string")
    expect(result.meta).toHaveProperty("a.e")
    expect(result.meta["a.e"].type).toBe("multiple")
    expect(result.meta).toHaveProperty("aMultiple")
    expect(result.meta["aMultiple"]?.type).toBe("multiple")
  })
})

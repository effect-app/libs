import { S } from "effect-app"
import { describe, expect, it } from "vitest"
import { generateMetaFromSchema } from "../../src/components/OmegaForm"

describe("S.Email format detection", () => {
  it("flags S.Email fields with format: 'email' on their meta", () => {
    const schema = S.Struct({ x: S.Email })
    const { meta } = generateMetaFromSchema(schema)
    expect((meta.x as any)?.format).toBe("email")
  })
})

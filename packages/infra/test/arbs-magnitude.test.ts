import { describe, expect, it } from "@effect/vitest"
import * as S from "effect-app/Schema"
import { generateFromSchema } from "../src/arbs.js"

describe("generateFromSchema number magnitudes", () => {
  it("keeps PositiveNumber and NonNegativeNumber samples realistic", () => {
    const schema = S.Struct({ amount: S.PositiveNumber, weight: S.NonNegativeNumber })
    for (let i = 0; i < 200; i++) {
      const { amount, weight } = generateFromSchema(schema).value
      expect(amount).toBeGreaterThan(0)
      expect(weight).toBeGreaterThanOrEqual(0)
      expect(Math.max(amount, weight)).toBeLessThanOrEqual(1_000_000)
      expect(Number.isFinite(amount * weight)).toBe(true)
    }
  })

  it("does not change the JSON Schema of the number schemas", () => {
    expect(S.toJsonSchemaDocument(S.PositiveNumber).schema).not.toHaveProperty("maximum")
    expect(S.toJsonSchemaDocument(S.NonNegativeNumber).schema).not.toHaveProperty("maximum")
  })
})

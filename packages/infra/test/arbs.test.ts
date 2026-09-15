import { describe, expect, it } from "@effect/vitest"
import * as S from "effect-app/Schema"
import { generateFromSchema } from "../src/arbs.js"

describe("generateFromSchema", () => {
  it("yields a new sample on each call", () => {
    const schema = S.Struct({ id: S.NonEmptyString255, amount: S.Finite })
    const samples = Array.from({ length: 5 }, () => generateFromSchema(schema).value)
    for (const sample of samples) {
      expect(S.is(schema)(sample)).toBe(true)
    }
    expect(new Set(samples.map((sample) => JSON.stringify(sample))).size).toBeGreaterThan(1)
  })
})

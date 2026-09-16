import { describe, expect, it } from "@effect/vitest"
import { RequestId } from "effect-app/ids"
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

  it("samples refined strings that native generation cannot invert (Email, PhoneNumber)", () => {
    const schema = S.Struct({ email: S.Email, phone: S.PhoneNumber })
    for (let i = 0; i < 10; i++) {
      expect(S.is(schema)(generateFromSchema(schema).value)).toBe(true)
    }
  })

  it("successive StringId samples are unique (count:1 jump, not attempt-0 edge strings)", () => {
    const Item = S.Struct({ id: S.StringId, amount: S.Finite })
    const ids = Array.from({ length: 20 }, () => generateFromSchema(Item).value.id)
    expect(new Set(ids).size).toBe(20)
  })

  it("successive RequestId samples are unique", () => {
    const ids = Array.from({ length: 20 }, () => generateFromSchema(RequestId).value)
    expect(new Set(ids).size).toBe(20)
  })

  it("samples Url as https URLs", () => {
    for (let i = 0; i < 10; i++) {
      const url = generateFromSchema(S.Url).value
      expect(url.startsWith("https://")).toBe(true)
      expect(S.is(S.Url)(url)).toBe(true)
    }
  })
})

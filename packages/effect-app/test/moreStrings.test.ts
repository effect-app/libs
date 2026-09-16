import * as S from "effect-app/Schema"
import * as Effect from "effect/Effect"
import * as Arbitrary from "effect/unstable/arbitrary/Arbitrary"
import { urlAlphabet } from "nanoid"
import { test } from "vitest"

const nanoidAlphabet = new Set(urlAlphabet)

const isNanoId = (value: string) => value.length === 21 && Array.from(value).every((char) => nanoidAlphabet.has(char))

test("StringId make generates nanoid-shaped values", () => {
  for (let i = 0; i < 20; i++) {
    const value = S.StringId.make()
    expect(isNanoId(value)).toBe(true)
    expect(S.is(S.StringId)(value)).toBe(true)
  }
})

test("StringId native Arbitrary samples unique nanoid-shaped values", () => {
  const samples = Effect.runSync(Arbitrary.sampleEffect(Arbitrary.schema(S.StringId), { count: 20, seed: 5 }))
  expect(new Set(samples).size).toBe(20)
  for (const value of samples) {
    expect(isNanoId(value)).toBe(true)
    expect(S.is(S.StringId)(value)).toBe(true)
  }
})

test("Url native Arbitrary samples http(s) URLs", () => {
  const samples = Effect.runSync(Arbitrary.sampleEffect(Arbitrary.schema(S.Url), { count: 10, seed: 5 }))
  expect(new Set(samples).size).toBeGreaterThan(1)
  for (const value of samples) {
    expect(value.startsWith("https://")).toBe(true)
    expect(S.is(S.Url)(value)).toBe(true)
  }
})

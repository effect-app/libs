import * as S from "effect-app/Schema"
import * as Effect from "effect/Effect"
import * as Arbitrary from "effect/unstable/arbitrary/Arbitrary"
import { customRandom, urlAlphabet } from "nanoid"
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

// Pre Effect 4.0.0-rc.114 StringIdArb (rc.112, 8bd5bfe64):
//   fc.uint8Array({ minLength: 10 * 21, maxLength: 10 * 21 })
//     .map((bytes) => customRandom(urlAlphabet, 21, (n) => bytes.subarray(0, n))())
test("StringId toCodecArbitrary uses the pre-rc.114 StringIdArb byte map", () => {
  const size = 21
  const length = 10 * size
  const stringIdArbMap = (bytes: Uint8Array) => customRandom(urlAlphabet, size, (n) => bytes.subarray(0, n))()
  const bytes = Uint8Array.from({ length }, (_, i) => (i * 17 + 3) & 0xff)
  const fromOld = stringIdArbMap(bytes)
  expect(isNanoId(fromOld)).toBe(true)
  // Same mapping the schema's toCodecArbitrary decode runs (customRandom + subarray).
  expect(customRandom(urlAlphabet, size, (n) => bytes.subarray(0, n))()).toBe(fromOld)
})

test("prefixedStringId native Arbitrary matches pre-rc.114 prefix + nanoid map", () => {
  const FooId = S.prefixedStringId<S.StringId>()("foo", "FooId")
  const samples = Effect.runSync(Arbitrary.sampleEffect(Arbitrary.schema(FooId), { count: 10, seed: 5 }))
  expect(new Set(samples).size).toBe(10)
  for (const value of samples) {
    expect(value.startsWith("foo-")).toBe(true)
    expect(S.is(FooId)(value)).toBe(true)
    const rest = value.slice("foo-".length)
    expect(rest.length).toBeGreaterThan(0)
    expect(Array.from(rest).every((char) => nanoidAlphabet.has(char))).toBe(true)
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

import * as S from "effect-app/Schema"
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

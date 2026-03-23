import { S } from "effect-app"
import * as fc from "fast-check"
import { urlAlphabet } from "nanoid"
import { test } from "vitest"

const nanoidAlphabet = new Set(urlAlphabet)

const isNanoId = (value: string) => value.length === 21 && Array.from(value).every((char) => nanoidAlphabet.has(char))

test("StringId arbitrary generates nanoid-shaped values", () => {
  fc.assert(
    fc.property(S.toArbitrary(S.StringId), (value) => {
      expect(isNanoId(value)).toBe(true)
      expect(S.is(S.StringId)(value)).toBe(true)
    })
  )
})

import { S } from "effect-app"
import { copy } from "effect-app/utils"
import { generate } from "./arbs.js"

/**
 * Given the schema for an object-like structure, creates a function that generates random instances of that object with some values provided.
 */
export const createRandomInstance = <A extends object, I, R>(s: S.Codec<A, I, R> & { fields: S.Struct.Fields }) => {
  const gen = generate(S.toArbitrary(s))
  return (overrides?: Partial<A>) => {
    const v = gen.value
    return overrides ? copy(v, overrides) : v
  }
}

/**
 * Like `createRandomInstance`, but takes encoded values rather than decoded ones.
 */
export const createRandomInstanceI = <A extends object, I>(s: S.Codec<A, I> & { fields: S.Struct.Fields }) => {
  const gen = generate(S.toArbitrary(s))
  const encode = S.encodeSync(s)
  const decode = S.decodeSync(s)
  return (overrides?: Partial<I>) => {
    const v = gen.value
    if (!overrides) return v
    return decode({ ...encode(v), ...overrides })
  }
}

export * from "./arbs.js"

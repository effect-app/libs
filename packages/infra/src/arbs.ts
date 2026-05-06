// Do not import to frontend

import { faker } from "@faker-js/faker"
import { type S } from "effect-app"
import { setFaker } from "effect-app/faker"
import * as FastCheck from "effect/testing/FastCheck"
import { Random } from "fast-check"
import { congruential32 } from "pure-rand/generator/congruential32"

const seed = 5
const rng = congruential32(seed)
const rnd = new Random(rng)

setFaker(faker)

export function generate<T>(arb: FastCheck.Arbitrary<T>) {
  return arb.generate(rnd, undefined)
}

export function generateFromArbitrary<T>(arb: S.LazyArbitrary<T>) {
  return generate(arb(FastCheck))
}

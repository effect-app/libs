// Do not import to frontend

import { faker } from "@faker-js/faker"
import { setFaker } from "effect-app/faker"
import type * as S from "effect-app/Schema"
import * as Effect from "effect/Effect"
import * as Arbitrary from "effect/unstable/arbitrary/Arbitrary"
import * as FastCheck from "fast-check"
import { Random } from "fast-check"
import { congruential32 } from "pure-rand/generator/congruential32"

const seed = 5
const rng = congruential32(seed)
const rnd = new Random(rng)

setFaker(faker)

export function generate<T>(arb: FastCheck.Arbitrary<T>) {
  return arb.generate(rnd, undefined)
}

export function generateFromArbitrary<T>(arb: S.Arbitrary<T>) {
  return generate(arb(FastCheck))
}

export function generateFromSchema<S extends S.Constraint>(schema: S) {
  const samples = Effect.runSync(
    Arbitrary.sampleEffect(Arbitrary.schema(schema), { count: 1, seed })
  )
  const value = samples[0]
  if (value === undefined) {
    throw new Error("failed to sample schema")
  }
  return { value }
}

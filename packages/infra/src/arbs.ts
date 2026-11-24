// Do not import to frontend

import type * as S from "effect-app/Schema"
import * as Arbitrary from "effect/Arbitrary"
import * as Effect from "effect/Effect"

const seed = 5

// Native `sampleEffect({ count: 1 })` always uses attempt 0 of the master seed (edge-biased).
// Integer `seed + n` stayed in that bucket and collided for StringId. Mix a per-call suffix
// so each call is a jump-before-toss, like successive `generate(rnd)` draws.
let schemaSamples = 0

export function generateFromSchema<S extends S.Constraint>(schema: S) {
  const samples = Effect.runSync(
    Arbitrary.sampleEffect(Arbitrary.schema(schema), { count: 1, seed: `${seed}:${schemaSamples++}` })
  )
  const value = samples[0]
  if (value === undefined) {
    throw new Error("failed to sample schema")
  }
  return { value }
}

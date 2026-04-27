// __tests__/OmegaForm/DefaultValuesPriority.test.ts
import { Effect, S } from "effect-app"
import { describe, expect, it } from "vitest"
import { deepMerge } from "../../src/components/OmegaForm/OmegaFormStuff"

describe("deepMerge", () => {
  it("treats arrays as values, not as merged structures", () => {
    expect(deepMerge({ xs: [1, 2, 3] }, { xs: [9] })).toEqual({ xs: [9] })
  })

  it("recursively merges objects", () => {
    expect(deepMerge({ a: { b: 1, c: 2 } }, { a: { c: 9, d: 3 } }))
      .toEqual({ a: { b: 1, c: 9, d: 3 } })
  })

  it("source wins for primitives", () => {
    expect(deepMerge({ x: 1 }, { x: 2 })).toEqual({ x: 2 })
  })
})

// NOTE: defaultValuesPriority resolution lives inside useOmegaForm's
// `defaultValues` computed and isn't exported. A behavioral test would mount
// a form. The deepMerge unit tests above pin the merge mechanic; the priority
// resolution itself is exercised indirectly by the Meta and Defaults stories.
void Effect

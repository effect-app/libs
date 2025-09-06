import { expect, expectTypeOf, it } from "@effect/vitest"
import { Effect } from "effect-app"
import { pipeGen } from "../src/pipegen.js"

const test = pipeGen(function*() {
  return 5
})

it(
  "works",
  Effect.fnUntraced(function*() {
    const res = pipeGen(
      19,
      (n) => n * 10,
      function*(n) {
        return yield* Effect.succeed(n / 2)
      },
      Effect.map((n) => String(n + 1))
    )
    expectTypeOf(res).toEqualTypeOf<Effect.Effect<string>>()
    expect(yield* res).toEqual("96")

    const res2 = pipeGen(
      function*() {
        return yield* Effect.succeed(8)
      },
      Effect.map((n) => String(n + 1))
    )
    expectTypeOf(res2).toEqualTypeOf<Effect.Effect<string>>()
    expect(yield* res2).toEqual("9")

    const res3 = pipeGen(
      function*() {
        return yield* Effect.succeed(8)
      },
      Effect.map((n) => String(n + 1)),
      function*(e) {
        return (yield* e).repeat(2).length > 3
      }
    )
    expectTypeOf(res3).toEqualTypeOf<Effect.Effect<boolean>>()
    expect(yield* res3).toEqual(false)

    const res4 = pipeGen(
      function*() {
        // note: no yield* of effects here
        return 8
      },
      Effect.map((n) => String(n + 1)),
      function*(e) {
        return (yield* e).repeat(2).length > 3
      }
    )
    expectTypeOf(res4).toEqualTypeOf<Effect.Effect<boolean>>()
    expect(yield* res4).toEqual(false)
  }, Effect.runPromise)
)

import { expect, it } from "@effect/vitest"
import { Effect, FiberRef, Layer } from "effect"

const fiberRef = FiberRef.unsafeMake("test")

it("works", () => {
  const build = Effect.gen(function*() {
    const layer = Layer.scopedDiscard(
      Effect.locallyScoped(fiberRef, "test2")
    )
    return yield* Layer.build(layer)
  })

  const test = Effect.gen(function*() {
    const value = yield* FiberRef.get(fiberRef)
    return value
  })

  expect(Effect.runSync(
    Effect
      .gen(function*() {
        const ctx = yield* build
        return yield* Effect.provide(test, ctx)
      })
      .pipe(Effect.scoped)
  ))
    .toBe("test2")
})

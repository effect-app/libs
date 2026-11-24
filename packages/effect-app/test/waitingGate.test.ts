import * as Deferred from "effect/Deferred"
import * as Effect from "effect/Effect"
import * as Fiber from "effect/Fiber"
import { describe, expect, test } from "vitest"
import { makeWaitingGate, suspendWaiting, WaitingGate } from "../src/waitingGate.js"

const run = <A, E>(self: Effect.Effect<A, E, never>) => Effect.runPromise(self)

describe("suspendWaiting", () => {
  test("brackets depth and tells the controller", async () => {
    const depths: Array<number> = []
    const gate = makeWaitingGate((depth) => depths.push(depth))
    gate.bind((depth) => Effect.sync(() => depths.push(depth)))

    await run(
      suspendWaiting(
        Effect.sync(() => {
          expect(gate.depth).toBe(1)
        })
      ).pipe(Effect.provideService(WaitingGate, gate))
    )

    expect(gate.depth).toBe(0)
    expect(depths).toEqual([1, 1, 0, 0])
  })

  test("nests", async () => {
    const gate = makeWaitingGate()
    await run(
      suspendWaiting(
        suspendWaiting(
          Effect.sync(() => {
            expect(gate.depth).toBe(2)
          })
        )
      ).pipe(Effect.provideService(WaitingGate, gate))
    )
    expect(gate.depth).toBe(0)
  })

  test("restores depth when the effect is interrupted", async () => {
    const gate = makeWaitingGate()
    await run(
      Effect.gen(function* () {
        const entered = yield* Deferred.make<void>()
        const fiber = yield* suspendWaiting(
          Effect.gen(function* () {
            yield* Deferred.succeed(entered, undefined)
            return yield* Effect.never
          })
        ).pipe(Effect.provideService(WaitingGate, gate), Effect.forkChild)
        yield* Deferred.await(entered)
        expect(gate.depth).toBe(1)
        yield* Fiber.interrupt(fiber)
        expect(gate.depth).toBe(0)
      })
    )
  })

  test("does nothing on the default gate", async () => {
    await run(
      Effect.gen(function* () {
        const gate = yield* WaitingGate
        expect(gate.active).toBe(false)
        yield* suspendWaiting(Effect.void)
        expect(gate.depth).toBe(0)
      })
    )
  })
})

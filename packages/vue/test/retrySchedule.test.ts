import { expect, it } from "@effect/vitest"
import * as Effect from "effect-app/Effect"
import * as Fiber from "effect/Fiber"
import * as Ref from "effect/Ref"
import { TestClock } from "effect/testing"
import { retrySchedule } from "../src/atomQuery.js"

// retrySchedule(n) should allow exactly n retries (n+1 total attempts) for an always-failing effect.
it.effect("retrySchedule: retries the configured number of times", () =>
  Effect.gen(function*() {
    const attempts = yield* Ref.make(0)
    const failing = Effect.flatMap(Ref.update(attempts, (n) => n + 1), () => Effect.fail("boom" as const))

    const fiber = yield* failing.pipe(Effect.retry({ schedule: retrySchedule(3) }), Effect.exit, Effect.forkChild)
    // drive the backoff delays
    yield* TestClock.adjust("1 minute")
    yield* Fiber.join(fiber)

    // 1 initial + 3 retries
    expect(yield* Ref.get(attempts)).toBe(4)
  }))

it.effect("retrySchedule: a succeeding effect stops early", () =>
  Effect.gen(function*() {
    const attempts = yield* Ref.make(0)
    const succeedsOnThird = Effect.flatMap(
      Ref.updateAndGet(attempts, (n) => n + 1),
      (n) => n >= 3 ? Effect.succeed("ok" as const) : Effect.fail("boom" as const)
    )

    const fiber = yield* succeedsOnThird.pipe(Effect.retry({ schedule: retrySchedule(5) }), Effect.forkChild)
    yield* TestClock.adjust("1 minute")
    const result = yield* Fiber.join(fiber)

    expect(result).toBe("ok")
    expect(yield* Ref.get(attempts)).toBe(3)
  }))

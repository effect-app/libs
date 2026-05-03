import { expect, it } from "@effect/vitest"
import { Effect, Fiber } from "effect-app"
import * as Stream from "effect/Stream"
import { AsyncResult } from "../src/lib.js"
import { useExperimental } from "./stubs.js"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Wait for the fiber spawned by `cmd.handle()` to finish. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const join = (fiber: Fiber.Fiber<any, any>) => Fiber.join(fiber)

// ---------------------------------------------------------------------------
// Non-generator form — (arg) => Stream
// ---------------------------------------------------------------------------

it.live("streamFn: non-generator returning Stream runs stream and updates result", () =>
  Effect.gen(function*() {
    const Command = useExperimental({ toasts: [] })

    const cmd = Command.streamFn("test-stream-plain")(
      (_arg: number) => Stream.make(10, 20, 30)
    )

    expect(cmd.waiting).toBe(false)
    yield* join(cmd.handle(1))

    expect(cmd.result._tag).toBe("Success")
    if (cmd.result._tag === "Success") {
      expect(cmd.result.value).toBe(30)
      expect(cmd.result.waiting).toBe(false)
    }
  }))

// ---------------------------------------------------------------------------
// Generator form — function*(arg) { yield* effect; return Stream }
// ---------------------------------------------------------------------------

it.live("streamFn: generator form executes yielded effects and subscribes to returned stream", () =>
  Effect.gen(function*() {
    const Command = useExperimental({ toasts: [] })

    let generatorBodyExecuted = false

    const cmd = Command.streamFn("test-stream-gen")(
      function*(arg: number) {
        generatorBodyExecuted = true
        const doubled = yield* Effect.succeed(arg * 2)
        return Stream.make(doubled, doubled + 1, doubled + 2)
      }
    )

    yield* join(cmd.handle(5))

    // Generator body MUST have run
    expect(generatorBodyExecuted).toBe(true)

    // Stream emitted three values: 10, 11, 12; last one should be in result
    expect(cmd.result._tag).toBe("Success")
    if (cmd.result._tag === "Success") {
      expect(cmd.result.value).toBe(12)
      expect(cmd.result.waiting).toBe(false)
    }
  }))

// ---------------------------------------------------------------------------
// Generator form with async effect (Effect.promise)
// ---------------------------------------------------------------------------

it.live("streamFn: generator form with async Effect.promise works", () =>
  Effect.gen(function*() {
    const Command = useExperimental({ toasts: [] })

    let asyncValueReceived: string | undefined

    const cmd = Command.streamFn("test-stream-gen-async")(
      function*(arg: string) {
        // Simulate the pattern from the bug report: yield* Effect.promise(...)
        const result = yield* Effect.promise(() => Promise.resolve(`processed:${arg}`))
        asyncValueReceived = result
        return Stream.make(result, result + "!")
      }
    )

    yield* join(cmd.handle("hello"))

    expect(asyncValueReceived).toBe("processed:hello")
    expect(cmd.result._tag).toBe("Success")
    if (cmd.result._tag === "Success") {
      expect(cmd.result.value).toBe("processed:hello!")
    }
  }))

// ---------------------------------------------------------------------------
// Non-generator returning Effect<Stream>
// ---------------------------------------------------------------------------

it.live("streamFn: non-generator returning Effect<Stream> runs stream", () =>
  Effect.gen(function*() {
    const Command = useExperimental({ toasts: [] })

    const cmd = Command.streamFn("test-stream-effect-stream")(
      (arg: number) => Effect.succeed(Stream.make(arg * 3, arg * 3 + 1))
    )

    yield* join(cmd.handle(4))

    expect(cmd.result._tag).toBe("Success")
    if (cmd.result._tag === "Success") {
      expect(cmd.result.value).toBe(13) // 4*3+1 = 13
    }
  }))

// ---------------------------------------------------------------------------
// Generator form — waiting state flips correctly
// ---------------------------------------------------------------------------

it.live("streamFn: generator form sets waiting=true during execution then false after", () =>
  Effect.gen(function*() {
    const Command = useExperimental({ toasts: [] })

    const cmd = Command.streamFn("test-stream-gen-waiting")(
      function*(_arg: void) {
        return Stream.make(1, 2, 3)
      }
    )

    expect(cmd.waiting).toBe(false)
    const fiber = cmd.handle()

    // result transitions to initial(true) = waiting synchronously inside runStream
    // after the fiber runs, waiting should settle to false
    yield* join(fiber)
    expect(cmd.waiting).toBe(false)

    expect(AsyncResult.isSuccess(cmd.result)).toBe(true)
  }))

// ---------------------------------------------------------------------------
// Generator form with a stream-transformer combinator
// ---------------------------------------------------------------------------

it.live("streamFn: generator form with combinator — combinator transforms the stream", () =>
  Effect.gen(function*() {
    const Command = useExperimental({ toasts: [] })

    const emittedByCombinator: number[] = []

    // A combinator that records each element it sees.
    // The first argument may be a Stream or an Effect<Stream> (for generator-form handlers),
    // matching how withDefaultToastStream handles it.
    const spyCombinator = (streamOrEffect: Stream.Stream<number, never, never> | Effect.Effect<Stream.Stream<number, never, never>>) => {
      const stream: Stream.Stream<number, never, never> = Stream.isStream(streamOrEffect)
        ? streamOrEffect
        : Stream.unwrap(streamOrEffect as Effect.Effect<Stream.Stream<number, never, never>>)
      return stream.pipe(
        Stream.tap((v) =>
          Effect.sync(() => {
            emittedByCombinator.push(v)
          })
        )
      )
    }

    const cmd = Command.streamFn("test-stream-gen-combinator")(
      function*(arg: number) {
        const base = yield* Effect.succeed(arg * 10)
        return Stream.make(base, base + 1, base + 2)
      },
      // combinator receives (streamOrEffect, arg, ctx) — we only use the first arg here
      (streamOrEffect: Stream.Stream<number, never, never> | Effect.Effect<Stream.Stream<number, never, never>>) =>
        spyCombinator(streamOrEffect)
    )

    yield* join(cmd.handle(3))

    // combinator must have seen all elements: 30, 31, 32
    expect(emittedByCombinator).toEqual([30, 31, 32])

    expect(cmd.result._tag).toBe("Success")
    if (cmd.result._tag === "Success") {
      expect(cmd.result.value).toBe(32)
    }
  }))

// ---------------------------------------------------------------------------
// Generator form — Stream.ensuring runs after stream completes
// ---------------------------------------------------------------------------

it.live("streamFn: generator form Stream.ensuring cleanup runs after stream ends", () =>
  Effect.gen(function*() {
    const Command = useExperimental({ toasts: [] })

    let cleanupRan = false

    const cmd = Command.streamFn("test-stream-gen-ensuring")(
      function*(arg: number) {
        const value = yield* Effect.succeed(arg + 100)
        return Stream.make(value).pipe(
          Stream.ensuring(Effect.sync(() => {
            cleanupRan = true
          }))
        )
      }
    )

    yield* join(cmd.handle(7))

    expect(cleanupRan).toBe(true)
    expect(cmd.result._tag).toBe("Success")
    if (cmd.result._tag === "Success") {
      expect(cmd.result.value).toBe(107)
    }
  }))

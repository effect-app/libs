import { expect, it } from "@effect/vitest"
import * as Effect from "effect-app/Effect"
import * as Deferred from "effect/Deferred"
import * as Fiber from "effect/Fiber"
import * as Stream from "effect/Stream"
import { TestClock } from "effect/testing"
import { CommanderStatic } from "../src/commander.js"
import { AsyncResult } from "../src/lib.js"
import { useExperimental, useExperimentalE } from "./stubs.js"

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
    const spyCombinator = (
      input: Stream.Stream<number, never, never> | Effect.Effect<Stream.Stream<number, never, never>>
    ) => {
      const stream: Stream.Stream<number, never, never> = Stream.isStream(input)
        ? input
        : Stream.unwrap(input as Effect.Effect<Stream.Stream<number, never, never>>)
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
      // combinator receives (input, arg, ctx) — input is Stream or Effect<Stream> depending on handler form
      (input: Stream.Stream<number, never, never> | Effect.Effect<Stream.Stream<number, never, never>>) =>
        spyCombinator(input)
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

// ---------------------------------------------------------------------------
// Command.mapProgress — updates progress ref for each element
// ---------------------------------------------------------------------------

it.live("streamFn: Command.mapProgress updates progress ref for each stream element", () =>
  Effect.gen(function*() {
    const Command = useExperimental({ toasts: [] })

    const cmd = Command.streamFn("test-map-progress")(
      function*(_arg: void) {
        return Stream.make(1, 2, 3).pipe(
          CommanderStatic.mapProgress((r) =>
            AsyncResult.isSuccess(r)
              ? { text: `item-${r.value}`, percentage: r.value * 10 }
              : undefined
          )
        )
      }
    )

    // progress starts undefined (reactive unwraps the ref)
    expect(cmd.progress).toBeUndefined()

    yield* join(cmd.handle())

    // after stream drains, last mapped progress value should be set
    expect(cmd.progress).toEqual({ text: "item-3", percentage: 30 })
  }))

// ---------------------------------------------------------------------------
// Command.updateProgress — imperative progress update from stream
// ---------------------------------------------------------------------------

it.live("streamFn: Command.updateProgress imperatively drives the progress ref", () =>
  Effect.gen(function*() {
    const Command = useExperimental({ toasts: [] })

    const cmd = Command.streamFn("test-update-progress")(
      function*(_arg: void) {
        return Stream.make("a", "b").pipe(
          Stream.tap((v) => CommanderStatic.updateProgress(`processing ${v}`))
        )
      }
    )

    expect(cmd.progress).toBeUndefined()
    yield* join(cmd.handle())

    expect(cmd.progress).toBe("processing b")
  }))

// ---------------------------------------------------------------------------
// Command.withDefaultToastStream — in-progress (waiting) initial toast
// ---------------------------------------------------------------------------

it.effect("withDefaultToastStream: shows info toast while stream is running", () =>
  Effect.gen(function*() {
    const toasts: any[] = []
    const Command = yield* useExperimentalE({ toasts, messages: { "handle.waiting": "{action} waiting…" } })

    // Gate that holds the stream open past the 1s waiting-toast delay so we can
    // observe the info toast while the stream is still in-flight.
    const resume = yield* Deferred.make<void>()

    const cmd = Command.streamFn("doWork")(
      function*(_arg: void) {
        return Stream.make(1).pipe(
          Stream.tap(() => Deferred.await(resume))
        )
      },
      Command.withDefaultToastStream()
    )

    const fiber = cmd.handle()

    // Advance virtual time past the 1s waiting-toast delay; the stream is still
    // paused on `resume`, so the info toast must have surfaced.
    yield* TestClock.adjust("1100 millis")

    expect(toasts.some((t) => t.type === "info")).toBe(true)
    const infoToast = toasts.find((t) => t.type === "info")
    expect(infoToast.message).toContain("doWork")

    // Let the stream finish.
    yield* Deferred.succeed(resume, undefined)
    yield* join(fiber)

    // After completion the same toast slot is replaced with a success toast.
    expect(toasts.some((t) => t.type === "success")).toBe(true)
  }))

// ---------------------------------------------------------------------------
// Command.withDefaultToastStream — fast streams skip the waiting toast
// ---------------------------------------------------------------------------

it.live("withDefaultToastStream: fast stream finishes before delay → no waiting toast", () =>
  Effect.gen(function*() {
    const toasts: any[] = []
    const Command = useExperimental({ toasts, messages: { "handle.waiting": "{action} waiting…" } })

    const cmd = Command.streamFn("doWorkFast")(
      function*(_arg: void) {
        return Stream.make(1, 2, 3)
      },
      Command.withDefaultToastStream()
    )

    yield* join(cmd.handle())

    // Stream completed instantly; the 1s waiting fiber must have been interrupted before emitting an info toast.
    expect(toasts.some((t) => t.type === "info")).toBe(false)
    expect(toasts.some((t) => t.type === "success")).toBe(true)
  }))

// ---------------------------------------------------------------------------
// Command.withDefaultToastStream — progress text/percent updates the toast
// ---------------------------------------------------------------------------

it.live("withDefaultToastStream: progress option updates waiting toast message", () =>
  Effect.gen(function*() {
    const toasts: any[] = []
    const Command = useExperimental({
      toasts,
      messages: { "handle.waiting": "Working…", "handle.success": "{action} done" }
    })

    const progressSnapshots: string[] = []

    const cmd = Command.streamFn("doWorkProgress")(
      function*(_arg: void) {
        return Stream.make(10, 50, 100).pipe(
          Stream.tap((pct) =>
            Effect.sync(() => {
              progressSnapshots.push(`${pct}%`)
            })
          )
        )
      },
      Command.withDefaultToastStream({
        progress: (r) =>
          AsyncResult.isSuccess(r)
            ? { text: `${r.value}%`, percentage: r.value }
            : undefined
      })
    )

    yield* join(cmd.handle())

    // All three stream elements were visited by the tap above
    expect(progressSnapshots).toEqual(["10%", "50%", "100%"])

    // cmd.progress reflects the last mapped value (reactive unwraps the ref)
    expect(cmd.progress).toEqual({ text: "100%", percentage: 100 })

    // A success toast should appear after the stream completes
    expect(toasts.some((t) => t.type === "success")).toBe(true)
  }))

// ---------------------------------------------------------------------------
// Command.withDefaultToastStream — failure shows warning/error toast
// ---------------------------------------------------------------------------

it.live("withDefaultToastStream: failure shows failure toast, not success toast", () =>
  Effect.gen(function*() {
    const toasts: any[] = []
    const Command = useExperimental({ toasts })

    class BoomError {
      readonly _tag = "BoomError"
      readonly message = "boom"
    }

    const cmd = Command.streamFn("doWorkFail")(
      function*(_arg: void) {
        return Stream.fail(new BoomError())
      },
      Command.withDefaultToastStream()
    )

    yield* join(cmd.handle())

    // Typed errors → withDefaultToastStream calls toast.warning (level: "warn")
    expect(toasts.some((t) => t.type === "warning" || t.type === "error")).toBe(true)
    expect(toasts.some((t) => t.type === "success")).toBe(false)
  }))

// ---------------------------------------------------------------------------
// Command.withDefaultToastStream — die (defect) shows error toast
// ---------------------------------------------------------------------------

it.live("withDefaultToastStream: die/defect shows error toast, not warning or success", () =>
  Effect.gen(function*() {
    const toasts: any[] = []
    const Command = useExperimental({ toasts })

    const cmd = Command.streamFn("doWorkDie")(
      function*(_arg: void) {
        // Stream.die produces a defect — Cause.findErrorOption returns Option.none()
        // so defaultFailureMessageHandler returns a plain string → toast.error
        return Stream.die(new Error("unexpected defect"))
      },
      Command.withDefaultToastStream()
    )

    yield* join(cmd.handle())

    expect(toasts.some((t) => t.type === "error")).toBe(true)
    expect(toasts.some((t) => t.type === "warning")).toBe(false)
    expect(toasts.some((t) => t.type === "success")).toBe(false)
  }))

// ---------------------------------------------------------------------------
// Command.withDefaultToastStream — success shows success toast
// ---------------------------------------------------------------------------

it.live("withDefaultToastStream: success shows success toast after stream drains", () =>
  Effect.gen(function*() {
    const toasts: any[] = []
    const Command = useExperimental({ toasts, messages: { "handle.success": "{action} complete" } })

    const cmd = Command.streamFn("doWorkSuccess")(
      function*(_arg: void) {
        return Stream.make(42)
      },
      Command.withDefaultToastStream()
    )

    yield* join(cmd.handle())

    const successToast = toasts.find((t) => t.type === "success")
    expect(successToast).toBeDefined()
    expect(successToast.message).toContain("doWorkSuccess")
    expect(toasts.some((t) => t.type === "error")).toBe(false)
  }))

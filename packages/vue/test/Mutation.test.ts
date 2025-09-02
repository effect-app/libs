import { it } from "@effect/vitest"
import { Effect, Exit, Fiber } from "effect-app"
import { CommandContext, DefaultIntl } from "../src/experimental/useCommand.js"
import { useExperimental } from "./stubs.js"

it.live("works", () =>
  Effect
    .gen(function*() {
      const toasts: any[] = []
      const { useCommand } = useExperimental({ toasts })
      const Command = useCommand()

      let executed = false

      const command = Command.fn("Test Span")(
        function*() {
          expect(yield* Effect.currentSpan.pipe(Effect.map((_) => _.name))).toBe("Test Span")

          expect(yield* CommandContext).toEqual({ action: "Test Span" })

          expect(toasts.length).toBe(0)

          return "test-value"
        },
        Effect.tap(Effect.fnUntraced(function*() {
          expect(yield* Effect.currentSpan.pipe(Effect.map((_) => _.name))).toBe("Test Span")
        })),
        Effect.tap(() =>
          Effect.currentSpan.pipe(Effect.map((_) => _.name), Effect.tap((_) => expect(_).toBe("Test Span")))
        ),
        Effect.tap(() => executed = true)
      )
      expect(toasts.length).toBe(0)
      const r = yield* Fiber.join(command.value()).pipe(Effect.flatten) // we receive an Exit as errors/results are processed, so we flatten it.

      expect(r).toBe("test-value") // to confirm that the initial function has ran.
      expect(executed).toBe(true) // to confirm that the combinators have ran.

      expect(toasts.length).toBe(0)
    }))

it.live("has custom action name", () =>
  Effect
    .gen(function*() {
      const toasts: any[] = []
      const { useCommand } = useExperimental({ toasts, messages: { "action.Test Span": "Test Span Translated" } })
      const Command = useCommand()

      let executed = false

      const command = Command.fn("Test Span")(
        function*() {
          expect(yield* Effect.currentSpan.pipe(Effect.map((_) => _.name))).toBe("Test Span")

          expect(yield* CommandContext).toEqual({ action: "Test Span Translated" })
          return "test-value"
        },
        Effect.tap(() => executed = true)
      )
      const r = yield* Fiber.join(command.value()).pipe(Effect.flatten) // we receive an Exit as errors/results are processed, so we flatten it.

      expect(r).toBe("test-value") // to confirm that the initial function has ran.
      expect(executed).toBe(true) // to confirm that the combinators have ran.
    }))

it.live("with toasts", () =>
  Effect
    .gen(function*() {
      const toasts: any[] = []
      const { useCommand } = useExperimental({
        toasts,
        messages: DefaultIntl.en
      })
      const Command = useCommand()

      let executed = false

      const command = Command.fn("Test Span")(
        function*() {
          expect(yield* Effect.currentSpan.pipe(Effect.map((_) => _.name))).toBe("Test Span")

          expect(toasts.length).toBe(1)
          expect(toasts[0].message).toBe("Test Span executing...")

          return "test-value"
        },
        Effect.tap(Effect.fnUntraced(function*() {
          expect(yield* Effect.currentSpan.pipe(Effect.map((_) => _.name))).toBe("Test Span")
        })),
        Effect.tap(() =>
          Effect.currentSpan.pipe(Effect.map((_) => _.name), Effect.tap((_) => expect(_).toBe("Test Span")))
        ),
        Command.withDefaultToast,
        Effect.tap(() => executed = true)
      )

      const r = yield* Fiber.join(command.value()).pipe(Effect.flatten) // we receive an Exit as errors/results are processed, so we flatten it.

      expect(r).toBe("test-value") // to confirm that the initial function has ran.
      expect(executed).toBe(true) // to confirm that the combinators have ran.

      expect(toasts.length).toBe(1)
      expect(toasts[0].message).toBe("Test Span Success")
    }))

it.live("interrupted", () =>
  Effect
    .gen(function*() {
      let executed = false
      const toasts: any[] = []
      const { useCommand } = useExperimental({ toasts, messages: DefaultIntl.en })
      const Command = useCommand()

      const command = Command.fn("Test Span")(
        function*() {
          expect(toasts.length).toBe(1)
          yield* Effect.interrupt
          return "test-value"
        },
        Command.withDefaultToast,
        Effect.tap(() => executed = true)
      )

      const r = yield* Fiber.join(command.value()) // we receive an Exit as errors/results are processed

      expect(executed).toBe(false) // we were interrupted after all :)
      expect(Exit.isInterrupted(r)).toBe(true) // to confirm that the initial function has interrupted

      expect(toasts.length).toBe(0) // toast is removed on interruption. TODO: maybe a nicer user experience can be had?
    }))

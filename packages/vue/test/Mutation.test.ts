import { it } from "@effect/vitest"
import { Effect, Fiber } from "effect-app"
import { useExperimental } from "./stubs.js"

it.live("works", () =>
  Effect
    .gen(function*() {
      const { useCommand } = useExperimental()
      const Command = useCommand()

      let executed = false

      const command = Command.fn("Test Span")(
        function*() {
          expect(yield* Effect.currentSpan.pipe(Effect.map((_) => _.name))).toBe("Test Span")

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

      const r = yield* Fiber.join(command.value()).pipe(Effect.flatten) // we receive an Exit as errors/results are processed, so we flatten it.

      expect(r).toBe("test-value") // to confirm that the initial function has ran.
      expect(executed).toBe(true) // to confirm that the combinators have ran.
    }))

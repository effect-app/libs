/* eslint-disable @typescript-eslint/no-explicit-any */
import { it } from "@effect/vitest"
import { Cause, Effect, Exit, Fiber, Option } from "effect-app"
import { CommandContext, DefaultIntl } from "../src/experimental/commander.js"
import { Result } from "../src/lib.js"
import { useExperimental } from "./stubs.js"

it.live("works", () =>
  Effect
    .gen(function*() {
      const toasts: any[] = []
      const Command = useExperimental({ toasts })

      let executed = false

      const command = Command.fn("Test Action")(
        function*() {
          expect(yield* Effect.currentSpan.pipe(Effect.map((_) => _.name))).toBe("Test Action")
          expect(command.waiting).toBe(true)

          expect(yield* CommandContext).toEqual({ action: "Test Action" })

          expect(toasts.length).toBe(0)

          return "test-value"
        },
        Effect.tap(Effect.fnUntraced(function*() {
          expect(yield* Effect.currentSpan.pipe(Effect.map((_) => _.name))).toBe("Test Action")
        })),
        Effect.tap(() =>
          Effect.currentSpan.pipe(Effect.map((_) => _.name), Effect.tap((_) => expect(_).toBe("Test Action")))
        ),
        Effect.tap(() => executed = true)
      )
      expect(command.action).toBe("Test Action")

      const r = yield* Fiber.join(command.handle())
      expect(command.waiting).toBe(false)

      expect(r).toBe("test-value") // to confirm that the initial function has ran.
      expect(executed).toBe(true) // to confirm that the combinators have ran.

      expect(command.result.pipe(Result.value)).toEqual(Option.some("test-value"))

      expect(toasts.length).toBe(0)
    }))

it.live("has custom action name", () =>
  Effect
    .gen(function*() {
      const toasts: any[] = []
      const Command = useExperimental({
        toasts,
        messages: { "action.Test Action": "Test Action Translated" }
      })

      let executed = false

      const command = Command.fn("Test Action")(
        function*() {
          expect(yield* Effect.currentSpan.pipe(Effect.map((_) => _.name))).toBe("Test Action")

          expect(yield* CommandContext).toEqual({ action: "Test Action Translated" })
          return "test-value"
        },
        Effect.tap(() => executed = true)
      )
      expect(command.action).toBe("Test Action Translated")
      const r = yield* Fiber.join(command.handle())

      expect(r).toBe("test-value") // to confirm that the initial function has ran.
      expect(executed).toBe(true) // to confirm that the combinators have ran.
    }))

it.live("can map the result", () =>
  Effect
    .gen(function*() {
      const toasts: any[] = []
      const Command = useExperimental({ toasts })

      let executed = false

      const command = Command.fn("Test Action")(
        function*() {
          expect(yield* Effect.currentSpan.pipe(Effect.map((_) => _.name))).toBe("Test Action")

          return "test-value"
        },
        Effect.map((_) => _ + _),
        Effect.tap(() => executed = true)
      )
      const r = yield* Fiber.join(command.handle())

      expect(r).toBe("test-valuetest-value") // to confirm that the initial function and map has ran.
      expect(executed).toBe(true) // to confirm that the combinators have ran.
    }))

it.live("can receive and use input", () =>
  Effect
    .gen(function*() {
      const toasts: any[] = []
      const Command = useExperimental({ toasts })

      let executed = false

      const command = Command.fn("Test Action")(
        function*(input1: number, input2: string) {
          expect(yield* Effect.currentSpan.pipe(Effect.map((_) => _.name))).toBe("Test Action")

          return { input1, input2 }
        },
        Effect.tap(() => executed = true)
      )
      const r = yield* Fiber.join(command.handle(1, "2"))

      expect(r).toEqual({ input1: 1, input2: "2" }) // to confirm that the initial function has ran and received input.
      expect(executed).toBe(true) // to confirm that the combinators have ran.
    }))

it.live("can replace the result", () =>
  Effect
    .gen(function*() {
      const toasts: any[] = []
      const Command = useExperimental({
        toasts,
        messages: { "action.Test Action": "Test Action Translated" }
      })

      let executed = false

      const command = Command.fn("Test Action")(
        function*() {
          expect(yield* Effect.currentSpan.pipe(Effect.map((_) => _.name))).toBe("Test Action")

          return "test-value"
        },
        Effect.zipRight(Effect.succeed(42)),
        Effect.tap(() => executed = true)
      )
      const r = yield* Fiber.join(command.handle())

      expect(r).toBe(42) // to confirm that the initial function and zipRight has ran.
      expect(executed).toBe(true) // to confirm that the combinators have ran.
    }))

it.live("with toasts", () =>
  Effect
    .gen(function*() {
      const toasts: any[] = []
      const Command = useExperimental({
        toasts,
        messages: DefaultIntl.en
      })

      let executed = false

      const command = Command.fn("Test Action")(
        function*() {
          expect(yield* Effect.currentSpan.pipe(Effect.map((_) => _.name))).toBe("Test Action")

          expect(toasts.length).toBe(1)
          expect(toasts[0].message).toBe("Test Action executing...")

          return "test-value"
        },
        Effect.tap(Effect.fnUntraced(function*() {
          expect(yield* Effect.currentSpan.pipe(Effect.map((_) => _.name))).toBe("Test Action")
        })),
        Effect.tap(() =>
          Effect.currentSpan.pipe(Effect.map((_) => _.name), Effect.tap((_) => expect(_).toBe("Test Action")))
        ),
        Command.withDefaultToast(),
        Effect.tap(() => executed = true)
      )

      const r = yield* Fiber.join(command.handle())

      expect(r).toBe("test-value") // to confirm that the initial function has ran.
      expect(executed).toBe(true) // to confirm that the combinators have ran.

      expect(toasts.length).toBe(1)
      expect(toasts[0].message).toBe("Test Action Success")
    }))

it.live("interrupted", () =>
  Effect
    .gen(function*() {
      let executed = false
      const toasts: any[] = []
      const Command = useExperimental({ toasts, messages: DefaultIntl.en })

      const command = Command.fn("Test Action")(
        function*() {
          expect(toasts.length).toBe(1)
          yield* Effect.interrupt
          return "test-value"
        },
        Command.withDefaultToast(),
        Effect.tap(() => executed = true)
      )

      const r = yield* Fiber.await(command.handle())

      expect(executed).toBe(false) // we were interrupted after all :)
      expect(Exit.isInterrupted(r)).toBe(true) // to confirm that the initial function has interrupted

      expect(command.waiting).toBe(false)
      expect(Exit.isInterrupted(Result.toExit(command.result))).toBe(true)
      expect(toasts.length).toBe(0) // toast is removed on interruption. TODO: maybe a nicer user experience can be had?
    }))

it.live("fail", () =>
  Effect
    .gen(function*() {
      let executed = false
      const toasts: any[] = []
      const Command = useExperimental({ toasts, messages: DefaultIntl.en })

      const command = Command.fn("Test Action")(
        function*() {
          expect(toasts.length).toBe(1)
          return yield* Effect.fail({ message: "Boom!" })
        },
        Command.withDefaultToast(),
        Effect.tap(() => executed = true)
      )

      const r = yield* Fiber.await(command.handle())

      expect(executed).toBe(false) // we failed after all :)
      expect(Exit.isFailure(r) && Cause.isFailure(r.cause)).toBe(true) // to confirm that the initial function has failed

      expect(command.waiting).toBe(false)
      expect(Exit.isFailure(Result.toExit(command.result))).toBe(true)
      expect(toasts.length).toBe(1) // toast should show error
      expect(toasts[0].message).toBe("Test Action Failed:\nBoom!")
    }))

it.live("fail and recover", () =>
  Effect
    .gen(function*() {
      let executed = false
      const toasts: any[] = []
      const Command = useExperimental({ toasts, messages: DefaultIntl.en })

      const command = Command.fn("Test Action")(
        function*() {
          expect(toasts.length).toBe(1)
          return yield* Effect.fail({ message: "Boom!" })
        },
        Effect.catchAll(() => Effect.succeed("recovered")), // we recover from the error here, so the final result is success
        Command.withDefaultToast(),
        Effect.tap(() => executed = true)
      )

      const r = yield* Fiber.join(command.handle())

      expect(executed).toBe(true) // we recovered after all :)
      expect(r).toBe("recovered") // to confirm that the initial function has failed but we recovered

      expect(command.waiting).toBe(false)
      expect(Result.toExit(command.result)).toEqual(Exit.succeed("recovered"))
      expect(toasts.length).toBe(1) // toast should show error
      expect(toasts[0].message).toBe("Test Action Success")
    }))

it.live("defect", () =>
  Effect
    .gen(function*() {
      let executed = false
      const toasts: any[] = []
      const Command = useExperimental({ toasts, messages: DefaultIntl.en })

      const command = Command.fn("Test Action")(
        function*() {
          expect(toasts.length).toBe(1)
          return yield* Effect.die({ message: "Boom!" })
        },
        Command.withDefaultToast(),
        Effect.tap(() => executed = true)
      )

      const r = yield* Fiber.await(command.handle())
      // TODO: confirm we reported error

      expect(executed).toBe(false) // we died after all :)
      expect(Exit.isFailure(r) && Cause.isDie(r.cause)).toBe(true) // to confirm that the initial function has died

      expect(command.waiting).toBe(false)
      expect(Exit.isFailure(Result.toExit(command.result))).toBe(true)
      expect(toasts.length).toBe(1) // toast should show error
      expect(toasts[0].message).toBe("Test Action unexpected error, please try again shortly.")
    }))

it.live("works with alt", () =>
  Effect
    .gen(function*() {
      const toasts: any[] = []
      const Command = useExperimental({ toasts })

      let executed = false

      const command = Command.alt("Test Action")(
        Effect.fnUntraced(
          function*() {
            expect(yield* Effect.currentSpan.pipe(Effect.map((_) => _.name))).toBe("Test Action")
            expect(command.waiting).toBe(true)

            expect(yield* CommandContext).toEqual({ action: "Test Action" })

            expect(toasts.length).toBe(0)

            return "test-value"
          },
          Effect.tap(Effect.fnUntraced(function*() {
            expect(yield* Effect.currentSpan.pipe(Effect.map((_) => _.name))).toBe("Test Action")
          })),
          Effect.tap(() =>
            Effect.currentSpan.pipe(Effect.map((_) => _.name), Effect.tap((_) => expect(_).toBe("Test Action")))
          ),
          Effect.tap(() => executed = true)
        )
      )
      expect(command.action).toBe("Test Action")

      const r = yield* Fiber.join(command.handle())
      expect(command.waiting).toBe(false)

      expect(r).toBe("test-value") // to confirm that the initial function has ran.
      expect(executed).toBe(true) // to confirm that the combinators have ran.

      expect(command.result.pipe(Result.value)).toEqual(Option.some("test-value"))

      expect(toasts.length).toBe(0)
    }))

it.live("has custom action name with alt", () =>
  Effect
    .gen(function*() {
      const toasts: any[] = []
      const Command = useExperimental({
        toasts,
        messages: { "action.Test Action": "Test Action Translated" }
      })

      let executed = false

      const command = Command.alt("Test Action")(
        Effect.fnUntraced(
          function*() {
            expect(yield* Effect.currentSpan.pipe(Effect.map((_) => _.name))).toBe("Test Action")

            expect(yield* CommandContext).toEqual({ action: "Test Action Translated" })
            return "test-value"
          },
          Effect.tap(() => executed = true)
        )
      )
      expect(command.action).toBe("Test Action Translated")
      const r = yield* Fiber.join(command.handle())

      expect(r).toBe("test-value") // to confirm that the initial function has ran.
      expect(executed).toBe(true) // to confirm that the combinators have ran.
    }))

it.live("can map the result with alt", () =>
  Effect
    .gen(function*() {
      const toasts: any[] = []
      const Command = useExperimental({ toasts })

      let executed = false

      const command = Command.alt("Test Action")(Effect.fnUntraced(
        function*() {
          expect(yield* Effect.currentSpan.pipe(Effect.map((_) => _.name))).toBe("Test Action")

          return "test-value"
        },
        Effect.map((_) => _ + _),
        Effect.tap(() => executed = true)
      ))
      const r = yield* Fiber.join(command.handle())

      expect(r).toBe("test-valuetest-value") // to confirm that the initial function and map has ran.
      expect(executed).toBe(true) // to confirm that the combinators have ran.
    }))

it.live("can receive and use input with alt", () =>
  Effect
    .gen(function*() {
      const toasts: any[] = []
      const Command = useExperimental({ toasts })

      let executed = false

      const command = Command.alt("Test Action")(
        Effect.fnUntraced(
          function*(input1: number, input2: string) {
            expect(yield* Effect.currentSpan.pipe(Effect.map((_) => _.name))).toBe("Test Action")

            return { input1, input2 }
          },
          Effect.tap(() => executed = true)
        )
      )
      const r = yield* Fiber.join(command.handle(1, "2"))

      expect(r).toEqual({ input1: 1, input2: "2" }) // to confirm that the initial function has ran and received input.
      expect(executed).toBe(true) // to confirm that the combinators have ran.
    }))

it.live("can replace the result with alt", () =>
  Effect
    .gen(function*() {
      const toasts: any[] = []
      const Command = useExperimental({
        toasts,
        messages: { "action.Test Action": "Test Action Translated" }
      })

      let executed = false

      const command = Command.alt("Test Action")(
        Effect.fnUntraced(
          function*() {
            expect(yield* Effect.currentSpan.pipe(Effect.map((_) => _.name))).toBe("Test Action")

            return "test-value"
          },
          Effect.zipRight(Effect.succeed(42)),
          Effect.tap(() => executed = true)
        )
      )
      const r = yield* Fiber.join(command.handle())

      expect(r).toBe(42) // to confirm that the initial function and zipRight has ran.
      expect(executed).toBe(true) // to confirm that the combinators have ran.
    }))

it.live("with toasts with alt", () =>
  Effect
    .gen(function*() {
      const toasts: any[] = []
      const Command = useExperimental({
        toasts,
        messages: DefaultIntl.en
      })

      let executed = false

      const command = Command.alt("Test Action")(
        Effect.fnUntraced(
          function*() {
            expect(yield* Effect.currentSpan.pipe(Effect.map((_) => _.name))).toBe("Test Action")

            expect(toasts.length).toBe(1)
            expect(toasts[0].message).toBe("Test Action executing...")

            return "test-value"
          },
          Effect.tap(Effect.fnUntraced(function*() {
            expect(yield* Effect.currentSpan.pipe(Effect.map((_) => _.name))).toBe("Test Action")
          })),
          Effect.tap(() =>
            Effect.currentSpan.pipe(Effect.map((_) => _.name), Effect.tap((_) => expect(_).toBe("Test Action")))
          ),
          Command.withDefaultToast(),
          Effect.tap(() => executed = true)
        )
      )

      const r = yield* Fiber.join(command.handle())

      expect(r).toBe("test-value") // to confirm that the initial function has ran.
      expect(executed).toBe(true) // to confirm that the combinators have ran.

      expect(toasts.length).toBe(1)
      expect(toasts[0].message).toBe("Test Action Success")
    }))

it.live("interrupted with alt", () =>
  Effect
    .gen(function*() {
      let executed = false
      const toasts: any[] = []
      const Command = useExperimental({ toasts, messages: DefaultIntl.en })

      const command = Command.alt("Test Action")(
        Effect.fnUntraced(
          function*() {
            expect(toasts.length).toBe(1)
            // @effect-diagnostics-next-line missingReturnYieldStar:off
            yield* Effect.interrupt
            return "test-value"
          },
          Command.withDefaultToast(),
          Effect.tap(() => executed = true)
        )
      )

      const r = yield* Fiber.await(command.handle())

      expect(executed).toBe(false) // we were interrupted after all :)
      expect(Exit.isInterrupted(r)).toBe(true) // to confirm that the initial function has interrupted

      expect(command.waiting).toBe(false)
      expect(Exit.isInterrupted(Result.toExit(command.result))).toBe(true)
      expect(toasts.length).toBe(0) // toast is removed on interruption. TODO: maybe a nicer user experience can be had?
    }))

it.live("fail with alt", () =>
  Effect
    .gen(function*() {
      let executed = false
      const toasts: any[] = []
      const Command = useExperimental({ toasts, messages: DefaultIntl.en })

      const command = Command.alt("Test Action")(
        Effect.fnUntraced(
          function*() {
            expect(toasts.length).toBe(1)
            return yield* Effect.fail({ message: "Boom!" })
          },
          Command.withDefaultToast(),
          Effect.tap(() => executed = true)
        )
      )

      const r = yield* Fiber.await(command.handle())

      expect(executed).toBe(false) // we failed after all :)
      expect(Exit.isFailure(r) && Cause.isFailure(r.cause)).toBe(true) // to confirm that the initial function has failed

      expect(command.waiting).toBe(false)
      expect(Exit.isFailure(Result.toExit(command.result))).toBe(true)
      expect(toasts.length).toBe(1) // toast should show error
      expect(toasts[0].message).toBe("Test Action Failed:\nBoom!")
    }))

it.live("fail and recover with alt", () =>
  Effect
    .gen(function*() {
      let executed = false
      const toasts: any[] = []
      const Command = useExperimental({ toasts, messages: DefaultIntl.en })

      const command = Command.alt("Test Action")(
        Effect.fnUntraced(
          function*() {
            expect(toasts.length).toBe(1)
            return yield* Effect.fail({ message: "Boom!" })
          },
          Effect.catchAll(() => Effect.succeed("recovered")), // we recover from the error here, so the final result is success
          Command.withDefaultToast(),
          Effect.tap(() => executed = true)
        )
      )

      const r = yield* Fiber.join(command.handle())

      expect(executed).toBe(true) // we recovered after all :)
      expect(r).toBe("recovered") // to confirm that the initial function has failed but we recovered

      expect(command.waiting).toBe(false)
      expect(Result.toExit(command.result)).toEqual(Exit.succeed("recovered"))
      expect(toasts.length).toBe(1) // toast should show error
      expect(toasts[0].message).toBe("Test Action Success")
    }))

it.live("defect with alt", () =>
  Effect
    .gen(function*() {
      let executed = false
      const toasts: any[] = []
      const Command = useExperimental({ toasts, messages: DefaultIntl.en })

      const command = Command.alt("Test Action")(
        Effect.fnUntraced(
          function*() {
            expect(toasts.length).toBe(1)
            return yield* Effect.die({ message: "Boom!" })
          },
          Command.withDefaultToast(),
          Effect.tap(() => executed = true)
        )
      )

      const r = yield* Fiber.await(command.handle())
      // TODO: confirm we reported error

      expect(executed).toBe(false) // we died after all :)
      expect(Exit.isFailure(r) && Cause.isDie(r.cause)).toBe(true) // to confirm that the initial function has died

      expect(command.waiting).toBe(false)
      expect(Exit.isFailure(Result.toExit(command.result))).toBe(true)
      expect(toasts.length).toBe(1) // toast should show error
      expect(toasts[0].message).toBe("Test Action unexpected error, please try again shortly.")
    }))

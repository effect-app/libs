import { it } from "@effect/vitest"
import * as Effect from "effect-app/Effect"
import * as Deferred from "effect/Deferred"
import * as Exit from "effect/Exit"
import * as Fiber from "effect/Fiber"
import { TestClock } from "effect/testing"
import { DefaultIntl } from "../src/commander.js"
import { useExperimentalE } from "./stubs.js"

const unwrap = <A, E>(r: Fiber.Fiber<Exit.Exit<A, E>, never>) => Fiber.join(r).pipe(Effect.flatten)

const infoToasts = (toasts: ReadonlyArray<{ type: string }>) => toasts.filter((toast) => toast.type === "info")

describe("Command.suspendWaiting", () => {
  it.effect("hides the spinner and the waiting toast until work resumes", () =>
    Effect.gen(function* () {
      const toasts: Array<{ type: string; message: string }> = []
      const Command = yield* useExperimentalE({ toasts, messages: DefaultIntl.en })
      const toastVisible = yield* Deferred.make<void>()
      const continueToDialog = yield* Deferred.make<void>()
      const suspended = yield* Deferred.make<void>()
      const release = yield* Deferred.make<void>()
      const resumed = yield* Deferred.make<void>()

      const command = Command.fn("Test Action")(function* () {
        yield* Effect.sleep("1100 millis")
        yield* Deferred.succeed(toastVisible, undefined)
        yield* Deferred.await(continueToDialog)
        yield* Command.suspendWaiting(
          Effect.gen(function* () {
            yield* Deferred.succeed(suspended, undefined)
            return yield* Deferred.await(release)
          })
        )
        yield* Deferred.succeed(resumed, undefined)
        expect(infoToasts(toasts)).toHaveLength(0)
        yield* Effect.sleep("1100 millis")
        expect(infoToasts(toasts)).toHaveLength(1)
        return "done"
      }, Command.withDefaultToast())

      const fiber = command.handle(undefined)
      yield* TestClock.adjust("1100 millis")
      yield* Deferred.await(toastVisible)
      expect(command.waiting).toBe(true)
      expect(command.blocked).toBe(true)
      expect(infoToasts(toasts)).toHaveLength(1)

      yield* Deferred.succeed(continueToDialog, undefined)
      yield* Deferred.await(suspended)
      expect(command.waiting).toBe(false)
      expect(command.blocked).toBe(true)
      expect(infoToasts(toasts)).toHaveLength(0)

      yield* TestClock.adjust("2 seconds")
      expect(infoToasts(toasts)).toHaveLength(0)
      expect(command.waiting).toBe(false)

      yield* Deferred.succeed(release, undefined)
      yield* Deferred.await(resumed)
      expect(command.waiting).toBe(true)
      expect(command.blocked).toBe(true)

      yield* TestClock.adjust("1100 millis")
      expect(yield* unwrap(fiber)).toBe("done")
      expect(toasts.map((toast) => toast.type)).toEqual(["success"])
    })
  )

  it.effect("stays quiet for a suspension that starts the command", () =>
    Effect.gen(function* () {
      const toasts: Array<{ type: string; message: string }> = []
      const Command = yield* useExperimentalE({ toasts, messages: DefaultIntl.en })
      const suspended = yield* Deferred.make<void>()
      const release = yield* Deferred.make<string>()
      const resumed = yield* Deferred.make<void>()

      const command = Command.fn("Test Action")(function* () {
        const answer = yield* Command.suspendWaiting(
          Effect.gen(function* () {
            yield* Deferred.succeed(suspended, undefined)
            return yield* Deferred.await(release)
          })
        )
        yield* Deferred.succeed(resumed, undefined)
        expect(infoToasts(toasts)).toHaveLength(0)
        yield* Effect.sleep("1100 millis")
        expect(infoToasts(toasts)).toHaveLength(1)
        return answer
      }, Command.withDefaultToast())

      const fiber = command.handle(undefined)
      yield* Deferred.await(suspended)
      expect(command.waiting).toBe(false)
      expect(command.blocked).toBe(true)

      yield* TestClock.adjust("2 seconds")
      expect(infoToasts(toasts)).toHaveLength(0)

      yield* Deferred.succeed(release, "yes")
      yield* Deferred.await(resumed)
      expect(command.waiting).toBe(true)

      yield* TestClock.adjust("1100 millis")
      expect(yield* unwrap(fiber)).toBe("yes")
      expect(toasts.map((toast) => toast.type)).toEqual(["success"])
    })
  )

  it.effect("drops the block when the suspension is interrupted", () =>
    Effect.gen(function* () {
      const toasts: Array<{ type: string }> = []
      const Command = yield* useExperimentalE({ toasts, messages: DefaultIntl.en })
      const suspended = yield* Deferred.make<void>()

      const release = yield* Deferred.make<void>()

      const command = Command.fn("Test Action")(function* () {
        return yield* Command.suspendWaiting(
          Effect.gen(function* () {
            yield* Deferred.succeed(suspended, undefined)
            yield* Deferred.await(release)
            return yield* Effect.interrupt
          })
        )
      }, Command.withDefaultToast())

      const fiber = command.handle(undefined)
      yield* Deferred.await(suspended)
      expect(command.waiting).toBe(false)
      expect(command.blocked).toBe(true)
      expect(toasts).toHaveLength(0)

      yield* Deferred.succeed(release, undefined)
      const exit = yield* Fiber.join(fiber)
      expect(Exit.hasInterrupts(exit)).toBe(true)
      expect(command.waiting).toBe(false)
      expect(command.blocked).toBe(false)
      expect(toasts).toHaveLength(0)
    })
  )
})

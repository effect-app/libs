import { expect, it } from "@effect/vitest"
import { type Req, type RequestHandlerWithInput } from "effect-app/client"
import * as DataDependencies from "effect-app/DataDependencies"
import * as Effect from "effect-app/Effect"
import * as Exit from "effect/Exit"
import * as Fiber from "effect/Fiber"
import { TestClock } from "effect/testing"
import { invalidateQueries } from "../src/mutate.js"

const dependency = DataDependencies.repo("FrontendRepo")

const commandHandler = <
  Id extends string,
  R
>(id: Id, handler: (input: undefined) => Effect.Effect<void, never, R>): RequestHandlerWithInput<
  undefined,
  void,
  never,
  R,
  Req,
  Id
> => ({ id, Request: undefined as never, handler })

it.effect("forwards recorded write dependencies to the query invalidator", () =>
  Effect.gen(function*() {
    const recorded: Array<ReadonlyArray<DataDependencies.DataDependency>> = []
    const mutate = invalidateQueries(
      commandHandler("Admin.Save", () => DataDependencies.write(dependency)),
      undefined,
      {
        invalidateAndAwait: (_keys, writeDependencies) =>
          Effect.sync(() => {
            recorded.push(writeDependencies ?? [])
          })
      }
    )
    const fiber = yield* Effect.forkChild(mutate(DataDependencies.write(dependency), undefined))
    yield* TestClock.adjust("1 millis")
    const result = yield* Fiber.join(fiber)

    expect(result).toBeUndefined()
    expect(recorded.some((writes) => writes.some((d) => d.type === "repo" && d.name === "FrontendRepo"))).toBe(true)
  }))

it.effect("forwards empty write dependencies when the command records none", () =>
  Effect.gen(function*() {
    const recorded: Array<ReadonlyArray<DataDependencies.DataDependency>> = []
    const mutate = invalidateQueries(
      commandHandler("Admin.Noop", () => Effect.void),
      undefined,
      {
        invalidateAndAwait: (_keys, writeDependencies) =>
          Effect.sync(() => {
            recorded.push(writeDependencies ?? [])
          })
      }
    )
    const fiber = yield* Effect.forkChild(mutate(Effect.void, undefined))
    yield* TestClock.adjust("1 millis")
    const result = yield* Fiber.join(fiber)

    expect(Exit.isSuccess(Exit.succeed(result))).toBe(true)
    expect(recorded).toEqual([[]])
  }))

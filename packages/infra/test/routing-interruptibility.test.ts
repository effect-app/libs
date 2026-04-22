import { describe, expect, it } from "@effect/vitest"
import { Effect, Fiber, Layer, Ref } from "effect"
import { S } from "effect-app"
import { ConfigureInterruptibilityMiddleware } from "effect-app/middleware"
import { Rpc, RpcGroup, RpcTest } from "effect/unstable/rpc"
import { applyRequestTypeInterruptibility } from "../src/api/routing.js"
import { ConfigureInterruptibilityMiddlewareLive, RequestType } from "../src/api/routing/middleware.js"

const InterruptibilityRpcs = RpcGroup.make(
  Rpc
    .make("doCommand", { success: S.Void })
    .annotate(RequestType, "command")
    .middleware(ConfigureInterruptibilityMiddleware),
  Rpc
    .make("doQuery", { success: S.Void })
    .annotate(RequestType, "query")
    .middleware(ConfigureInterruptibilityMiddleware)
)

const makeImplLayer = (commandDone: Ref.Ref<boolean>, queryDone: Ref.Ref<boolean>) =>
  InterruptibilityRpcs.toLayer({
    doCommand: () =>
      applyRequestTypeInterruptibility(
        "command",
        Effect.sleep("120 millis").pipe(Effect.andThen(Ref.set(commandDone, true)))
      ),
    doQuery: () =>
      applyRequestTypeInterruptibility(
        "query",
        Effect.sleep("120 millis").pipe(Effect.andThen(Ref.set(queryDone, true)))
      )
  })

describe("routing interruptibility", () => {
  it.live(
    "e2e: command continues after client interrupt, query does not",
    () =>
      Effect.gen(function*() {
        const commandDone = yield* Ref.make(false)
        const queryDone = yield* Ref.make(false)

        const client = yield* RpcTest
          .makeClient(InterruptibilityRpcs)
          .pipe(
            Effect.provide(
              Layer.mergeAll(makeImplLayer(commandDone, queryDone), ConfigureInterruptibilityMiddlewareLive)
            )
          )

        const commandFiber = yield* Effect.forkDetach(client.doCommand())
        yield* Effect.sleep("20 millis")
        yield* Fiber.interrupt(commandFiber)
        yield* Effect.sleep("180 millis")
        expect(yield* Ref.get(commandDone)).toBe(true)

        const queryFiber = yield* Effect.forkDetach(client.doQuery())
        yield* Effect.sleep("20 millis")
        yield* Fiber.interrupt(queryFiber)
        yield* Effect.sleep("180 millis")
        expect(yield* Ref.get(queryDone)).toBe(false)
      })
  )
})

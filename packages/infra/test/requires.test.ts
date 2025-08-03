import { it } from "@effect/vitest"
import { Effect, S } from "effect-app"
import { Middleware } from "../src/api/routing.js"
import { AllowAnonymous, type RequestContextMap, RequireRoles, SomeService, Test } from "./fixtures.js"
import { makeNewMiddleware } from "./requires.js"

export class SomeMiddleware extends Middleware.Tag<SomeMiddleware>()("SomeMiddleware", {
  provides: SomeService,
  wrap: true
})({
  effect: Effect.gen(function*() {
    // yield* Effect.context<"test-dep">()
    return ({ next }) =>
      Effect.gen(function*() {
        // yield* Effect.context<"test-dep2">()
        return yield* next.pipe(Effect.provideService(SomeService, new SomeService({ a: 1 })))
      })
  })
}) {
}

export class RequiresSomeMiddleware extends Middleware.Tag<RequiresSomeMiddleware>()("RequiresSomeMiddleware", {
  requires: SomeService,
  wrap: true
})({
  effect: Effect.gen(function*() {
    // yield* Effect.context<"test-dep">()
    return ({ next }) =>
      Effect.gen(function*() {
        yield* SomeService
        // yield* Effect.context<"test-dep2">()
        return yield* next
      })
  })
}) {
}

it("requires gets enforced", async () => {
  const middleware3 = makeNewMiddleware<RequestContextMap>()
    .middleware(RequiresSomeMiddleware)
    .middleware(SomeMiddleware)
    .addDynamicMiddleware(AllowAnonymous)
    .addDynamicMiddleware(RequireRoles)
    .addDynamicMiddleware(Test)

  await Effect
    .gen(function*() {
      const mw = yield* middleware3
      const mwM = mw.effect(Object.assign({}, S.Any, { config: {} }), (req) => Effect.void, "some-module")
      const v = yield* mwM({}, {})
    })
    .pipe(
      Effect.scoped,
      Effect.provide(middleware3.Default),
      Effect.runPromise
    )
})

import { expectTypeOf, it } from "@effect/vitest"
import { Effect, Layer, S } from "effect-app"
import { Middleware } from "../src/api/routing.js"
import { AllowAnonymous, type RequestContextMap, RequireRoles, Some, SomeElse, Test } from "./fixtures.js"
import { makeNewMiddleware } from "./requires.js"

export class SomeMiddleware extends Middleware.Tag<SomeMiddleware>()("SomeMiddleware", {
  provides: Some,
  wrap: true
})({
  effect: Effect.gen(function*() {
    // yield* Effect.context<"test-dep">()
    return ({ next }) =>
      Effect.gen(function*() {
        // yield* Effect.context<"test-dep2">()
        return yield* next.pipe(Effect.provideService(Some, new Some({ a: 1 })))
      })
  })
}) {
}

export class SomeElseMiddleware extends Middleware.Tag<SomeElseMiddleware>()("SomeElseMiddleware", {
  provides: SomeElse,
  wrap: true
})({
  effect: Effect.gen(function*() {
    // yield* Effect.context<"test-dep">()
    return ({ next }) =>
      Effect.gen(function*() {
        // yield* Effect.context<"test-dep2">()
        return yield* next.pipe(Effect.provideService(SomeElse, new SomeElse({ b: 2 })))
      })
  })
}) {
}

export class RequiresSomeMiddleware extends Middleware.Tag<RequiresSomeMiddleware>()("RequiresSomeMiddleware", {
  requires: Some,
  wrap: true
})({
  effect: Effect.gen(function*() {
    // yield* Effect.context<"test-dep">()
    return ({ next }) =>
      Effect.gen(function*() {
        yield* Some
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
    .middleware(SomeElseMiddleware)
    .addDynamicMiddleware(RequireRoles)
    .addDynamicMiddleware(Test)

  type LayerContext = Layer.Layer.Context<typeof middleware3["Default"]>
  expectTypeOf({} as LayerContext).toEqualTypeOf<Some>()

  await Effect
    .gen(function*() {
      const mw = yield* middleware3
      const mwM = mw.effect(Object.assign({}, S.Any, { config: {} }), (req) => Effect.void, "some-module")
      const v = yield* mwM({}, { "x-user": "test-user" })
    })
    .pipe(
      Effect.scoped,
      Effect.provide(middleware3.Default.pipe(Layer.provide(Layer.succeed(Some, new Some({ a: 1 }))))),
      Effect.runPromise
    )
})

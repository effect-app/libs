import { expectTypeOf, it } from "@effect/vitest"
import { Effect, Layer, S } from "effect-app"
import { makeMiddleware, Middleware } from "../src/api/routing.js"
import { AllowAnonymous, type RequestContextMap, RequireRoles, Some, SomeElse, Test } from "./fixtures.js"

export class SomeMiddleware extends Middleware.Tag<SomeMiddleware>()("SomeMiddleware", {
  provides: Some
})({
  effect: Effect.gen(function*() {
    // yield* Effect.context<"test-dep">()
    return () =>
      Effect.gen(function*() {
        return new Some({ a: 1 })
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
  requires: [Some],
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
  const middleware3 = makeMiddleware<RequestContextMap>()
    .middleware(RequiresSomeMiddleware)
    .middleware(SomeMiddleware)
    .middleware(AllowAnonymous, RequireRoles)
    .middleware(SomeElseMiddleware)
    .middleware(Test)

  type Default = typeof middleware3["Default"]
  type LayerContext = Layer.Layer.Context<Default>
  expectTypeOf({} as LayerContext).toEqualTypeOf<Some>()

  await Effect
    .gen(function*() {
      const mw = yield* middleware3
      const mwM = mw.effect(Object.assign({}, S.Any, { config: {} }), (_req) => Effect.void, "some-module")
      yield* mwM({}, { "x-user": "test-user" })
      // console.log({ v })
    })
    .pipe(
      Effect.scoped,
      Effect.provide(middleware3.Default.pipe(Layer.provide(Layer.succeed(Some, new Some({ a: 1 }))))),
      Effect.runPromise
    )
})

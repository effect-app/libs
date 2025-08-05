import { expect, expectTypeOf, it } from "@effect/vitest"
import { Effect, Either, Layer, S } from "effect-app"
import { NotLoggedInError, UnauthorizedError } from "effect-app/client"
import { makeMiddleware, Middleware } from "../src/api/routing.js"
import { AllowAnonymous, RequestContextMap, RequireRoles, Some, SomeElse, Test } from "./fixtures.js"

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

// functionally equivalent to the one above
export class SomeMiddlewareWrap extends Middleware.Tag<SomeMiddlewareWrap>()("SomeMiddlewareWrap", {
  provides: Some,
  wrap: true
})({
  effect: Effect.gen(function*() {
    // yield* Effect.context<"test-dep">()
    return ({ next }) => next.pipe(Effect.provideService(Some, new Some({ a: 1 })))
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
  const middleware3 = makeMiddleware(RequestContextMap)
    .middleware(RequiresSomeMiddleware)
    .middleware(SomeMiddleware)
    .middleware(RequireRoles)
    .middleware(AllowAnonymous, Test)
    .middleware(SomeElseMiddleware)

  const _middleware3Bis = makeMiddleware(RequestContextMap)
    .middleware(RequiresSomeMiddleware)
    .middleware(SomeMiddlewareWrap)
    .middleware(RequireRoles)
    .middleware(AllowAnonymous, Test)
    .middleware(SomeElseMiddleware)

  expectTypeOf(middleware3).toEqualTypeOf<typeof _middleware3Bis>()

  const layer = middleware3.Default.pipe(Layer.provide(Layer.succeed(Some, new Some({ a: 1 }))))

  type Default = typeof middleware3["Default"]
  type LayerContext = Layer.Layer.Context<Default>
  expectTypeOf({} as LayerContext).toEqualTypeOf<Some>()

  await Effect
    .gen(function*() {
      const mw = yield* middleware3
      const mwM = mw.effect(
        Object.assign({}, S.Any, { config: { requireRoles: ["manager"] } }),
        (_req) => Effect.void,
        "some-module"
      )
      yield* mwM({}, { "x-user": "test-user", "x-is-manager": "true" })
    })
    .pipe(
      Effect.scoped,
      Effect.provide(layer),
      Effect.runPromise
    )

  await Effect
    .gen(function*() {
      const mw = yield* middleware3
      const mwM = mw.effect(
        Object.assign({}, S.Any, { config: { allowAnonymous: true } }),
        (_req) => Effect.void,
        "some-module"
      )
      yield* mwM({}, {})
    })
    .pipe(
      Effect.scoped,
      Effect.provide(layer),
      Effect.runPromise
    )

  expect(
    await Effect
      .gen(function*() {
        const mw = yield* middleware3
        const mwM = mw.effect(
          Object.assign({}, S.Any, { config: {} }),
          (_req) => Effect.void,
          "some-module"
        )
        yield* mwM({}, {})
      })
      .pipe(
        Effect.scoped,
        Effect.provide(layer),
        Effect.either,
        Effect.runPromise
      )
  )
    .toEqual(Either.left(new NotLoggedInError()))

  expect(
    await Effect
      .gen(function*() {
        const mw = yield* middleware3
        const mwM = mw.effect(
          Object.assign({}, S.Any, { config: { requireRoles: ["manager"] } }),
          (_req) => Effect.void,
          "some-module"
        )
        yield* mwM({}, {})
      })
      .pipe(
        Effect.scoped,
        Effect.provide(layer),
        Effect.either,
        Effect.runPromise
      )
  )
    .toEqual(Either.left(new NotLoggedInError()))

  expect(
    await Effect
      .gen(function*() {
        const mw = yield* middleware3
        const mwM = mw.effect(
          Object.assign({}, S.Any, { config: { requireRoles: ["manager"] } }),
          (_req) => Effect.void,
          "some-module"
        )
        yield* mwM({}, { "x-user": "test-user" })
      })
      .pipe(
        Effect.scoped,
        Effect.provide(layer),
        Effect.either,
        Effect.runPromise
      )
  )
    .toEqual(Either.left(new UnauthorizedError({ message: "don't have the right roles" })))
})

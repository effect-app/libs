import { describe, expect, expectTypeOf, it } from "@effect/vitest"
import { Context, Effect, Either, Layer } from "effect-app"
import { NotLoggedInError, UnauthorizedError } from "effect-app/client"
import { makeMiddleware, Middleware } from "../src/api/routing.js"
import { AllowAnonymous, RequestContextMap, RequireRoles, Some, SomeElse, SomeService, Test } from "./fixtures.js"

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

const middleware3 = makeMiddleware(RequestContextMap)
  .middleware(RequiresSomeMiddleware)
  .middleware(SomeMiddleware)
  .middleware(RequireRoles)
  .middleware(AllowAnonymous, Test)
  .middleware(SomeElseMiddleware)

const _middlewareSideways = makeMiddleware(RequestContextMap)
  .middleware(RequiresSomeMiddleware)
  .middleware(SomeMiddleware)
  .middleware(RequireRoles, AllowAnonymous, Test)
  .middleware(SomeElseMiddleware)

const _middlewareSidewaysFully = makeMiddleware(RequestContextMap)
  .middleware(RequiresSomeMiddleware, SomeMiddleware, RequireRoles, AllowAnonymous, Test, SomeElseMiddleware)

const _middleware3Bis = makeMiddleware(RequestContextMap)
  .middleware(RequiresSomeMiddleware)
  .middleware(SomeMiddlewareWrap)
  .middleware(RequireRoles)
  .middleware(AllowAnonymous, Test)
  .middleware(SomeElseMiddleware)

expectTypeOf(_middlewareSideways).toEqualTypeOf<typeof middleware3>()
expectTypeOf(_middlewareSidewaysFully).toEqualTypeOf<typeof _middlewareSideways>()
expectTypeOf(_middleware3Bis).toEqualTypeOf<typeof middleware3>()

type Default = typeof middleware3["Default"]
type LayerContext = Layer.Layer.Context<Default>
expectTypeOf({} as LayerContext).toEqualTypeOf<SomeService>()

const testSuite = (_mw: typeof middleware3) =>
  describe("middleware" + _mw, () => {
    it.effect(
      "works",
      Effect.fn(function*() {
        const defaultReq = {
          headers: {},
          clientId: 0,
          rpc: { _tag: "Test", key: "test", annotations: Context.make(_mw.requestContext, {}) },
          next: Effect.void
        }
        const layer = _mw.Default.pipe(Layer.provide(SomeService.toLayer()))
        yield* Effect
          .gen(function*() {
            const mw = yield* _mw
            const mwM = mw(
              Object.assign({ ...defaultReq }, {
                headers: { "x-user": "test-user", "x-is-manager": "true" },
                rpc: { ...defaultReq.rpc, annotations: Context.make(_mw.requestContext, { requireRoles: ["manager"] }) }
              })
            )
            yield* mwM
          })
          .pipe(
            Effect.scoped,
            Effect.provide(layer)
          )

        expect(
          yield* Effect
            .gen(function*() {
              const mw = yield* _mw
              const mwM = mw(
                Object.assign({ ...defaultReq }, {})
              )
              yield* mwM
            })
            .pipe(
              Effect.scoped,
              Effect.provide(layer),
              Effect.either
            )
        )
          .toEqual(Either.left(new NotLoggedInError()))

        expect(
          yield* Effect
            .gen(function*() {
              const mw = yield* _mw
              const mwM = mw(
                Object.assign({ ...defaultReq }, {
                  rpc: {
                    ...defaultReq.rpc,
                    annotations: Context.make(_mw.requestContext, { requireRoles: ["manager"] })
                  }
                })
              )
              yield* mwM
            })
            .pipe(
              Effect.scoped,
              Effect.provide(layer),
              Effect.either
            )
        )
          .toEqual(Either.left(new NotLoggedInError()))

        expect(
          yield* Effect
            .gen(function*() {
              const mw = yield* _mw
              const mwM = mw(
                Object.assign({ ...defaultReq }, { headers: { "x-user": "test-user" } }, {
                  rpc: {
                    ...defaultReq.rpc,
                    annotations: Context.make(_mw.requestContext, { requireRoles: ["manager"] })
                  }
                })
              )
              yield* mwM
            })
            .pipe(
              Effect.scoped,
              Effect.provide(layer),
              Effect.either
            )
        )
          .toEqual(Either.left(new UnauthorizedError({ message: "don't have the right roles" })))
      })
    )
  })

testSuite(middleware3)
testSuite(_middleware3Bis)
testSuite(_middlewareSideways)
testSuite(_middlewareSidewaysFully)

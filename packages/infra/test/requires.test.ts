import { Rpc } from "@effect/rpc"
import { type SuccessValue } from "@effect/rpc/RpcMiddleware"
import { describe, expect, expectTypeOf, it } from "@effect/vitest"
import { Context, Effect, Either, Layer, S } from "effect-app"
import { NotLoggedInError, UnauthorizedError } from "effect-app/client"
import { HttpHeaders } from "effect-app/http"
import { makeMiddleware, Middleware } from "../src/api/routing.js"
import { AllowAnonymous, RequestContextMap, RequireRoles, Some, SomeElseMiddleware, SomeElseMiddleware, SomeMiddleware, SomeMiddlewareWrap, SomeService, Test } from "./fixtures.js"

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
// expectTypeOf(_middleware3Bis).toEqualTypeOf<typeof middleware3>() // is not the same because SomeMiddlewareWrap is not SomeMiddleware

type Default = typeof middleware3["Default"]
type LayerContext = Layer.Layer.Context<Default>
expectTypeOf({} as LayerContext).toEqualTypeOf<SomeService>()

class TestRequest extends S.TaggedRequest<Test>("Test")("Test", {
  payload: {},
  success: S.Void,
  failure: S.Never
}) {}

const testSuite = (_mw: typeof middleware3) =>
  describe("middleware" + _mw, () => {
    it.effect(
      "works",
      Effect.fn(function*() {
        const defaultReq = {
          headers: HttpHeaders.unsafeFromRecord({}),
          payload: { _tag: "Test" },
          clientId: 0,
          rpc: { ...Rpc.fromTaggedRequest(TestRequest), annotations: Context.make(_mw.requestContext, {}) },
          next: Effect.void as unknown as Effect<SuccessValue, never, any>
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

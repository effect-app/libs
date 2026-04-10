import { describe, expect, expectTypeOf, it } from "@effect/vitest"
import { Context, Effect, Layer, Result, S } from "effect-app"
import { NotLoggedInError, UnauthorizedError } from "effect-app/client"
import { HttpHeaders } from "effect-app/http"
import * as RpcX from "effect-app/rpc"
import { MiddlewareMaker } from "effect-app/rpc"
import type { unhandled } from "effect-app/Types"
import { Rpc } from "effect/unstable/rpc"
import { type SuccessValue } from "effect/unstable/rpc/RpcMiddleware"
import { AllowAnonymous, AllowAnonymousLive, RequestContextMap, RequireRoles, RequireRolesLive, Some, SomeElseMiddleware, SomeElseMiddlewareLive, SomeMiddleware, SomeMiddlewareLive, SomeService, Test, TestLive } from "./fixtures.js"

export class RequiresSomeMiddleware
  extends RpcX.RpcMiddleware.Tag<RequiresSomeMiddleware, { requires: Some }>()("RequiresSomeMiddleware")
{
  static Default = Layer.make(this, {
    *make() {
      // yield* Effect.context<"test-dep">()
      return Effect.fnUntraced(function*(effect) {
        yield* Some
        // yield* Effect.context<"test-dep2">()
        return yield* effect
      })
    }
  })
}

const middleware3 = MiddlewareMaker
  .Tag()("middleware", RequestContextMap)
  .middleware(RequiresSomeMiddleware)
  .middleware(SomeMiddleware)
  .middleware(RequireRoles)
  .middleware(AllowAnonymous, Test)
  .middleware(SomeElseMiddleware)

const _middlewareSideways = MiddlewareMaker
  .Tag()("middleware", RequestContextMap)
  .middleware(RequiresSomeMiddleware)
  .middleware(SomeMiddleware)
  .middleware(RequireRoles, AllowAnonymous, Test)
  .middleware(SomeElseMiddleware)

const _middlewareSidewaysFully = MiddlewareMaker
  .Tag()("middleware", RequestContextMap)
  .middleware(RequiresSomeMiddleware, SomeMiddleware, RequireRoles, AllowAnonymous, Test, SomeElseMiddleware)

export const _middleware3Bis = MiddlewareMaker
  .Tag()("middleware", RequestContextMap)
  .middleware(RequiresSomeMiddleware)
  .middleware(SomeMiddleware)
  .middleware(RequireRoles)
  .middleware(AllowAnonymous, Test)
  .middleware(SomeElseMiddleware)

expectTypeOf(_middlewareSideways).toEqualTypeOf<typeof middleware3>()
expectTypeOf(_middlewareSidewaysFully).toEqualTypeOf<typeof _middlewareSideways>()
expectTypeOf(_middleware3Bis).toEqualTypeOf<typeof middleware3>()

const TestRpc = Rpc.make("Test", { success: S.Void })

const testSuite = (_mw: typeof middleware3) =>
  describe("middleware" + _mw, () => {
    it.effect(
      "works",
      Effect.fn(function*() {
        const defaultOpts = {
          client: null as any, // TODO?
          headers: HttpHeaders.fromRecordUnsafe({}),
          payload: { _tag: "Test" },
          clientId: 0,
          requestId: "test-id" as any,
          rpc: { ...TestRpc, annotations: Context.make(_mw.requestContext, {}) }
        }
        const next = Effect.void as unknown as Effect.Effect<SuccessValue, unhandled, never>
        const layer = _mw.layer.pipe(
          Layer.provide([
            RequiresSomeMiddleware.Default,
            SomeMiddlewareLive,
            RequireRolesLive.pipe(Layer.provide(SomeService.toLayer(SomeService.make))),
            AllowAnonymousLive,
            TestLive,
            SomeElseMiddlewareLive
          ])
        )
        yield* Effect
          .gen(function*() {
            const mw = yield* _mw
            const mwM = mw(
              next,
              Object.assign({ ...defaultOpts }, {
                headers: HttpHeaders.fromRecordUnsafe({ "x-user": "test-user", "x-is-manager": "true" }),
                rpc: {
                  ...defaultOpts.rpc,
                  annotations: Context.make(_mw.requestContext, { requireRoles: ["manager"] })
                }
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
                next,
                Object.assign({ ...defaultOpts }, {})
              )
              yield* mwM
            })
            .pipe(
              Effect.scoped,
              Effect.provide(layer),
              Effect.result
            )
        )
          .toEqual(Result.fail(new NotLoggedInError()))

        expect(
          yield* Effect
            .gen(function*() {
              const mw = yield* _mw
              const mwM = mw(
                next,
                Object.assign({ ...defaultOpts }, {
                  rpc: {
                    ...defaultOpts.rpc,
                    annotations: Context.make(_mw.requestContext, { requireRoles: ["manager"] })
                  }
                })
              )
              yield* mwM
            })
            .pipe(
              Effect.scoped,
              Effect.provide(layer),
              Effect.result
            )
        )
          .toEqual(Result.fail(new NotLoggedInError()))

        expect(
          yield* Effect
            .gen(function*() {
              const mw = yield* _mw
              const mwM = mw(
                next,
                Object.assign(
                  { ...defaultOpts },
                  { headers: HttpHeaders.fromRecordUnsafe({ "x-user": "test-user" }) },
                  {
                    rpc: {
                      ...defaultOpts.rpc,
                      annotations: Context.make(_mw.requestContext, { requireRoles: ["manager"] })
                    }
                  }
                )
              )
              yield* mwM
            })
            .pipe(
              Effect.scoped,
              Effect.provide(layer),
              Effect.result
            )
        )
          .toEqual(Result.fail(new UnauthorizedError({ message: "don't have the right roles" })))
      })
    )
  })

testSuite(middleware3)
// testSuite(_middleware3Bis)
testSuite(_middlewareSideways)
testSuite(_middlewareSidewaysFully)

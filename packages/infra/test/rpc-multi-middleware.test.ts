import { FetchHttpClient } from "@effect/platform"
import { NodeHttpServer } from "@effect/platform-node"
import { RpcClient, RpcGroup, RpcSerialization, RpcServer, RpcTest } from "@effect/rpc"
import { expect, expectTypeOf, it } from "@effect/vitest"
import { Console, Effect, Either, Layer } from "effect"
import { S } from "effect-app"
import { NotLoggedInError } from "effect-app/client"
import { HttpLayerRouter } from "effect-app/http"
import { createServer } from "http"
import { DefaultGenericMiddlewaresLive, makeMiddleware, middlewareGroup } from "../src/api/routing.js"
import { DefaultGenericMiddlewares } from "../src/api/routing/middleware/middleware-native.js"
import { AllowAnonymous, AllowAnonymousLive, RequestContextMap, RequireRoles, RequireRolesLive, Some, SomeElseMiddleware, SomeElseMiddlewareLive, SomeMiddlewareWrap, SomeMiddlewareWrapLive, SomeService, Test, TestLive, UserProfile } from "./fixtures.js"

const middleware = makeMiddleware(RequestContextMap)
  .middleware(RequireRoles)
  .middleware(AllowAnonymous, Test)
  .middleware(SomeElseMiddleware, SomeMiddlewareWrap)
  .middleware(...DefaultGenericMiddlewares)

const UserRpcs = middlewareGroup(middleware)(RpcGroup
  .make(
    middleware.rpc("getUser", {
      success: S.Literal("awesome")
    }),
    middleware.rpc("doSomething", {
      success: S.Literal("also-awesome"),
      config: { allowAnonymous: true }
    })
  ))

const impl = Effect
  .gen(function*() {
    const impl = UserRpcs
      .toLayerDynamic({
        getUser: Effect.fn(function*(_payload, _headers) {
          yield* Some
          yield* UserProfile // we only access it while protected by allowAnonymous: false
          return "awesome" as const
        }),
        doSomething: Effect.fn(function*() {
          console.log(yield* Effect.serviceOption(UserProfile)) // we access it optionally, while allowAnonymous: true
          return "also-awesome" as const
        })
      })
    return impl
  })
  .pipe(Layer.unwrapEffect)

expectTypeOf<Layer.Layer.Context<typeof impl>>().toEqualTypeOf<never>()

const UserRpcsBad = middlewareGroup(middleware)(RpcGroup
  .make(
    middleware.rpc("doSomethingElse", {
      success: S.Literal("also-awesome2"),
      config: { allowAnonymous: true }
    })
  ))
export const badImpl = Effect
  .gen(function*() {
    const impl = UserRpcsBad
      .toLayerDynamic({
        doSomethingElse: Effect.fn(function*() {
          console.log(yield* UserProfile) // bad boy! allowAnonymous: false, so `UserProfile` must fall through to the Layer R.
          return "also-awesome2" as const
        })
      })
    return impl
  })
  .pipe(Layer.unwrapEffect)

expectTypeOf<Layer.Layer.Context<typeof badImpl>>().toEqualTypeOf<UserProfile>()

const middlwareLayer = middleware
  .layer
  .pipe(
    Layer.provide([
      DefaultGenericMiddlewaresLive,
      SomeElseMiddlewareLive,
      SomeMiddlewareWrapLive,
      TestLive,
      RequireRolesLive.pipe(Layer.provide(SomeService.toLayer())),
      AllowAnonymousLive
    ])
  )

export const RpcTestLayer = Layer
  .mergeAll(
    impl,
    middlwareLayer
  )

export const RpcRealLayer = Layer
  .mergeAll(
    HttpLayerRouter
      .serve(
        RpcServer
          .layerHttpRouter({ group: UserRpcs, path: "/rpc", protocol: "http" })
          .pipe(Layer.provide(impl))
          .pipe(Layer.provide(middlwareLayer))
      )
      .pipe(Layer.provide(NodeHttpServer.layer(() => createServer(), { port: 5918 }))),
    RpcClient
      .layerProtocolHttp({ url: "http://localhost:5918/rpc" })
      .pipe(
        Layer.provide(FetchHttpClient.layer)
      )
  )
  .pipe(Layer.provide(RpcSerialization.layerJson))

it.scopedLive(
  "require login",
  Effect.fnUntraced(
    function*() {
      const userClient = yield* RpcTest.makeClient(UserRpcs) // RpcTest.makeClient(UserRpcs) // RpcClient.make(UserRpcs)

      const user = yield* Effect.either(userClient.getUser().pipe(Effect.onExit((_) => Console.dir(_, { depth: 10 }))))
      expect(user).toStrictEqual(Either.left(new NotLoggedInError("Not logged in")))
    },
    Effect.provide(RpcTestLayer)
  )
)

it.scopedLive(
  "allow anonymous, optional UserProfile",
  Effect.fnUntraced(
    function*() {
      const userClient = yield* RpcTest.makeClient(UserRpcs) // RpcTest.makeClient(UserRpcs) // RpcClient.make(UserRpcs)

      const user = yield* userClient.doSomething().pipe(Effect.onExit((_) => Console.dir(_, { depth: 10 })))
      expect(user).toBe("also-awesome")
    },
    Effect.provide(RpcTestLayer)
  )
)

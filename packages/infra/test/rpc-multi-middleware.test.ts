import { FetchHttpClient } from "@effect/platform"
import { NodeHttpServer } from "@effect/platform-node"
import { RpcClient, RpcGroup, RpcSerialization, RpcServer, RpcTest } from "@effect/rpc"
import { expect, it } from "@effect/vitest"
import { Console, Effect, Either, Layer } from "effect"
import { S } from "effect-app"
import { NotLoggedInError } from "effect-app/client"
import { HttpLayerRouter } from "effect-app/http"
import { createServer } from "http"
import { DefaultGenericMiddlewares, makeMiddleware, middlewareGroup } from "../src/api/routing.js"
import { AllowAnonymous, RequestContextMap, RequireRoles, Some, SomeElseMiddleware, SomeMiddlewareWrap, SomeService, Test, UserProfile } from "./fixtures.js"

// todo; make middleware should only accept the middleware tags - without implementation!
// so that the implementation can be provided just on the server! and the `middleware` object reused between server and client!
const middleware = makeMiddleware(RequestContextMap)
  .middleware(RequireRoles)
  .middleware(AllowAnonymous, Test)
  .middleware(SomeElseMiddleware, SomeMiddlewareWrap)
  .middleware(...DefaultGenericMiddlewares)

// basically, what do we want.
// we want to create a ServerMiddleware, which is not available on the client, it can provide: [], and require: [] and is wrap:tru
// then we want to build a Layer for it, so makeMiddleware should be (RequestContextMap, ServerTag).
// rpcGroup.middleware(ServerTag)
// rpcGroup.toLayer().pipe(Layer.provide(middlewareLayer))

const UserRpcs = middlewareGroup(middleware)(RpcGroup
  .make(
    middleware.rpc("getUser", {
      success: S.Literal("awesome")
      // config: { allowAnonymous: true }
    }),
    middleware.rpc("doSomething", {
      success: S.Literal("also-awesome"),
      config: { allowAnonymous: true }
    }),
    middleware.rpc("doSomethingElse", {
      success: S.Literal("also-awesome2"),
      config: { allowAnonymous: true }
    })
  ))

// but instead of locking the implementation Context to Scope | DynamicMiddleware | Provided, we would instead bubble up non provided context to the Layer Requirements?
// or re-consider. it is kind of a nice feature to have local error reporting of missed Context...
const impl = Effect
  .gen(function*() {
    const impl = UserRpcs
      .toLayer({
        getUser: Effect.fn(function*(_payload, _headers) {
          yield* Some
          yield* UserProfile
          return "awesome" as const
        }),
        doSomething: Effect.fn(function*() {
          console.log(yield* Effect.serviceOption(UserProfile))
          return "also-awesome" as const
        }),
        doSomethingElse: Effect.fn(function*() {
          console.log(yield* UserProfile)
          return "also-awesome2" as const
        })
      })
    return impl
  })
  .pipe(Layer.unwrapEffect)

const middlwareLayer = middleware
  .Default
  .pipe(Layer.provide(SomeService.toLayer()))

// for RpcTest.makeClient. make sure to use UserRpcs..
export const RpcTestLayer = Layer
  .mergeAll(
    impl,
    middlwareLayer
  )

// TODO: why end up with any?
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
  "allow anonymous", // but make sure UserProfile is not eliminated when accessed!
  Effect.fnUntraced(
    function*() {
      const userClient = yield* RpcTest.makeClient(UserRpcs) // RpcTest.makeClient(UserRpcs) // RpcClient.make(UserRpcs)

      const user = yield* userClient.doSomething().pipe(Effect.onExit((_) => Console.dir(_, { depth: 10 })))
      expect(user).toBe("also-awesome")
    },
    Effect.provide(RpcTestLayer)
  )
)

it.scopedLive(
  "allow anonymous, so UserProfile may not be eliminated", // but make sure UserProfile is not eliminated when accessed!
  Effect.fnUntraced(
    function*() {
      const userClient = yield* RpcTest.makeClient(UserRpcs) // RpcTest.makeClient(UserRpcs) // RpcClient.make(UserRpcs)

      const user = yield* userClient.doSomethingElse().pipe(Effect.onExit((_) => Console.dir(_, { depth: 10 })))
      expect(user).toBe(new NotLoggedInError())
      // TODO: shouldn't compile, the layer should have error because UserProfile is not eliminated, and therefore ends up as Layer dep
    },
    Effect.provide(RpcTestLayer)
  )
)

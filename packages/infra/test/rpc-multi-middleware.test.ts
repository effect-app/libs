import { NodeHttpServer } from "@effect/platform-node"
import { expect, expectTypeOf, it } from "@effect/vitest"
import { Console, Effect, Layer, Ref, Result } from "effect"
import { Context, S } from "effect-app"
import { NotLoggedInError } from "effect-app/client"
import { HttpRouter } from "effect-app/http"
import { DefaultGenericMiddlewares } from "effect-app/middleware"
import { MiddlewareMaker } from "effect-app/rpc"
import { middlewareGroup } from "effect-app/rpc/MiddlewareMaker"
import { FetchHttpClient } from "effect/unstable/http"
import { Rpc, RpcClient, RpcGroup, RpcSerialization, RpcServer, RpcTest } from "effect/unstable/rpc"
import { createServer } from "http"
import { DefaultGenericMiddlewaresLive } from "../src/api/routing.js"
import { AllowAnonymous, AllowAnonymousLive, RequestContextMap, RequireRoles, RequireRolesLive, Some, SomeElseMiddleware, SomeElseMiddlewareLive, SomeMiddleware, SomeMiddlewareLive, SomeService, Test, TestLive, UserProfile } from "./fixtures.js"

const incomplete = MiddlewareMaker
  .Tag<middleware>()("MiddlewareMaker", RequestContextMap)
  .middleware(RequireRoles)
  .middleware(AllowAnonymous, Test)

// this extension is allowed otherwise the error is quite obscure
export class incompleteMiddleware extends incomplete {}

class middleware extends MiddlewareMaker
  .Tag<middleware>()("MiddlewareMaker", RequestContextMap)
  .middleware(RequireRoles)
  .middleware(AllowAnonymous, Test)
  .middleware(SomeElseMiddleware, SomeMiddleware)
  .middleware(...DefaultGenericMiddlewares)
{}

const UserRpcs = middlewareGroup(middleware)(
  RpcGroup.make(
    middleware.rpc("getUser", {
      success: S.Literal("awesome")
    }),
    middleware.rpc("doSomething", {
      success: S.Literal("also-awesome"),
      config: { allowAnonymous: true } // type safe config based on `RequestContextMap`
    })
  )
)

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

expectTypeOf<Layer.Services<typeof impl>>().toEqualTypeOf<never>()

const UserRpcsBad = middlewareGroup(middleware)(
  RpcGroup.make(
    middleware.rpc("doSomethingElse", {
      success: S.Literal("also-awesome2"),
      config: { allowAnonymous: true }
    })
  )
)

export const badImpl = UserRpcsBad
  .toLayerDynamic({
    doSomethingElse: Effect.fn(function*() {
      console.log(yield* UserProfile) // bad boy! allowAnonymous: false, so `UserProfile` must fall through to the Layer R.
      return "also-awesome2" as const
    })
  })
expectTypeOf<Layer.Services<typeof badImpl>>().toEqualTypeOf<UserProfile>()

const middlwareLayer = middleware
  .layer
  .pipe(
    Layer.provide([
      DefaultGenericMiddlewaresLive,
      SomeElseMiddlewareLive,
      SomeMiddlewareLive,
      TestLive,
      RequireRolesLive.pipe(Layer.provide(SomeService.Default)),
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
    HttpRouter
      .serve(
        RpcServer
          .layerHttp({ group: UserRpcs, path: "/rpc", protocol: "http" })
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
  .pipe(Layer.provide(RpcSerialization.layerNdjson))

it.live(
  "require login",
  Effect.fnUntraced(
    function*() {
      const userClient = yield* RpcTest.makeClient(UserRpcs) // RpcTest.makeClient(UserRpcs) // RpcClient.make(UserRpcs)

      const user = yield* Effect.result(userClient.getUser().pipe(Effect.onExit((_) => Console.dir(_, { depth: 10 }))))
      expect(user).toStrictEqual(Result.fail(new NotLoggedInError("Not logged in")))
    },
    Effect.provide(RpcTestLayer)
  )
)

it.live(
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

// Per-request service isolation test

class PerRequestCounter extends Context.Service<PerRequestCounter>()(
  "PerRequestCounter",
  { make: Effect.sync(() => ({ a: 0 })) }
) {
  static Default = Layer.effect(this, this.make)
}

class GlobalCounter extends Context.Service<GlobalCounter, {
  readonly ref: Ref.Ref<number>
}>()("GlobalCounter") {}

const CounterRpcs = RpcGroup.make(
  Rpc.make("incrementA", {
    success: S.Number
  }),
  Rpc.make("incrementB", {
    success: S.Number
  })
)

const counterImpl = CounterRpcs
  .toLayer({
    incrementA: Effect.fn(function*() {
      const counter = yield* PerRequestCounter
      counter.a++
      const global = yield* GlobalCounter
      yield* Ref.update(global.ref, (n) => n + 1)
      return counter.a
    }, Effect.provide(PerRequestCounter.Default)),
    incrementB: Effect.fn(function*() {
      const counter = yield* PerRequestCounter
      counter.a++
      const global = yield* GlobalCounter
      yield* Ref.update(global.ref, (n) => n + 1)
      return counter.a
    }, Effect.provide(PerRequestCounter.Default))
  })

const GlobalCounterLive = Layer.effect(
  GlobalCounter,
  Ref.make(0).pipe(Effect.map((ref) => ({ ref })))
)

const CounterTestLayer = counterImpl.pipe(Layer.provideMerge(GlobalCounterLive))

it.live(
  "per-request service isolation with shared global counter",
  Effect.fnUntraced(
    function*() {
      const client = yield* RpcTest.makeClient(CounterRpcs)
      const global = yield* GlobalCounter

      const r1 = yield* client.incrementA()
      const r2 = yield* client.incrementB()

      // per-request counter is fresh each time → both return 1
      expect(r1).toBe(1)
      expect(r2).toBe(1)

      // global counter is shared across requests → accumulates to 2
      const globalCount = yield* Ref.get(global.ref)
      expect(globalCount).toBe(2)
    },
    Effect.provide(CounterTestLayer)
  )
)

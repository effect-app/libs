import { FetchHttpClient } from "@effect/platform"
import { Rpc, RpcClient, RpcGroup, RpcSerialization, RpcServer } from "@effect/rpc"
import { expect, it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { S } from "effect-app"
import { DefaultGenericMiddlewares, makeMiddleware } from "../src/api/routing.js"
import { AllowAnonymous, RequestContextMap, RequireRoles, SomeElseMiddleware, SomeMiddleware, Test } from "./fixtures.js"

const middleware = makeMiddleware(RequestContextMap)
  .middleware(RequireRoles)
  .middleware(AllowAnonymous, Test)
  .middleware(SomeElseMiddleware, SomeMiddleware)
  .middleware(...DefaultGenericMiddlewares)

// basically, what do we want.
// we want to create a ServerMiddleware, which is not available on the client, it can provide: [], and require: [] and is wrap:tru
// then we want to build a Layer for it, so makeMiddleware should be (RequestContextMap, ServerTag).
// rpcGroup.middleware(ServerTag)
// rpcGroup.toLayer().pipe(Layer.provide(middlewareLayer))

const UserRpcs = RpcGroup
  .make()
  .add(Rpc.make("getUser", { success: S.Literal("awesome") }))

// const impl = UserRpcs.toLayerWithMiddleware(middleware)({
// but instead of locking the implementation Context to Scope | DynamicMiddleware | Provided, we would instead bubble up non provided context to the Layer Requirements?
// or re-consider. it is kind of a nice feature to have local error reporting of missed Context...
Effect
  .gen(function*() {
    // layer deps...
    // TODO: impl toLayerWithMiddleware on UserRpcs.
    const impl = toLayerWithMiddleware(UserRpcs)(middleware)({
      getUser: (_payload, _headers) => Effect.succeed("awesome")
    })
    return impl
  })
  .pipe(Layer.unwrapEffect)

it.scoped(
  "works",
  Effect.fnUntraced(
    function*() {
      const userClient = yield* RpcClient.make(UserRpcs)

      const user = yield* userClient.getUser()
      expect(user).toBe("awesome")
    },
    Effect.provide(
      Layer
        .mergeAll(
          RpcServer.layerProtocolHttp({ path: "/rpc" }).pipe(Layer.provide(impl)),
          // TODO: actual http server
          RpcClient.layerProtocolHttp({ url: "http://localhost:3000/rpc" }).pipe(
            Layer.provide(FetchHttpClient.layer)
            // Layer.provide(middleware.Default.pipe(Layer.provide(SomeService.toLayer())))
          )
        )
        .pipe(Layer.provide(RpcSerialization.layerJson))
    )
  )
)

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

const UserRpcs = RpcGroup
  .make()
  .add(Rpc.make("getUser", { success: S.Literal("awesome") }))
  // TODO: Needs multi-tag support etc..
  .middleware(middleware)

const impl = UserRpcs.toLayer({
  getUser: (_payload, _headers) => Effect.succeed("awesome")
})

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

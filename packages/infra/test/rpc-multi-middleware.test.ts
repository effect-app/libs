import { Rpc, RpcClient, RpcGroup, RpcSerialization, RpcServer } from "@effect-app/infra/rpc"
import { type HandlersFrom } from "@effect-app/infra/rpc/RpcGroup"
import { FetchHttpClient } from "@effect/platform"
import { expect, it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { S } from "effect-app"
import { DefaultGenericMiddlewares, makeMiddleware } from "../src/api/routing.js"
import { type TagClassAny } from "../src/rpc/RpcMiddleware.js"
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

// alternatively consider group.serverMiddleware? hmmm
const toLayerWithMiddleware = <R extends Rpc.Any>(group: RpcGroup.RpcGroup<R>) =>
// <RequestContextMap extends Record<string, RPCContextMap.Any>>(rcm: RequestContextMap) =>
<Middleware extends TagClassAny> // Middlewares extends ReturnType<
//   typeof makeMiddlewareBasic<
//     RequestContextMap,
//     any
//   >
// >
(
  // middleware here can actually be Server Only middleware.
  middleware: Middleware
) => {
  const groupp = group.middleware(middleware)
  type Grp<A> = A extends RpcGroup.RpcGroup<infer R2> ? R2 : never
  type R2 = Grp<typeof groupp>
  return <Handlers extends HandlersFrom<R2>, EX = never, RX = never>(
    build:
      | Handlers
      | Effect.Effect<Handlers, EX, RX>
  ) => {
    /*: Layer.Layer<
    Rpc.ToHandler<R2>,
    EX,
    // TODO: Requires
    // | (R2 extends Rpc.Rpc<infer _A, infer _B, infer _C, infer _D, infer _E, infer _F> ? _F
    //   : never)
    | Exclude<RX, Scope>
    | HandlersContext<R2, Handlers>
  >*/
    const built = groupp.toLayer(build)
    return RpcServer.layer(groupp).pipe(Layer.provide(built)) // as any // .provide(middleware.Default) as any // .pipe(Layer.provide(middleware.Default))
  }
}

// const impl = UserRpcs.toLayerWithMiddleware(middleware)({
// but instead of locking the implementation Context to Scope | DynamicMiddleware | Provided, we would instead bubble up non provided context to the Layer Requirements?
// or re-consider. it is kind of a nice feature to have local error reporting of missed Context...
// TODO: impl toLayerWithMiddleware on UserRpcs.
const make = toLayerWithMiddleware(UserRpcs)(middleware)
const impl = make(Effect
  .gen(function*() {
    // layer deps...
    return {
      getUser: (_payload, _headers) => Effect.succeed("awesome")
    }
  }))
// .pipe(Layer.unwrapEffect)

const rpcLive = RpcServer.layer(UserRpcs).pipe(
  Layer.provide([impl])
)

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

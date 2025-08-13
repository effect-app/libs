import { Rpc, RpcGroup, type RpcMiddleware, RpcSerialization, RpcTest } from "@effect/rpc"
import { type HandlersContext, type HandlersFrom } from "@effect/rpc/RpcGroup"
import { expect, it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { S, type Scope } from "effect-app"
import { type RPCContextMap } from "effect-app/client"
import { DefaultGenericMiddlewares, makeMiddleware, type RequestContextTag } from "../src/api/routing.js"
import { AllowAnonymous, RequestContextMap, RequireRoles, SomeElseMiddleware, SomeMiddleware, Test } from "./fixtures.js"

const middleware = makeMiddleware(RequestContextMap)
  .middleware(RequireRoles)
  .middleware(AllowAnonymous, Test)
  .middleware(SomeElseMiddleware, SomeMiddleware)
  .middleware(...DefaultGenericMiddlewares)

// type A<T> = T extends RpcMiddleware.TagClass<infer Self, infer Name, infer Options>
//   ? { self: Self; name: Name; options: Options }
//   : never

// type C<T extends RpcMiddleware.TagClass<any, any, any>> = T extends RpcMiddleware.TagClass<infer Self, any, any>
//   ? { self: Self; name: any }
//   : never
// type B = C<typeof middleware>

// basically, what do we want.
// we want to create a ServerMiddleware, which is not available on the client, it can provide: [], and require: [] and is wrap:tru
// then we want to build a Layer for it, so makeMiddleware should be (RequestContextMap, ServerTag).
// rpcGroup.middleware(ServerTag)
// rpcGroup.toLayer().pipe(Layer.provide(middlewareLayer))

const UserRpcs = RpcGroup
  .make()
  .add(Rpc.make("getUser", { success: S.Literal("awesome") }))

// alternatively consider group.serverMiddleware? hmmm
const toLayerWithMiddleware =
  // Middleware extends TagClass<any, any, { wrap: true }
  <RequestContextMap extends Record<string, RPCContextMap.Any>>(
    // middleware here can actually be Server Only middleware.
    middleware: RpcMiddleware.TagClassAny & { requestContext: RequestContextTag<RequestContextMap> }
  ) =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  <Group extends RpcGroup.RpcGroup<any>>(group: Group) =>
  <
    Handlers extends HandlersFrom<RpcGroup.Rpcs<Group>>,
    EX = never,
    RX = never
  >(
    build:
      | Handlers
      | Effect.Effect<Handlers, EX, RX>
  ): Layer.Layer<
    Rpc.ToHandler<RpcGroup.Rpcs<Group>>,
    EX,
    | Exclude<RX, Scope>
    | HandlersContext<RpcGroup.Rpcs<Group>, Handlers>
  > => {
    return group.middleware(middleware).toLayer(build)
  }

// const impl = toLayerWithMiddleware(UserRpcs)(middleware)
// but instead of locking the implementation Context to Scope | DynamicMiddleware | Provided, we would instead bubble up non provided context to the Layer Requirements?
// or re-consider. it is kind of a nice feature to have local error reporting of missed Context...
const impl = Effect
  .gen(function*() {
    // layer deps...
    // TODO: impl toLayerWithMiddleware on UserRpcs.
    const impl = toLayerWithMiddleware(middleware)(UserRpcs)({
      getUser: (_payload, _headers) => Effect.succeed("awesome")
    })
    return impl
  })
  .pipe(Layer.unwrapEffect)

it.scoped(
  "works",
  Effect.fnUntraced(
    function*() {
      const userClient = yield* RpcTest.makeClient(UserRpcs) // RpcClient.make(UserRpcs)

      const user = yield* userClient.getUser()
      expect(user).toBe("awesome")
    },
    Effect.provide(
      impl
        // Layer
        //   .mergeAll(
        // HttpLayerRouter
        //   .serve(
        //     RpcServer.layerHttpRouter({ group: UserRpcs, path: "/rpc", protocol: "http" }).pipe(Layer.provide(impl))
        //   )
        //   .pipe(Layer.provide(NodeHttpServer.layer(() => createServer(), { port: 5918 }))),
        // RpcClient
        //   .layerProtocolHttp({ url: "http://localhost:5918/rpc" })
        //   .pipe(
        //     Layer.provide(FetchHttpClient.layer)
        //     // Layer.provide(middleware.Default.pipe(Layer.provide(SomeService.toLayer())))
        //   )

        .pipe(Layer.provide(RpcSerialization.layerJson))
    )
  )
)

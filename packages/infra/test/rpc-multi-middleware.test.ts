import { FetchHttpClient } from "@effect/platform"
import { NodeHttpServer } from "@effect/platform-node"
import { type Rpc, RpcClient, RpcGroup, type RpcMiddleware, RpcSerialization, RpcServer, RpcTest } from "@effect/rpc"
import { type HandlersContext, type HandlersFrom } from "@effect/rpc/RpcGroup"
import { expect, it } from "@effect/vitest"
import { Effect, Layer } from "effect"
import { S, type Scope } from "effect-app"
import { type RPCContextMap } from "effect-app/client"
import { HttpLayerRouter } from "effect-app/http"
import { createServer } from "http"
import { DefaultGenericMiddlewares, makeMiddleware, type RequestContextTag } from "../src/api/routing.js"
import { AllowAnonymous, RequestContextMap, RequireRoles, Some, SomeElseMiddleware, SomeMiddlewareWrap, SomeService, Test, UserProfile } from "./fixtures.js"

// todo; make middleware should only accept the middleware tags
// so that the implementation can be provided just on the server!
const middleware = makeMiddleware(RequestContextMap)
  .middleware(RequireRoles)
  .middleware(AllowAnonymous, Test)
  .middleware(SomeElseMiddleware, SomeMiddlewareWrap)
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

// alternatively consider group.serverMiddleware? hmmm
const toLayerWithMiddleware =
  // Middleware extends TagClass<any, any, { wrap: true }
  <RequestContextMap extends Record<string, RPCContextMap.Any>>(
    // middleware here can actually be Server Only middleware.
    middleware: RpcMiddleware.TagClassAny & { requestContext: RequestContextTag<RequestContextMap> }
  ) =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  <R extends Rpc.Any>(group: RpcGroup.RpcGroup<R>) => {
    const middlewaredGroup = group.middleware(middleware)
    const toLayerOriginal = middlewaredGroup.toLayer.bind(middlewaredGroup)
    return Object.assign(middlewaredGroup, {
      toLayer: <
        Handlers extends HandlersFrom<R>,
        EX = never,
        RX = never
      >(
        build:
          | Handlers
          | Effect.Effect<Handlers, EX, RX>
        // todo: remove provides types and handle dynamic middleware based on config.
      ): Layer.Layer<
        Rpc.ToHandler<R>,
        EX,
        | Exclude<RX, Scope>
        | HandlersContext<R, Handlers>
      > => {
        return toLayerOriginal(build as any) as any // ??
      }
    })
  }

const UserRpcs = RpcGroup
  .make(
    middleware.rpc("getUser", { success: S.Literal("awesome"), config: { allowAnonymous: true } })
  )

// TODO: the client RpcGroup also has to be adapted together with the server, to add dynamic middleware error schemas depending on Configuration.
const makeServerGroup = toLayerWithMiddleware(middleware)
const UserRpcsServer = makeServerGroup(UserRpcs)

// but instead of locking the implementation Context to Scope | DynamicMiddleware | Provided, we would instead bubble up non provided context to the Layer Requirements?
// or re-consider. it is kind of a nice feature to have local error reporting of missed Context...
const impl = Effect
  .gen(function*() {
    const impl = UserRpcsServer
      .toLayer({
        getUser: Effect.fn(function*(_payload, _headers) {
          yield* Some
          yield* UserProfile
          return "awesome" as const
        })
      })
    return impl
  })
  .pipe(Layer.unwrapEffect)

const middlwareLayer = middleware
  .Default
  .pipe(Layer.provide(SomeService.toLayer()))
// for RpcTest.makeClient. make sure to use UserRpcsServer..
// errors are shit in TestMode "internal server error", instead of something useful
// or hmm, actually also in RealLayer :/
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
          .layerHttpRouter({ group: UserRpcsServer, path: "/rpc", protocol: "http" })
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

it.layer(
  RpcTestLayer
)(
  (it) =>
    it.scoped(
      "works",
      Effect.fnUntraced(
        function*() {
          const userClient = yield* RpcTest.makeClient(UserRpcsServer) // RpcTest.makeClient(UserRpcsServer) // RpcClient.make(UserRpcs)

          const user = yield* userClient.getUser()
          expect(user).toBe("awesome")
        }
        // Effect.onExit((_) => Console.dir(_, { depth: 10 }))
      )
    )
)

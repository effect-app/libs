/**
 * Full-stack stream test exercising the entire wrapper:
 *   resources (TaggedRequestFor)
 *   → controllers (Router(...)({ effect }))
 *   → router (makeRouter / matchAll)
 *   → api ClientFactory (ApiClientFactory.makeFor)
 *
 * Server runs over real HTTP (NodeHttpServer on a loopback port). Client uses
 * FetchHttpClient through ApiClientFactory. This covers the wrapper-level
 * `Stream` request constructor end-to-end.
 */
import { NodeHttpServer } from "@effect/platform-node"
import { expect, it } from "@effect/vitest"
import { Effect, Exit, Layer, Option, Stream } from "effect"
import { S } from "effect-app"
import { ApiClientFactory, makeRpcClient } from "effect-app/client"
import { HttpRouter, HttpServer } from "effect-app/http"
import { DefaultGenericMiddlewares } from "effect-app/middleware"
import { MiddlewareMaker } from "effect-app/rpc"
import { TaggedErrorClass } from "effect-app/Schema"
import { FetchHttpClient } from "effect/unstable/http"
import { RpcSerialization } from "effect/unstable/rpc"
import { createServer } from "http"
import { makeRouter } from "../src/api/routing.js"
import { DefaultGenericMiddlewaresLive } from "../src/api/routing/middleware.js"
import { AllowAnonymous, AllowAnonymousLive, RequestContextMap, RequireRoles, RequireRolesLive, SomeElseMiddleware, SomeElseMiddlewareLive, SomeService, Test, TestLive } from "./fixtures.js"

// ---------------------------------------------------------------------------
// Middleware (mirrors the boilerplate AppMiddleware shape).
// ---------------------------------------------------------------------------

class AppMiddleware extends MiddlewareMaker
  .Tag<AppMiddleware>()("AppMiddleware", RequestContextMap)
  .middleware(RequireRoles, Test)
  .middleware(AllowAnonymous)
  .middleware(SomeElseMiddleware)
  .middleware(...DefaultGenericMiddlewares)
{
  static Default = this.layer.pipe(
    Layer.provide([
      RequireRolesLive.pipe(Layer.provide(SomeService.Default)),
      AllowAnonymousLive,
      TestLive,
      SomeElseMiddlewareLive,
      DefaultGenericMiddlewaresLive
    ])
  )
}

const { Router, matchAll } = makeRouter(AppMiddleware)

// ---------------------------------------------------------------------------
// Resources — Stream with and without payload.
// ---------------------------------------------------------------------------

const { TaggedRequestFor } = makeRpcClient(RequestContextMap)
const Req = TaggedRequestFor("Streamy")

class StreamTicks extends Req.Stream<StreamTicks>()("StreamTicks", {}, {
  allowAnonymous: true,
  success: S.Number
}) {}

class StreamCountTo extends Req.Stream<StreamCountTo>()("StreamCountTo", {
  to: S.Number
}, {
  allowAnonymous: true,
  success: S.Number
}) {}

class StreamRealtime extends Req.Stream<StreamRealtime>()("StreamRealtime", {}, {
  allowAnonymous: true,
  success: S.Number
}) {}

class StreamBoom extends TaggedErrorClass<StreamBoom>()("StreamBoom", { reason: S.String }) {}

class StreamFailEffect extends Req.Stream<StreamFailEffect>()("StreamFailEffect", {}, {
  allowAnonymous: true,
  success: S.Number,
  error: StreamBoom
}) {}

class StreamFailStream extends Req.Stream<StreamFailStream>()("StreamFailStream", {}, {
  allowAnonymous: true,
  success: S.Number,
  error: StreamBoom
}) {}

const StreamyRsc = { StreamTicks, StreamCountTo, StreamRealtime, StreamFailEffect, StreamFailStream }

// ---------------------------------------------------------------------------
// Controllers / router — Stream impls returned from the match callback.
// ---------------------------------------------------------------------------

const router = Router(StreamyRsc)({
  *effect(match) {
    return match({
      StreamTicks: Stream.fromIterable([10, 20, 30]),
      StreamCountTo: ({ to }: { readonly to: number }) =>
        Effect
          .gen(function*() {
            return Stream.range(1, to)
          })
          .pipe(Stream.unwrap),
      // emits 3 values 100ms apart so the test can prove element-by-element
      // delivery rather than a single batched response
      StreamRealtime: Stream.fromIterable([1, 2, 3]).pipe(
        Stream.mapEffect((n) => Effect.sleep("100 millis").pipe(Effect.as(n)))
      ),
      // returning Effect.fail from a stream handler should surface as a failing
      // stream on the client (not a protocol error)
      StreamFailEffect: Effect.fail(new StreamBoom({ reason: "from-effect" })),
      StreamFailStream: Stream.fail(new StreamBoom({ reason: "from-stream" }))
    })
  }
})

const RpcRouterLayer = matchAll({ router })

// ---------------------------------------------------------------------------
// HTTP wiring — real server on a loopback port + FetchHttpClient on the client.
// ---------------------------------------------------------------------------

// Server binds an ephemeral port (port: 0). The actual URL is read from the
// `HttpServer` service after binding, then fed into `ApiClientFactory.layer` so
// each `it.live` scope gets a fresh server without colliding on a fixed port.
const NodeServerLayer = NodeHttpServer.layer(() => createServer(), { port: 0 })

const ServerLayer = HttpRouter
  .serve(RpcRouterLayer)
  .pipe(
    Layer.provide(NodeServerLayer),
    Layer.provide(RpcSerialization.layerNdjson)
  )

const ClientLayer = Layer
  .unwrap(
    Effect.gen(function*() {
      const server = yield* HttpServer.HttpServer
      const addr = server.address
      if (addr._tag !== "TcpAddress") return yield* Effect.die(new Error("expected TcpAddress"))
      const host = addr.hostname === "0.0.0.0" ? "127.0.0.1" : addr.hostname
      const url = `http://${host}:${addr.port}`
      return ApiClientFactory
        .layer({ url, headers: Option.none() })
        .pipe(Layer.provide(FetchHttpClient.layer))
    })
  )
  .pipe(Layer.provide(NodeServerLayer))

const TestLayer = Layer.mergeAll(ServerLayer, ClientLayer)

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

it.live(
  "stream resource without input: ApiClientFactory client emits all values",
  Effect.fnUntraced(function*() {
    const client = yield* ApiClientFactory.makeFor(Layer.empty)(StreamyRsc)
    const values = yield* Stream.runCollect(client.StreamTicks.handler)
    expect(values).toStrictEqual([10, 20, 30])
  }, Effect.provide(TestLayer)),
  { timeout: 10_000 }
)

it.live(
  "stream resource with input: payload drives the emitted values",
  Effect.fnUntraced(function*() {
    const client = yield* ApiClientFactory.makeFor(Layer.empty)(StreamyRsc)
    const values = yield* Stream.runCollect(client.StreamCountTo.handler({ to: 4 }))
    expect(values).toStrictEqual([1, 2, 3, 4])
  }, Effect.provide(TestLayer)),
  { timeout: 10_000 }
)

it.live(
  "stream resource is delivered element-by-element in real time (not batched)",
  Effect.fnUntraced(function*() {
    const client = yield* ApiClientFactory.makeFor(Layer.empty)(StreamyRsc)
    const start = Date.now()
    const arrivals = yield* Stream.runCollect(
      client.StreamRealtime.handler.pipe(
        Stream.map((n) => ({ n, at: Date.now() - start }))
      )
    )
    expect(arrivals.map((_) => _.n)).toStrictEqual([1, 2, 3])
    // server emits each value 100ms after the previous one. If the response
    // were batched, deltas would be ~0ms. Allow generous slack for CI jitter
    // but require clear separation between consecutive arrivals.
    const delta1 = arrivals[1]!.at - arrivals[0]!.at
    const delta2 = arrivals[2]!.at - arrivals[1]!.at
    expect(delta1).toBeGreaterThan(50)
    expect(delta2).toBeGreaterThan(50)
    // first element should not be withheld until the whole stream completes
    expect(arrivals[0]!.at).toBeLessThan(arrivals[2]!.at - 50)
  }, Effect.provide(TestLayer)),
  { timeout: 10_000 }
)

it.live(
  "stream handler returning Effect.fail surfaces as failing stream on client",
  Effect.fnUntraced(function*() {
    const client = yield* ApiClientFactory.makeFor(Layer.empty)(StreamyRsc)
    const exit = yield* Stream.runCollect(client.StreamFailEffect.handler).pipe(Effect.exit)
    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) {
      const failures = (exit.cause as any).reasons as ReadonlyArray<{ _tag: "Fail"; error: StreamBoom }>
      expect(failures.length).toBeGreaterThan(0)
      expect(failures[0]!.error._tag).toBe("StreamBoom")
      expect(failures[0]!.error.reason).toBe("from-effect")
    }
  }, Effect.provide(TestLayer)),
  { timeout: 10_000 }
)

it.live(
  "stream handler returning Stream.fail surfaces as failing stream on client",
  Effect.fnUntraced(function*() {
    const client = yield* ApiClientFactory.makeFor(Layer.empty)(StreamyRsc)
    const exit = yield* Stream.runCollect(client.StreamFailStream.handler).pipe(Effect.exit)
    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) {
      const failures = (exit.cause as any).reasons as ReadonlyArray<{ _tag: "Fail"; error: StreamBoom }>
      expect(failures.length).toBeGreaterThan(0)
      expect(failures[0]!.error._tag).toBe("StreamBoom")
      expect(failures[0]!.error.reason).toBe("from-stream")
    }
  }, Effect.provide(TestLayer)),
  { timeout: 10_000 }
)

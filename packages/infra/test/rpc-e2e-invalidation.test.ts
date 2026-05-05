/**
 * E2E tests for the invalidation key flow exercised end-to-end via the
 * production wrap/unwrap path:
 *
 *   server: routing.ts wraps command success with `CommandResponseWithMetaData`
 *           and handler-thrown failure with `CommandFailureWithMetaData`;
 *           routing wraps stream values into `{_tag:"value"|"metadata"|"done"}`
 *           chunks. `InvalidationSet.use(...)` inside a handler accumulates keys.
 *   client: apiClientFactory unwraps both envelopes and forwards keys to
 *           `InvalidationKeysFromServer`.
 *
 * Transport is real HTTP (NodeHttpServer on a loopback port) so the wire
 * encoding is exercised too.
 */
import { NodeHttpServer } from "@effect/platform-node"
import { expect, it } from "@effect/vitest"
import { Effect, Exit, Layer, Option, Ref, Stream } from "effect"
import { S } from "effect-app"
import { ApiClientFactory, InvalidationKeysFromServer, makeInvalidationKeysService, makeRpcClient } from "effect-app/client"
import { HttpRouter, HttpServer } from "effect-app/http"
import { DefaultGenericMiddlewares } from "effect-app/middleware"
import { Invalidation, MiddlewareMaker } from "effect-app/rpc"
import { TaggedErrorClass } from "effect-app/Schema"
import { FetchHttpClient } from "effect/unstable/http"
import { RpcSerialization } from "effect/unstable/rpc"
import { createServer } from "http"
import { makeRouter } from "../src/api/routing.js"
import { DefaultGenericMiddlewaresLive } from "../src/api/routing/middleware.js"
import { AllowAnonymous, AllowAnonymousLive, RequestContextMap, RequireRoles, RequireRolesLive, SomeElseMiddleware, SomeElseMiddlewareLive, SomeService, Test, TestLive } from "./fixtures.js"

// ---------------------------------------------------------------------------
// Middleware (mirrors AppMiddleware shape — same composite as other e2e tests).
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
    ] as const)
  )
}

const { Router, matchAll } = makeRouter(AppMiddleware.Default)

// ---------------------------------------------------------------------------
// Resources
// ---------------------------------------------------------------------------

const DynamicKey: Invalidation.InvalidationKey = ["dynamic", "key"]
const ExtraKey: Invalidation.InvalidationKey = ["extra", "key"]
const StreamKey: Invalidation.InvalidationKey = ["stream", "key"]

const { TaggedRequestFor } = makeRpcClient(RequestContextMap, undefined, AppMiddleware)
const Req = TaggedRequestFor("Inv")

class CmdBoom extends TaggedErrorClass<CmdBoom>()("CmdBoom", { reason: S.String }) {}

class DoNothing extends Req.Command<DoNothing>()("DoNothing", {}, {
  allowAnonymous: true,
  success: S.Void
}) {}

class DoWithDynamicKey extends Req.Command<DoWithDynamicKey>()("DoWithDynamicKey", {}, {
  allowAnonymous: true,
  success: S.String
}) {}

class DoWithBothKeys extends Req.Command<DoWithBothKeys>()("DoWithBothKeys", {}, {
  allowAnonymous: true,
  success: S.Number
}) {}

class DoAndFail extends Req.Command<DoAndFail>()("DoAndFail", {}, {
  allowAnonymous: true,
  success: S.Void,
  error: CmdBoom
}) {}

class StreamWithKey extends Req.Command<StreamWithKey>()("StreamWithKey", {}, {
  stream: true,
  allowAnonymous: true,
  success: S.Number
}) {}

const InvRsc = { DoNothing, DoWithDynamicKey, DoWithBothKeys, DoAndFail, StreamWithKey }

// ---------------------------------------------------------------------------
// Controllers / router
// ---------------------------------------------------------------------------

const router = Router(InvRsc)({
  *effect(match) {
    return match({
      DoNothing: () => Effect.void,
      DoWithDynamicKey: Effect.fnUntraced(function*() {
        yield* Invalidation.InvalidationSet.use((_) => _.add(DynamicKey))
        return "done"
      }),
      DoWithBothKeys: Effect.fnUntraced(function*() {
        yield* Invalidation.InvalidationSet.use((_) => _.add(DynamicKey))
        yield* Invalidation.InvalidationSet.use((_) => _.add(ExtraKey))
        return 99
      }),
      DoAndFail: Effect.fnUntraced(function*() {
        yield* Invalidation.InvalidationSet.use((_) => _.add(DynamicKey))
        return yield* Effect.fail(new CmdBoom({ reason: "intentional failure" }))
      }),
      StreamWithKey: () =>
        Stream.fromIterable([1, 2, 3]).pipe(
          Stream.tap(() => Invalidation.InvalidationSet.use((_) => _.add(StreamKey)))
        )
    })
  }
})

const RpcRouterLayer = matchAll({ router })

// ---------------------------------------------------------------------------
// HTTP wiring — fresh server on loopback per `it.live`.
// ---------------------------------------------------------------------------

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

// Helper: provide a fresh `InvalidationKeysFromServer` and capture forwarded keys.
const withCapture = <A, E, R>(eff: Effect.Effect<A, E, R>) =>
  Effect.gen(function*() {
    const ref = yield* Ref.make<ReadonlyArray<Invalidation.InvalidationKey>>([])
    const svc = makeInvalidationKeysService(ref)
    const result = yield* eff.pipe(Effect.provideService(InvalidationKeysFromServer, svc), Effect.exit)
    return { result, keys: yield* Ref.get(ref) }
  })

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

it.live(
  "command with no invalidation keys: caller sees raw payload, no keys forwarded",
  Effect.fnUntraced(function*() {
    const client = yield* ApiClientFactory.makeFor(Layer.empty)(InvRsc)
    const { result, keys } = yield* withCapture(client.DoNothing.handler())
    expect(Exit.isSuccess(result)).toBe(true)
    expect(keys).toStrictEqual([])
  }, Effect.provide(TestLayer)),
  { timeout: 10_000 }
)

it.live(
  "command with dynamic InvalidationSet.use: payload + key forwarded",
  Effect.fnUntraced(function*() {
    const client = yield* ApiClientFactory.makeFor(Layer.empty)(InvRsc)
    const { result, keys } = yield* withCapture(client.DoWithDynamicKey.handler())
    expect(Exit.isSuccess(result) && result.value).toBe("done")
    expect(keys).toStrictEqual([DynamicKey])
  }, Effect.provide(TestLayer)),
  { timeout: 10_000 }
)

it.live(
  "command accumulating multiple dynamic keys: all keys forwarded in order",
  Effect.fnUntraced(function*() {
    const client = yield* ApiClientFactory.makeFor(Layer.empty)(InvRsc)
    const { result, keys } = yield* withCapture(client.DoWithBothKeys.handler())
    expect(Exit.isSuccess(result) && result.value).toBe(99)
    expect(keys).toStrictEqual([DynamicKey, ExtraKey])
  }, Effect.provide(TestLayer)),
  { timeout: 10_000 }
)

it.live(
  "per-request isolation: each command call starts with a fresh InvalidationSet",
  Effect.fnUntraced(function*() {
    const client = yield* ApiClientFactory.makeFor(Layer.empty)(InvRsc)
    const r1 = yield* withCapture(client.DoWithDynamicKey.handler())
    const r2 = yield* withCapture(client.DoWithDynamicKey.handler())
    // Each call must have exactly one key — no accumulation across calls
    expect(r1.keys).toStrictEqual([DynamicKey])
    expect(r2.keys).toStrictEqual([DynamicKey])
  }, Effect.provide(TestLayer)),
  { timeout: 10_000 }
)

it.live(
  "command failure (V2): keys accumulated before fail still reach the client; original error re-thrown",
  Effect.fnUntraced(function*() {
    const client = yield* ApiClientFactory.makeFor(Layer.empty)(InvRsc)
    const { result, keys } = yield* withCapture(client.DoAndFail.handler())
    expect(Exit.isFailure(result)).toBe(true)
    if (Exit.isFailure(result)) {
      const failures = (result.cause as any).reasons as ReadonlyArray<{ _tag: "Fail"; error: any }>
      expect(failures[0]?.error?._tag).toBe("CmdBoom")
      expect(failures[0]?.error?.reason).toBe("intentional failure")
    }
    expect(keys).toStrictEqual([DynamicKey])
  }, Effect.provide(TestLayer)),
  { timeout: 10_000 }
)

it.live(
  "stream: per-chunk metadata drains keys mid-stream",
  Effect.fnUntraced(function*() {
    const client = yield* ApiClientFactory.makeFor(Layer.empty)(InvRsc)
    const ref = yield* Ref.make<ReadonlyArray<Invalidation.InvalidationKey>>([])
    const svc = makeInvalidationKeysService(ref)
    const values = yield* Stream.runCollect(client.StreamWithKey.handler()).pipe(
      Effect.provideService(InvalidationKeysFromServer, svc)
    )
    const keys = yield* Ref.get(ref)
    expect(values).toStrictEqual([1, 2, 3])
    // Handler taps `InvalidationSet.use` once per emitted value; routing's V3 mid-stream
    // metadata drain forwards each batch as it arrives.
    expect(keys).toStrictEqual([StreamKey, StreamKey, StreamKey])
  }, Effect.provide(TestLayer)),
  { timeout: 10_000 }
)

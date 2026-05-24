/**
 * E2E test for commit bb3f51d03 — `fix(infra): bind ContextMap to request scope
 * for SSE streams`.
 *
 * Background
 * ----------
 *   The RpcServer returns `HttpServerResponse.stream(...)` for streaming RPC
 *   resources. The body of that response keeps producing chunks AFTER the
 *   outer Effect that built the response has returned. `RequestContextMiddleware`
 *   provisions `ContextMapContainer` for the request. The acquireRelease
 *   inside `ContextMapContainer.layer` calls `clear()` on finalize, wiping
 *   the etag map and the per-request resolver/store cache.
 *
 *   If that layer is built against a sub-scope of the outer Effect (the
 *   pre-fix behaviour: `Effect.provide(layer)`), the finalizer fires as soon
 *   as the middleware Effect returns the HttpServerResponse — i.e. between
 *   "handler done" and "first chunk written" — wiping ContextMap state that
 *   later chunks still need. In production this surfaces as spurious
 *   OptimisticConcurrencyException on writes that follow a streaming read.
 *
 *   The fix binds the layer to the ambient request scope via
 *   `provideOnRequestScope`, so `clear()` only runs once the response body
 *   has fully drained.
 *
 * Reproduction strategy
 * ---------------------
 *   - Mirror the production wiring: apply `RequestContextMiddleware` to the
 *     RPC router (see `boilerplate/api/src/router.ts`).
 *   - The stream handler sets an etag on the ContextMap BEFORE returning the
 *     Stream value.
 *   - The Stream emits three values 100ms apart; each emission reads back the
 *     etag via `getContextMap` and yields 1 if the value is still present,
 *     0 otherwise.
 *   - Expectation: [1, 1, 1]. If the layer's `clear()` runs mid-stream the
 *     later chunks observe an empty map and the assertion fails (typically
 *     with [1, 0, 0] or [0, 0, 0]).
 */
import { NodeHttpServer } from "@effect/platform-node"
import { expect, it } from "@effect/vitest"
import { ApiClientFactory, makeRpcClient } from "effect-app/client"
import { HttpRouter, HttpServer } from "effect-app/http"
import { DefaultGenericMiddlewares } from "effect-app/middleware"
import { MiddlewareMaker } from "effect-app/rpc"
import * as S from "effect-app/Schema"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Stream from "effect/Stream"
import { FetchHttpClient } from "effect/unstable/http"
import { RpcSerialization } from "effect/unstable/rpc"
import { createServer } from "http"
import { RequestContextMiddleware } from "../src/api/internal/RequestContextMiddleware.js"
import { makeRouter } from "../src/api/routing.js"
import { DefaultGenericMiddlewaresLive } from "../src/api/routing/middleware.js"
import { getContextMap } from "../src/Store/ContextMapContainer.js"
import { AllowAnonymous, AllowAnonymousLive, RequestContextMap, RequireRoles, RequireRolesLive, SomeElseMiddleware, SomeElseMiddlewareLive, SomeService, Test, TestLive } from "./fixtures.js"

// ---------------------------------------------------------------------------
// Middleware — mirrors AppMiddleware shape used by the other rpc e2e tests.
// ---------------------------------------------------------------------------

class AppMiddleware extends MiddlewareMaker
  .Tag<AppMiddleware>()("AppMiddleware", RequestContextMap)
  .middleware(RequireRoles, Test)
  .middleware(AllowAnonymous)
  .middleware(SomeElseMiddleware)
  .middleware(...DefaultGenericMiddlewares)
{
  static Default = this.layer.pipe(
    Layer.provide(
      [
        RequireRolesLive.pipe(Layer.provide(SomeService.Default)),
        AllowAnonymousLive,
        TestLive,
        SomeElseMiddlewareLive,
        DefaultGenericMiddlewaresLive
      ] as const
    )
  )
}

const { Router, matchAll } = makeRouter(AppMiddleware.Default)

// ---------------------------------------------------------------------------
// Resource — single streaming command that exercises ContextMap mid-stream.
// ---------------------------------------------------------------------------

const { TaggedRequestFor } = makeRpcClient(AppMiddleware)
const Req = TaggedRequestFor("CtxMap")

class StreamEtag extends Req.Command<StreamEtag>()("StreamEtag", {}, {
  stream: true,
  allowAnonymous: true,
  success: S.Number
}) {}

// Per-request isolation probes: each handler writes a caller-supplied value to
// the SHARED key, then emits 3 chunks each re-reading the SHARED key. If two
// concurrent requests share a ContextMap, the second writer overwrites the
// first and the first request observes the wrong value mid-stream.
class StreamWithEtag extends Req.Command<StreamWithEtag>()("StreamWithEtag", {
  value: S.String
}, {
  stream: true,
  allowAnonymous: true,
  success: S.String
}) {}

class ReadEtagOnce extends Req.Query<ReadEtagOnce>()("ReadEtagOnce", {}, {
  allowAnonymous: true,
  success: S.String
}) {}

const Rsc = { StreamEtag, StreamWithEtag, ReadEtagOnce }

// Distinct constants so an assertion failure points squarely at "the etag
// the handler wrote was no longer there when later chunks ran".
const ETAG_ID = "ctxmap-test-id"
const ETAG_VALUE = "v1"
const SHARED_KEY = "ctxmap-shared-key"
const MISSING = "<missing>"

const router = Router(Rsc)({
  *effect(match) {
    return match({
      StreamEtag: () =>
        Effect
          .gen(function*() {
            // 1) Acquire the request-scoped ContextMap. Fails (dies) if the
            //    container is still the default "root" — which would mean
            //    RequestContextMiddleware did not run for this request.
            const ctxMap = yield* getContextMap.pipe(Effect.orDie)
            // 2) Seed an etag BEFORE handing back the Stream. This write is
            //    what the per-chunk readers below verify.
            ctxMap.set(ETAG_ID, ETAG_VALUE)
            // 3) Emit three values 100ms apart so chunks are produced AFTER
            //    the outer Effect that built the response has returned. Each
            //    emission re-reads the etag from the request-scoped ContextMap.
            return Stream.fromIterable([0, 1, 2]).pipe(
              Stream.mapEffect(() =>
                Effect.sleep("100 millis").pipe(
                  Effect.flatMap(() => getContextMap.pipe(Effect.orDie)),
                  Effect.map((m) => m.get(ETAG_ID) === ETAG_VALUE ? 1 : 0)
                )
              )
            )
          })
          .pipe(Stream.unwrap),
      StreamWithEtag: ({ value }: { readonly value: string }) =>
        Effect
          .gen(function*() {
            const ctxMap = yield* getContextMap.pipe(Effect.orDie)
            ctxMap.set(SHARED_KEY, value)
            return Stream.fromIterable([0, 1, 2]).pipe(
              Stream.mapEffect(() =>
                Effect.sleep("100 millis").pipe(
                  Effect.flatMap(() => getContextMap.pipe(Effect.orDie)),
                  Effect.map((m) => m.get(SHARED_KEY) ?? MISSING)
                )
              )
            )
          })
          .pipe(Stream.unwrap),
      ReadEtagOnce: () => getContextMap.pipe(Effect.orDie, Effect.map((m) => m.get(SHARED_KEY) ?? MISSING))
    })
  }
})

const RpcRouterLayer = matchAll({ router })

// ---------------------------------------------------------------------------
// HTTP wiring — fresh server on a loopback port per `it.live`. The critical
// difference vs. rpc-stream-fullstack: we apply `RequestContextMiddleware`
// here, exactly as the production boilerplate does, so the fix code path
// is what runs.
// ---------------------------------------------------------------------------

const NodeServerLayer = NodeHttpServer.layer(() => createServer(), { port: 0 })

const RequestContextMiddlewareLayer = HttpRouter.middleware(RequestContextMiddleware()).layer

const ServerLayer = HttpRouter
  .serve(
    RpcRouterLayer.pipe(Layer.provide(RequestContextMiddlewareLayer))
  )
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
// Test
// ---------------------------------------------------------------------------

it.live(
  "ContextMap survives mid-stream: etag set in handler is readable by every chunk",
  Effect.fnUntraced(function*() {
    const client = yield* ApiClientFactory.makeFor(Layer.empty)(Rsc)
    const values = yield* Stream.runCollect(client.StreamEtag.handler())
    // All three chunks emit 1 → the etag was still readable when each chunk
    // executed. If the layer-bound ContextMap's `clear()` finalizer fired
    // mid-stream (the pre-fix behaviour), later chunks would emit 0.
    expect(values).toStrictEqual([1, 1, 1])
  }, Effect.provide(TestLayer)),
  { timeout: 10_000 }
)

it.live(
  "succeeding requests get a fresh ContextMap: request N+1 cannot see request N's writes",
  Effect.fnUntraced(function*() {
    const client = yield* ApiClientFactory.makeFor(Layer.empty)(Rsc)
    // 1st request writes SHARED_KEY = "first" and drains its stream so its
    // request scope (and ContextMap) is closed before request 2 starts.
    const first = yield* Stream.runCollect(client.StreamWithEtag.handler({ value: "first" }))
    expect(first).toStrictEqual(["first", "first", "first"])
    // 2nd request must NOT observe the previous request's value at any point.
    const peek = yield* client.ReadEtagOnce.handler()
    expect(peek).toBe(MISSING)
    // 3rd request writes a different value and drains; must not be polluted by request 1.
    const third = yield* Stream.runCollect(client.StreamWithEtag.handler({ value: "third" }))
    expect(third).toStrictEqual(["third", "third", "third"])
  }, Effect.provide(TestLayer)),
  { timeout: 10_000 }
)

it.live(
  "overlapping requests get isolated ContextMaps: concurrent streams see only their own writes",
  Effect.fnUntraced(function*() {
    const client = yield* ApiClientFactory.makeFor(Layer.empty)(Rsc)
    // Two streams in flight at the same time, each writing the SAME key with a
    // different value. With per-request maps each stream reads back only its
    // own value across all chunks. With a shared map the later writer's value
    // would leak into the earlier stream's later chunks.
    const [a, b] = yield* Effect.all(
      [
        Stream.runCollect(client.StreamWithEtag.handler({ value: "alpha" })),
        Stream.runCollect(client.StreamWithEtag.handler({ value: "beta" }))
      ],
      { concurrency: "unbounded" }
    )
    expect(a).toStrictEqual(["alpha", "alpha", "alpha"])
    expect(b).toStrictEqual(["beta", "beta", "beta"])
  }, Effect.provide(TestLayer)),
  { timeout: 10_000 }
)


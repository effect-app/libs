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
import { HttpMiddleware, HttpRouter, HttpServer } from "effect-app/http"
import { DefaultGenericMiddlewares } from "effect-app/middleware"
import { MiddlewareMaker } from "effect-app/rpc"
import * as S from "effect-app/Schema"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Request from "effect/Request"
import * as RequestResolver from "effect/RequestResolver"
import * as Stream from "effect/Stream"
import { FetchHttpClient } from "effect/unstable/http"
import { RpcSerialization } from "effect/unstable/rpc"
import { createServer } from "http"
import { RequestContextMiddleware } from "../src/api/internal/RequestContextMiddleware.js"
import { makeRouter } from "../src/api/routing.js"
import { DefaultGenericMiddlewaresLive } from "../src/api/routing/middleware.js"
import { makeRepo } from "../src/Model/Repository.js"
import { RepositoryRegistryLive } from "../src/Model/Repository/Registry.js"
import { LocaleRef } from "../src/RequestContext.js"
import { ContextMapContainer, getContextMap, withRequestResolverCache } from "../src/Store/ContextMapContainer.js"
import { MemoryStoreLive, storeId } from "../src/Store/Memory.js"
import { makeContextMap } from "../src/Store/service.js"
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

class LeakUser extends S.Class<LeakUser>("LeakUser")({
  id: S.String,
  name: S.String
}) {}

class LeakLike extends S.Class<LeakLike>("LeakLike")({
  likeUserId: S.String
}) {}

class LeakPost extends S.Class<LeakPost>("LeakPost")({
  id: S.String,
  authorUserId: S.String,
  publisherUserId: S.String,
  likes: S.Array(LeakLike)
}) {}

class LeakProbePosts extends Req.Query<LeakProbePosts>()("LeakProbePosts", {}, {
  allowAnonymous: true,
  success: S.Number
}) {}

const LEAK_USER_COUNT = 100
const LEAK_REQUEST_COUNT = 100
const LEAK_LIKES_PER_POST = 10

const leakUsers = Array.from({ length: LEAK_USER_COUNT }, (_, i) =>
  new LeakUser({
    id: `u-${i}`,
    name: `User ${i}`
  })
)
const leakPosts = Array.from({ length: LEAK_USER_COUNT }, (_, i) =>
  new LeakPost({
    id: `p-${i}`,
    authorUserId: `u-${i}`,
    publisherUserId: `u-${(i + 1) % LEAK_USER_COUNT}`,
    likes: Array.from({ length: LEAK_LIKES_PER_POST }, (_, j) =>
      new LeakLike({
        likeUserId: `u-${(i + j) % LEAK_USER_COUNT}`
      }))
  })
)
const leakUsersById = new Map(leakUsers.map((_) => [_.id, _] as const))
const leakStats = {
  resolverBatches: 0,
  resolverRequestedUsers: 0
}

interface GetLeakUserRequest extends Request.Request<LeakUser, Error> {
  readonly _tag: "GetLeakUser"
  readonly userId: string
}

const GetLeakUser = Request.tagged<GetLeakUserRequest>("GetLeakUser")

const leakUserResolver = RequestResolver
  .make((entries) => {
    leakStats.resolverBatches += 1
    leakStats.resolverRequestedUsers += entries.length
    return Effect.forEach(entries, (entry) => {
      const user = leakUsersById.get(entry.request.userId)
      if (user === undefined) {
        return Request.complete(Exit.fail(new Error(`Missing leak user ${entry.request.userId}`)))(entry)
      }
      return Request.complete(Exit.succeed(user))(entry)
    }, { discard: true })
  })
  .pipe(RequestResolver.batchN(20))

const leakUserResolverWithRequestCache = withRequestResolverCache(leakUserResolver, {
  capacity: 10_000,
  strategy: "fifo"
}).pipe(Effect.orDie)

const Rsc = { StreamEtag, StreamWithEtag, ReadEtagOnce, LeakProbePosts }

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
      ReadEtagOnce: () => getContextMap.pipe(Effect.orDie, Effect.map((m) => m.get(SHARED_KEY) ?? MISSING)),
      LeakProbePosts: () =>
        Effect
          .gen(function*() {
            const userRepo = yield* makeRepo("LeakProbeUser", LeakUser, {
              makeInitial: Effect.succeed(leakUsers)
            })
            const postRepo = yield* makeRepo("LeakProbePost", LeakPost, {
              makeInitial: Effect.succeed(leakPosts)
            })
            const resolver = yield* leakUserResolverWithRequestCache
            const posts = yield* postRepo.all
            const allUsers = yield* userRepo.all
            if (allUsers.length !== LEAK_USER_COUNT) {
              return yield* Effect.die(new Error(`Expected ${LEAK_USER_COUNT} users, got ${allUsers.length}`))
            }
            const userRefs = posts.flatMap((post) => [
              post.authorUserId,
              post.publisherUserId,
              ...post.likes.map((like) => like.likeUserId)
            ])
            const resolved = yield* Effect.forEach(
              userRefs,
              (userId) => Effect.request(GetLeakUser({ userId }), resolver),
              { concurrency: "unbounded" }
            )
            return resolved.length
          })
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
const LeakyRequestContextMiddlewareLayer = HttpRouter.middleware(
  HttpMiddleware.make((app) =>
    app.pipe(
      Effect.provide(
        Layer.mergeAll(
          Layer.succeed(ContextMapContainer, ContextMapContainer.of(makeContextMap())),
          Layer.succeed(LocaleRef, "en"),
          Layer.succeed(storeId, "primary")
        )
      )
    ))
).layer

const ServerLayer = HttpRouter
  .serve(
    RpcRouterLayer.pipe(Layer.provide(RequestContextMiddlewareLayer))
  )
  .pipe(
    Layer.provide(Layer.merge(MemoryStoreLive, RepositoryRegistryLive)),
    Layer.provide(NodeServerLayer),
    Layer.provide(RpcSerialization.layerNdjson)
  )
const LeakyServerLayer = HttpRouter
  .serve(
    RpcRouterLayer.pipe(Layer.provide(LeakyRequestContextMiddlewareLayer))
  )
  .pipe(
    Layer.provide(Layer.merge(MemoryStoreLive, RepositoryRegistryLive)),
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
const LeakyTestLayer = Layer.mergeAll(LeakyServerLayer, ClientLayer)

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

it.live(
  "leak repro: 100 rpc requests with leaky ContextMap keep resolver cache users/fibers across requests",
  Effect.fnUntraced(function*() {
    leakStats.resolverBatches = 0
    leakStats.resolverRequestedUsers = 0
    const client = yield* ApiClientFactory.makeFor(Layer.empty)(Rsc)
    const expectedPerRequestResolves = LEAK_USER_COUNT * (2 + LEAK_LIKES_PER_POST)
    const first = yield* client.LeakProbePosts.handler()
    expect(first).toBe(expectedPerRequestResolves)
    yield* Effect.forEach(
      Array.from({ length: LEAK_REQUEST_COUNT - 1 }, () => undefined),
      () => client.LeakProbePosts.handler(),
      { discard: true }
    )
    expect(leakStats.resolverRequestedUsers).toBe(LEAK_USER_COUNT)
  }, Effect.provide(LeakyTestLayer)),
  { timeout: 30_000 }
)

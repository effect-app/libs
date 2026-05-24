/**
 * Per-request ContextMap retention probe.
 *
 * Background
 * ----------
 *   `RequestContextMiddleware` provisions a per-request `ContextMapContainer`.
 *   The container backs `withRequestResolverCache`, so any User objects a
 *   request-scoped `RequestResolver` produces live inside the ContextMap for
 *   the duration of that request.
 *
 *   If the ContextMap (or anything hanging off it) is retained across
 *   requests, the cached User objects — and any large fields they carry —
 *   never become GC-eligible and memory grows with request count.
 *
 * Reproduction strategy
 * ---------------------
 *   - Define a small pool of `LeakUser` objects, each with a ~100kb `name`
 *     buffer so a leak shows up as obvious RSS growth.
 *   - Wire a `RequestResolver` that returns a FRESH `LeakUser` clone per
 *     resolve (not the base from `leakUsersById`) and records a `WeakRef` to
 *     every clone in module-scope.
 *   - The base users in `leakUsersById` are strongly held forever; the
 *     resolver-produced clones are only reachable through the per-request
 *     cache. If that cache is released when the request ends, the clones are
 *     GC-eligible — `WeakRef.deref()` returns `undefined` after `gc()`.
 *   - Fire `LEAK_REQUEST_COUNT` rpc requests, each decoding posts whose
 *     `UserFromId` fields drive the resolver. Then force GC and assert that
 *     zero clones survive.
 *
 * Run with `NODE_OPTIONS=--expose-gc` so `globalThis.gc` is available.
 */
import { NodeHttpServer } from "@effect/platform-node"
import { expect, it } from "@effect/vitest"
import { SchemaGetter } from "effect"
import { ApiClientFactory, makeRpcClient } from "effect-app/client"
import { HttpRouter, HttpServer } from "effect-app/http"
import { DefaultGenericMiddlewares } from "effect-app/middleware"
import { MiddlewareMaker } from "effect-app/rpc"
import * as S from "effect-app/Schema"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Request from "effect/Request"
import * as RequestResolver from "effect/RequestResolver"
import { FetchHttpClient } from "effect/unstable/http"
import { RpcSerialization } from "effect/unstable/rpc"
import { createServer } from "http"
import { RequestContextMiddleware } from "../src/api/internal/RequestContextMiddleware.js"
import { makeRouter } from "../src/api/routing.js"
import { DefaultGenericMiddlewaresLive } from "../src/api/routing/middleware.js"
import { makeRepo } from "../src/Model/Repository.js"
import { RepositoryRegistryLive } from "../src/Model/Repository/Registry.js"
import { withRequestResolverCache } from "../src/Store/ContextMapContainer.js"
import { MemoryStoreLive } from "../src/Store/Memory.js"
import {
  AllowAnonymous,
  AllowAnonymousLive,
  RequestContextMap,
  RequireRoles,
  RequireRolesLive,
  SomeElseMiddleware,
  SomeElseMiddlewareLive,
  SomeService,
  Test,
  TestLive
} from "./fixtures.js"

// ---------------------------------------------------------------------------
// Middleware — mirrors the wiring used by rpc-context-map-streaming.
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

const { TaggedRequestFor } = makeRpcClient(AppMiddleware)
const Req = TaggedRequestFor("CtxMapLeak")

// ---------------------------------------------------------------------------
// Schema + resolver — produces a fresh clone per resolve so the only strong
// reference to each instance lives inside the per-request resolver cache.
// ---------------------------------------------------------------------------

class LeakUser extends S.Class<LeakUser>("LeakUser")({
  id: S.String,
  name: S.String
}) {}

// WeakRefs to every LeakUser the resolver hands out this session. The resolver
// returns a fresh clone (not the base from leakUsersById) so the only strong
// references to these instances live inside per-request caches / ContextMap.
// If a request's ContextMap (and the request-scoped resolver cache hanging off
// it) is properly released when the request ends, every clone becomes eligible
// for GC. If anything retains the ContextMap across requests, the clones — and
// their ~100kb name buffers — survive.
const resolvedUserRefs: Array<WeakRef<LeakUser>> = []

const leakUserResolver = RequestResolver
  .make((entries: ReadonlyArray<Request.Entry<GetLeakUserRequest>>) => {
    return Effect.forEach(entries, (entry) => {
      const base = leakUsersById.get(entry.request.userId)
      if (base === undefined) {
        return Request.complete(Exit.die(new Error(`Missing leak user ${entry.request.userId}`)))(entry)
      }
      const clone = new LeakUser({ id: base.id, name: base.name })
      resolvedUserRefs.push(new WeakRef(clone))
      return Request.complete(Exit.succeed(clone))(entry)
    }, { discard: true })
  })
  .pipe(RequestResolver.batchN(20))

const leakUserResolverWithRequestCache = withRequestResolverCache(leakUserResolver, {
  capacity: 10_000,
  strategy: "fifo"
})
  .pipe(Effect.orDie)

interface GetLeakUserRequest extends Request.Request<LeakUser, Error> {
  readonly _tag: "GetLeakUser"
  readonly userId: string
}

const GetLeakUser = Request.tagged<GetLeakUserRequest>("GetLeakUser")

const UserFromId = S.String.pipe(S.decodeTo(
  LeakUser,
  {
    decode: SchemaGetter.transformOrFail((userId) =>
      Effect.request(GetLeakUser({ userId }), leakUserResolverWithRequestCache).pipe(Effect.orDie)
    ),
    encode: SchemaGetter.transformOrFail((user) => Effect.succeed(user.id))
  }
))

class LeakLike extends S.Class<LeakLike>("LeakLike")({
  likeUserId: UserFromId
}) {}

class LeakPost extends S.Class<LeakPost>("LeakPost")({
  id: S.String,
  authorUserId: UserFromId,
  publisherUserId: UserFromId,
  likes: S.Array(LeakLike)
}) {}

class LeakProbePosts extends Req.Query<LeakProbePosts>()("LeakProbePosts", {}, {
  allowAnonymous: true,
  success: S.Number
}) {}

// ---------------------------------------------------------------------------
// Fixture data.
// ---------------------------------------------------------------------------

const LEAK_USER_COUNT = 10
const LEAK_POST_COUNT = 50
const LEAK_REQUEST_COUNT = 100
const LEAK_LIKES_PER_POST = 8

// ~100kb name buffer so each retained User clone visibly blows up RSS.
const HUGE_NAME = "x".repeat(100_000)

const leakUsers = Array.from({ length: LEAK_USER_COUNT }, (_, i) =>
  new LeakUser({
    id: `u-${i}`,
    name: `User ${i} ${HUGE_NAME}`
  }))
// Each post picks distinct users across author / publisher / likes so a single
// request decodes a varied mix rather than the same user repeatedly. With a
// 10-user pool and 8 likes per post the indices below give 10 distinct users
// per post (author + publisher + 8 likes).
const leakPosts = Array.from({ length: LEAK_POST_COUNT }, (_, i) =>
  LeakPost.make({
    id: `p-${i}`,
    authorUserId: leakUsers[i % LEAK_USER_COUNT]!,
    publisherUserId: leakUsers[(i * 3 + 1) % LEAK_USER_COUNT]!,
    likes: Array.from({ length: LEAK_LIKES_PER_POST }, (_, j) =>
      LeakLike.make({
        likeUserId: leakUsers[(i + j * 2 + 2) % LEAK_USER_COUNT]!
      }))
  }))
const leakUsersById = new Map(leakUsers.map((_) => [_.id, _] as const))

const Rsc = { LeakProbePosts }

const router = Router(Rsc)({
  *effect(match) {
    return match({
      LeakProbePosts: () =>
        Effect
          .gen(function*() {
            const postRepo = yield* makeRepo("LeakProbePost", LeakPost, {
              makeInitial: Effect.succeed(leakPosts)
            })
            const posts = yield* postRepo.all
            // Touch every user reference so `UserFromId` decode (→ resolver
            // → cache) actually runs and produces the clones we WeakRef-track.
            const refs = posts.flatMap((post) => [
              post.authorUserId,
              post.publisherUserId,
              ...post.likes.map((like) => like.likeUserId)
            ])
            return refs.length
          })
          .pipe(Effect.provide(Layer.merge(MemoryStoreLive, RepositoryRegistryLive)))
    })
  }
})

const RpcRouterLayer = matchAll({ router })

// ---------------------------------------------------------------------------
// HTTP wiring.
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
  "resolver-produced User clones are GC-eligible after their requests complete",
  Effect.fnUntraced(function*() {
    if (typeof globalThis.gc !== "function") {
      return yield* Effect.die(
        new Error("run vitest with --expose-gc (NODE_OPTIONS=--expose-gc) to enable the WeakRef leak probe")
      )
    }
    resolvedUserRefs.length = 0
    const client = yield* ApiClientFactory.makeFor(Layer.empty)(Rsc)
    yield* Effect.forEach(
      Array.from({ length: LEAK_REQUEST_COUNT }, () => undefined),
      () => client.LeakProbePosts.handler(),
      { discard: true }
    )
    // Let request finalizers and any pending microtasks drain before forcing GC.
    yield* Effect.sleep("200 millis")
    globalThis.gc()
    yield* Effect.sleep("50 millis")
    globalThis.gc()
    const totalProduced = resolvedUserRefs.length
    const alive = resolvedUserRefs.filter((ref) => ref.deref() !== undefined).length
    // Sanity: the resolver actually ran (otherwise the probe proves nothing).
    expect(totalProduced).toBeGreaterThan(0)
    // If a leaky ContextMap (or anything else) retains the per-request resolver
    // cache across requests, the cached User clones — each ~100kb — survive GC
    // and `alive` grows with the number of requests. Post-fix every clone must
    // be collectable once its request scope closes.
    expect(alive).toBe(0)
  }, Effect.provide(TestLayer)),
  { timeout: 30_000 }
)

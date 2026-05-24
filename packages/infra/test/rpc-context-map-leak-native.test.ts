/**
 * Native effect Rpc Server/Client variant of the ContextMap leak probe.
 *
 * Mirrors rpc-context-map-leak.test.ts but skips effect-app's MiddlewareMaker
 * / makeRouter / makeRpcClient / ApiClientFactory wrappers and wires the
 * request through native `RpcServer.layerHttp` + `RpcClient.layerProtocolHttp`
 * instead. The only effect-app piece kept is `RequestContextMiddleware()` —
 * applied directly as an `HttpRouter.middleware` — because that's the code
 * path being probed.
 *
 * Run with `NODE_OPTIONS=--expose-gc` so `globalThis.gc` is available.
 */
import { NodeHttpServer } from "@effect/platform-node"
import { expect, it } from "@effect/vitest"
import { Schema, SchemaGetter } from "effect"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Layer from "effect/Layer"
import * as Request from "effect/Request"
import * as RequestResolver from "effect/RequestResolver"
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient"
import * as HttpRouter from "effect/unstable/http/HttpRouter"
import * as HttpServer from "effect/unstable/http/HttpServer"
import { Rpc, RpcClient, RpcGroup, RpcSerialization, RpcServer } from "effect/unstable/rpc"
import { createServer } from "http"
import { RequestContextMiddleware } from "../src/api/internal/RequestContextMiddleware.js"
import { makeRepo } from "../src/Model/Repository.js"
import { RepositoryRegistryLive } from "../src/Model/Repository/Registry.js"
import { withRequestResolverCache } from "../src/Store/ContextMapContainer.js"
import { MemoryStoreLive } from "../src/Store/Memory.js"

// ---------------------------------------------------------------------------
// Schema + resolver — identical shape to rpc-context-map-leak.test.ts. The
// resolver returns a FRESH `LeakUser` clone per resolve so the only strong
// reference to each instance lives inside the per-request resolver cache.
// ---------------------------------------------------------------------------

class LeakUser extends Schema.Class<LeakUser>("LeakUser")({
  id: Schema.String,
  name: Schema.String
}) {}

const resolvedUserRefs: Array<WeakRef<LeakUser>> = []

interface GetLeakUserRequest extends Request.Request<LeakUser, Error> {
  readonly _tag: "GetLeakUser"
  readonly userId: string
}

const GetLeakUser = Request.tagged<GetLeakUserRequest>("GetLeakUser")

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

const UserFromId = Schema.String.pipe(Schema.decodeTo(
  LeakUser,
  {
    decode: SchemaGetter.transformOrFail((userId) =>
      Effect.request(GetLeakUser({ userId }), leakUserResolverWithRequestCache).pipe(Effect.orDie)
    ),
    encode: SchemaGetter.transformOrFail((user) => Effect.succeed(user.id))
  }
))

class LeakLike extends Schema.Class<LeakLike>("LeakLike")({
  likeUserId: UserFromId
}) {}

class LeakPost extends Schema.Class<LeakPost>("LeakPost")({
  id: Schema.String,
  authorUserId: UserFromId,
  publisherUserId: UserFromId,
  likes: Schema.Array(LeakLike)
}) {}

// ---------------------------------------------------------------------------
// Fixture data.
// ---------------------------------------------------------------------------

const LEAK_USER_COUNT = 10
const LEAK_POST_COUNT = 50
const LEAK_REQUEST_COUNT = 100
const LEAK_LIKES_PER_POST = 8

const HUGE_NAME = "x".repeat(100_000)

const leakUsers = Array.from({ length: LEAK_USER_COUNT }, (_, i) =>
  new LeakUser({
    id: `u-${i}`,
    name: `User ${i} ${HUGE_NAME}`
  }))
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

// ---------------------------------------------------------------------------
// Native Rpc group + handler.
// ---------------------------------------------------------------------------

const LeakProbePosts = Rpc.make("LeakProbePosts", { success: Schema.Number })

const LeakGroup = RpcGroup.make(LeakProbePosts)

const HandlersLayer = LeakGroup.toLayer({
  LeakProbePosts: () =>
    Effect
      .gen(function*() {
        const postRepo = yield* makeRepo("LeakProbePost", LeakPost, {
          makeInitial: Effect.succeed(leakPosts)
        })
        const posts = yield* postRepo.all
        // Touch every user reference so `UserFromId` decode (→ resolver →
        // cache) runs and produces the clones tracked by resolvedUserRefs.
        const refs = posts.flatMap((post) => [
          post.authorUserId,
          post.publisherUserId,
          ...post.likes.map((like) => like.likeUserId)
        ])
        return refs.length
      })
      .pipe(Effect.provide(Layer.merge(MemoryStoreLive, RepositoryRegistryLive)))
})

// ---------------------------------------------------------------------------
// HTTP wiring — NodeHttpServer + RpcServer.layerHttp + RequestContextMiddleware.
// ---------------------------------------------------------------------------

const NodeServerLayer = NodeHttpServer.layer(() => createServer(), { port: 0 })

const RpcServerLayer = RpcServer
  .layerHttp({
    group: LeakGroup,
    path: "/rpc",
    protocol: "http"
  })
  .pipe(Layer.provide(HandlersLayer))

const RequestContextMiddlewareLayer = HttpRouter.middleware(RequestContextMiddleware()).layer

const ServerLayer = HttpRouter
  .serve(
    RpcServerLayer.pipe(Layer.provide(RequestContextMiddlewareLayer))
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
      const url = `http://${host}:${addr.port}/rpc`
      return RpcClient.layerProtocolHttp({ url }).pipe(
        Layer.provideMerge(FetchHttpClient.layer),
        Layer.provideMerge(RpcSerialization.layerNdjson)
      )
    })
  )
  .pipe(Layer.provide(NodeServerLayer))

const TestLayer = Layer.mergeAll(ServerLayer, ClientLayer)

// ---------------------------------------------------------------------------
// Test
// ---------------------------------------------------------------------------

it.live(
  "native Rpc: resolver-produced User clones are GC-eligible after their requests complete",
  Effect.fnUntraced(function*() {
    if (typeof globalThis.gc !== "function") {
      return yield* Effect.die(
        new Error("run vitest with --expose-gc (NODE_OPTIONS=--expose-gc) to enable the WeakRef leak probe")
      )
    }
    resolvedUserRefs.length = 0
    const client = yield* RpcClient.make(LeakGroup)
    yield* Effect.forEach(
      Array.from({ length: LEAK_REQUEST_COUNT }, () => undefined),
      () => client.LeakProbePosts(),
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

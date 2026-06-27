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
import { ApiClientFactory, DataDependencies, InvalidationKeysFromServer, InvalidStateError, makeInvalidationKeysService, makeRpcClient, OptimisticConcurrencyException } from "effect-app/client"
import * as Context from "effect-app/Context"
import { HttpRouter, HttpServer } from "effect-app/http"
import { DefaultGenericMiddlewares } from "effect-app/middleware"
import { makeRepo, RepositoryRegistryLive } from "effect-app/Model"
import { Invalidation, MiddlewareMaker } from "effect-app/rpc"
import * as S from "effect-app/Schema"
import { TaggedErrorClass } from "effect-app/Schema"
import { setupRequestContextFromCurrent } from "effect-app/setupRequest"
import * as Cause from "effect/Cause"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Ref from "effect/Ref"
import * as Stream from "effect/Stream"
import { FetchHttpClient } from "effect/unstable/http"
import { RpcSerialization } from "effect/unstable/rpc"
import { createServer } from "http"
import { makeRouter } from "../src/routing.js"
import { DefaultGenericMiddlewaresLive } from "../src/routing/middleware.js"
import { MemoryStoreLive } from "../src/Store/Memory.js"
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
// Resources
// ---------------------------------------------------------------------------

const DynamicKey: Invalidation.InvalidationKey = ["dynamic", "key"]
const ExtraKey: Invalidation.InvalidationKey = ["extra", "key"]
const StreamKey: Invalidation.InvalidationKey = ["stream", "key"]

const { TaggedRequestFor } = makeRpcClient(AppMiddleware)
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

class StreamWithRepoWrite extends Req.Command<StreamWithRepoWrite>()("StreamWithRepoWrite", {}, {
  stream: true,
  allowAnonymous: true,
  success: S.Number
}) {}

class RepoItem extends S.Class<RepoItem>("RepoItem")({
  id: S.String,
  label: S.String
}) {}

class GetRepoCount extends Req.Query<GetRepoCount>()("GetRepoCount", {}, {
  allowAnonymous: true,
  success: S.Number
}) {}

class SaveRepoItem extends Req.Command<SaveRepoItem>()("SaveRepoItem", {
  id: S.String,
  label: S.String
}, {
  allowAnonymous: true,
  error: S.Union([InvalidStateError, OptimisticConcurrencyException]),
  success: S.Void
}) {}

class RepoItems extends Context.Service<RepoItems>()("RepoItems", {
  make: makeRepo("RepoItem", RepoItem, {})
}) {
  static Default = Layer.effect(this, this.make).pipe(
    Layer.provide(Layer.merge(MemoryStoreLive, RepositoryRegistryLive))
  )
}

// A second, unrelated repo — its writes must NOT invalidate a query that only read `RepoItem`.
class OtherItem extends S.Class<OtherItem>("OtherItem")({
  id: S.String,
  label: S.String
}) {}

class SaveOtherItem extends Req.Command<SaveOtherItem>()("SaveOtherItem", {
  id: S.String,
  label: S.String
}, {
  allowAnonymous: true,
  success: S.Void
}) {}

class OtherItems extends Context.Service<OtherItems>()("OtherItems", {
  make: makeRepo("OtherItem", OtherItem, {})
}) {
  static Default = Layer.effect(this, this.make).pipe(
    Layer.provide(Layer.merge(MemoryStoreLive, RepositoryRegistryLive))
  )
}

const InvRsc = {
  DoNothing,
  DoWithDynamicKey,
  DoWithBothKeys,
  DoAndFail,
  StreamWithKey,
  StreamWithRepoWrite,
  GetRepoCount,
  SaveRepoItem,
  SaveOtherItem
}

// ---------------------------------------------------------------------------
// Controllers / router
// ---------------------------------------------------------------------------

const router = Router(InvRsc)({
  dependencies: [RepoItems.Default, OtherItems.Default],
  *effect(match) {
    const repo = yield* RepoItems
    const otherRepo = yield* OtherItems
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
        ),
      StreamWithRepoWrite: () =>
        Stream.fromIterable([1, 2, 3]).pipe(
          Stream.tap((n) =>
            repo.save(new RepoItem({ id: String(n), label: "x" })).pipe(Effect.orDie, setupRequestContextFromCurrent())
          )
        ),
      GetRepoCount: () => repo.all.pipe(Effect.map((_) => _.length), Effect.orDie, setupRequestContextFromCurrent()),
      SaveRepoItem: ({ id, label }) =>
        repo.save(new RepoItem({ id, label })).pipe(Effect.orDie, setupRequestContextFromCurrent()),
      SaveOtherItem: ({ id, label }) =>
        otherRepo.save(new OtherItem({ id, label })).pipe(Effect.orDie, setupRequestContextFromCurrent())
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

const withDependencyCapture = <A, E, R>(eff: Effect.Effect<A, E, R>) =>
  Effect.gen(function*() {
    const readsRef = yield* Ref.make(DataDependencies.empty())
    const writesRef = yield* Ref.make(DataDependencies.empty())
    const svc = DataDependencies.makeDataDependencyRecorder(readsRef, writesRef)
    const result = yield* eff.pipe(Effect.provideService(DataDependencies.DataDependencyRecorder, svc), Effect.exit)
    return { result, dependencies: yield* svc.get }
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
      const error = Cause.findErrorOption(result.cause)
      expect(Option.isSome(error)).toBe(true)
      if (Option.isSome(error)) {
        expect(error.value._tag).toBe("CmdBoom")
        expect(error.value.reason).toBe("intentional failure")
      }
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

it.live(
  "stream: per-chunk repo writes are drained and forwarded to the client recorder",
  Effect.fnUntraced(function*() {
    const client = yield* ApiClientFactory.makeFor(Layer.empty)(InvRsc)
    const readsRef = yield* Ref.make(DataDependencies.empty())
    const writesRef = yield* Ref.make(DataDependencies.empty())
    const svc = DataDependencies.makeDataDependencyRecorder(readsRef, writesRef)
    const values = yield* Stream.runCollect(client.StreamWithRepoWrite.handler()).pipe(
      Effect.provideService(DataDependencies.DataDependencyRecorder, svc)
    )
    const writes = yield* Ref.get(writesRef)
    expect(values).toStrictEqual([1, 2, 3])
    // Each emitted value writes to RepoItem; routing drains the writes per chunk and the client
    // accumulates them — the recorder dedupes, so a single RepoItem entry is recorded.
    expect(writes).toStrictEqual(new Set([DataDependencies.repo("RepoItem")]))
  }, Effect.provide(TestLayer)),
  { timeout: 10_000 }
)

it.live(
  "repository dependencies flow through query and command metadata",
  Effect.fnUntraced(function*() {
    const client = yield* ApiClientFactory.makeFor(Layer.empty)(InvRsc)

    const query = yield* withDependencyCapture(client.GetRepoCount.handler())
    expect(Exit.isSuccess(query.result) && query.result.value).toBe(0)
    expect(query.dependencies.reads).toStrictEqual(new Set([DataDependencies.repo("RepoItem")]))
    expect(query.dependencies.writes).toStrictEqual(DataDependencies.empty())

    const command = yield* withDependencyCapture(client.SaveRepoItem.handler({ id: "1", label: "one" }))
    expect(Exit.isSuccess(command.result)).toBe(true)
    expect(command.dependencies.reads).toStrictEqual(DataDependencies.empty())
    expect(command.dependencies.writes).toStrictEqual(new Set([DataDependencies.repo("RepoItem")]))
  }, Effect.provide(TestLayer)),
  { timeout: 10_000 }
)

it.live(
  "query invalidation: a command's writes invalidate exactly the queries whose reads intersect",
  Effect.fnUntraced(function*() {
    const client = yield* ApiClientFactory.makeFor(Layer.empty)(InvRsc)

    // Client-side query registry: queryKey -> read dependencies forwarded by the server. Mirrors
    // @effect-app/vue's `dependencyMetadata`; the derivation predicate (`intersects`) is the exact
    // one the vue mutate engine uses to pick invalidation targets from a command's writes.
    const queryReads = new Map<string, DataDependencies.DataDependencies>()
    const invalidatedBy = (writes: DataDependencies.DataDependencies) =>
      [...queryReads]
        .filter(([, reads]) => DataDependencies.intersects(reads, writes))
        .map(([key]) => key)

    // Run the query through the real client; register its forwarded reads under its key.
    const query = yield* withDependencyCapture(client.GetRepoCount.handler())
    expect(Exit.isSuccess(query.result)).toBe(true)
    queryReads.set("GetRepoCount", query.dependencies.reads)
    // Before any command, nothing is invalidated.
    expect(invalidatedBy(DataDependencies.empty())).toStrictEqual([])

    // A command writing the SAME repo the query read => the query is selected for invalidation.
    const save = yield* withDependencyCapture(client.SaveRepoItem.handler({ id: "1", label: "one" }))
    expect(Exit.isSuccess(save.result)).toBe(true)
    expect(invalidatedBy(save.dependencies.writes)).toStrictEqual(["GetRepoCount"])

    // A command writing an UNRELATED repo => the query is NOT invalidated (negative control).
    const saveOther = yield* withDependencyCapture(client.SaveOtherItem.handler({ id: "2", label: "two" }))
    expect(Exit.isSuccess(saveOther.result)).toBe(true)
    expect(saveOther.dependencies.writes).toStrictEqual(new Set([DataDependencies.repo("OtherItem")]))
    expect(invalidatedBy(saveOther.dependencies.writes)).toStrictEqual([])
  }, Effect.provide(TestLayer)),
  { timeout: 10_000 }
)

/* eslint-disable @typescript-eslint/no-explicit-any */
import { awaitAtomResult, buildQueryFamily, invalidateAndAwait, makeAtomClientRuntime } from "@effect-app/vue/atomQuery"
import { invalidateQueries } from "@effect-app/vue/mutate"
import { defaultRegistry } from "@effect/atom-vue"
import { NodeHttpServer } from "@effect/platform-node"
import { expect, it } from "@effect/vitest"
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query"
import { ApiClientFactory, InvalidStateError, makeRpcClient, NotLoggedInError, OptimisticConcurrencyException } from "effect-app/client"
import * as Context from "effect-app/Context"
import * as Effect from "effect-app/Effect"
import { tuple } from "effect-app/Function"
import { HttpRouter, HttpServer } from "effect-app/http"
import * as Layer from "effect-app/Layer"
import { DefaultGenericMiddlewares } from "effect-app/middleware"
import { makeRepo, RepositoryRegistryLive } from "effect-app/Model"
import { MiddlewareMaker, RpcContextMap, RpcMiddleware } from "effect-app/rpc"
import * as S from "effect-app/Schema"
import * as ManagedRuntime from "effect/ManagedRuntime"
import * as Option from "effect/Option"
import * as Scope from "effect/Scope"
import { FetchHttpClient } from "effect/unstable/http"
import * as Reactivity from "effect/unstable/reactivity/Reactivity"
import { RpcSerialization } from "effect/unstable/rpc"
import { createServer } from "http"
import { createApp, effectScope, ref } from "vue"
import { RequestContextMiddleware } from "../../infra/src/internal/RequestContextMiddleware.ts"
import { makeRouter } from "../../infra/src/routing.ts"
import { DefaultGenericMiddlewaresLive } from "../../infra/src/routing/middleware.ts"
import { MemoryStoreLive } from "../../infra/src/Store/Memory.ts"
import { makeTanstackQuery, makeTanstackQueryInvalidator } from "../../vue/src/internal/tanstackQuery.ts"

class RequestContextMap extends RpcContextMap.makeMap({
  allowAnonymous: RpcContextMap.makeInverted()(NotLoggedInError)
}) {}

class AllowAnonymous extends RpcMiddleware.Tag<AllowAnonymous>()("AllowAnonymous", {
  dynamic: RequestContextMap.get("allowAnonymous")
}) {}

const AllowAnonymousLive = Layer.effect(
  AllowAnonymous,
  Effect.succeed(Effect.fnUntraced(function*(effect, { rpc }) {
    yield* Scope.Scope
    if (!RequestContextMap.getConfig(rpc).allowAnonymous) {
      return yield* new NotLoggedInError({ message: "Not logged in" })
    }
    return yield* effect
  }))
)

class AppMiddleware extends MiddlewareMaker
  .Tag<AppMiddleware>()("AppMiddleware", RequestContextMap)
  .middleware(AllowAnonymous)
  .middleware(...DefaultGenericMiddlewares)
{
  static Default = this.layer.pipe(
    Layer.provide([AllowAnonymousLive, DefaultGenericMiddlewaresLive] as const)
  )
}

const { Router, matchAll } = makeRouter(AppMiddleware.Default)
const { TaggedRequestFor } = makeRpcClient(AppMiddleware)
const Req = TaggedRequestFor("RepoInvalidation")

class RepoItem extends S.Class<RepoItem>("RepoItem")({ id: S.String, label: S.String }) {}
class OtherItem extends S.Class<OtherItem>("OtherItem")({ id: S.String, label: S.String }) {}

class RepoItems extends Context.Service<RepoItems>()("RepoItems", {
  make: makeRepo("RepoItem", RepoItem, {})
}) {
  static Default = Layer.effect(this, this.make).pipe(
    Layer.provide(Layer.merge(MemoryStoreLive, RepositoryRegistryLive))
  )
}

class OtherItems extends Context.Service<OtherItems>()("OtherItems", {
  make: makeRepo("OtherItem", OtherItem, {})
}) {
  static Default = Layer.effect(this, this.make).pipe(
    Layer.provide(Layer.merge(MemoryStoreLive, RepositoryRegistryLive))
  )
}

class GetRepoCount extends Req.Query<GetRepoCount>()("GetRepoCount", {}, {
  allowAnonymous: true,
  success: S.Number
}) {}

class GetRepoCountRuns extends Req.Query<GetRepoCountRuns>()("GetRepoCountRuns", {}, {
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

class SaveOtherItem extends Req.Command<SaveOtherItem>()("SaveOtherItem", {
  id: S.String,
  label: S.String
}, {
  allowAnonymous: true,
  success: S.Void
}) {}

const RepoRpcs = { GetRepoCount, GetRepoCountRuns, SaveRepoItem, SaveOtherItem }
let repoCountRuns = 0

const router = Router(RepoRpcs)({
  dependencies: [RepoItems.Default, OtherItems.Default],
  *effect(match) {
    const repo = yield* RepoItems
    const otherRepo = yield* OtherItems
    return match({
      GetRepoCount: () =>
        Effect
          .sync(() => repoCountRuns++)
          .pipe(Effect.andThen(repo.all), Effect.map((items) => items.length), Effect.orDie),
      GetRepoCountRuns: () => Effect.sync(() => repoCountRuns),
      SaveRepoItem: ({ id, label }) => repo.save(new RepoItem({ id, label })).pipe(Effect.orDie),
      SaveOtherItem: ({ id, label }) => otherRepo.save(new OtherItem({ id, label })).pipe(Effect.orDie)
    })
  }
})

const RpcRouterLayer = matchAll({ router })
const NodeServerLayer = NodeHttpServer.layer(() => createServer(), { port: 0 })

const ServerLayer = HttpRouter
  .serve(RpcRouterLayer.pipe(Layer.provide(HttpRouter.middleware(RequestContextMiddleware()).layer)))
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
      return ApiClientFactory
        .layer({ url: `http://${host}:${addr.port}`, headers: Option.none() })
        .pipe(Layer.provide(FetchHttpClient.layer))
    })
  )
  .pipe(Layer.provide(NodeServerLayer))

const TestLayer = Layer.mergeAll(ServerLayer, ClientLayer, Reactivity.layer)

const setup = () => {
  repoCountRuns = 0
  const runtime = ManagedRuntime.make(TestLayer)
  return Effect
    .all(
      [
        ApiClientFactory.makeFor(Layer.empty)(RepoRpcs),
        Effect.context<any>()
      ] as const
    )
    .pipe(Effect.map(([client, context]) => tuple(runtime, client, context)), runtime.runPromise)
}

it("atom engine: rpc repo write invalidates and refetches; unrelated rpc write does not", async () => {
  const [runtime, client, context] = await setup()
  const reactivity = Context.get(context, Reactivity.Reactivity)
  const rt = makeAtomClientRuntime(() => Layer.succeedContext(context), runtime.memoMap)
  const invalidator = {
    invalidateAndAwait: (keys: ReadonlyArray<ReadonlyArray<unknown>>) =>
      invalidateAndAwait(keys).pipe(Effect.provideService(Reactivity.Reactivity, reactivity))
  }
  const atom = buildQueryFamily(rt, client.GetRepoCount as any)(undefined)
  const unmount = defaultRegistry.mount(atom)
  const run = <A, E>(effect: Effect.Effect<A, E, never>) => Effect.runPromise(effect)
  const save = (id: string) =>
    run(
      invalidateQueries(client.SaveRepoItem, undefined, invalidator)(client.SaveRepoItem.handler({ id, label: id }), {
        id,
        label: id
      })
        .pipe(Effect.provide(context)) as any
    )
  const saveOther = (id: string) =>
    run(
      invalidateQueries(client.SaveOtherItem, undefined, invalidator)(client.SaveOtherItem.handler({ id, label: id }), {
        id,
        label: id
      })
        .pipe(Effect.provide(context)) as any
    )

  try {
    expect(await run(awaitAtomResult(defaultRegistry, atom) as any)).toBe(0)

    await save("1")
    expect(await run(awaitAtomResult(defaultRegistry, atom) as any)).toBe(1)

    const before = await run(client.GetRepoCountRuns.handler().pipe(Effect.provide(context)) as any)
    await saveOther("x")
    const after = await run(client.GetRepoCountRuns.handler().pipe(Effect.provide(context)) as any)
    expect(after).toBe(before)
  } finally {
    unmount()
    await runtime.dispose()
  }
}, 10_000)

it("tanstack engine: rpc repo write invalidates and refetches; unrelated rpc write does not", async () => {
  const [runtime, client, context] = await setup()
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity, staleTime: 0 } }
  })
  const useQuery = makeTanstackQuery(() => context, queryClient)
  const invalidator = makeTanstackQueryInvalidator(queryClient)
  const app = createApp({ render: () => null })
  app.use(VueQueryPlugin, { queryClient })
  const scope = effectScope(true)
  let handle: any
  let data: any
  const run = <A, E>(effect: Effect.Effect<A, E, never>) => Effect.runPromise(effect)
  const save = (id: string) =>
    run(
      invalidateQueries(client.SaveRepoItem, undefined, invalidator)(client.SaveRepoItem.handler({ id, label: id }), {
        id,
        label: id
      })
        .pipe(Effect.provide(context)) as any
    )
  const saveOther = (id: string) =>
    run(
      invalidateQueries(client.SaveOtherItem, undefined, invalidator)(client.SaveOtherItem.handler({ id, label: id }), {
        id,
        label: id
      })
        .pipe(Effect.provide(context)) as any
    )

  app.runWithContext(() =>
    scope.run(() => {
      const tuple = useQuery(client.GetRepoCount as any)(ref(undefined) as any, {} as any) as any
      data = tuple[1]
      handle = tuple[3]
    })
  )

  try {
    expect(await run(handle.refetch())).toBe(0)

    await save("1")
    expect(data.value).toBe(1)

    const before = await run(client.GetRepoCountRuns.handler().pipe(Effect.provide(context)) as any)
    await saveOther("x")
    const after = await run(client.GetRepoCountRuns.handler().pipe(Effect.provide(context)) as any)
    expect(after).toBe(before)
  } finally {
    scope.stop()
    queryClient.clear()
    await runtime.dispose()
  }
}, 10_000)

/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Full-stack invalidation e2e: REAL `makeRepo` repositories (backed by the infra memory store) wired
 * into the REAL @effect-app/vue query engines. Confirms that a command writing through `repo.save`
 * invalidates and refetches a query that read through `repo.all` — for both the atom engine and the
 * legacy tanstack engine. No manual `DataDependencies.read/write`: the deps are produced by the real
 * repository operations and flow through the engine's recorder.
 *
 * A second, unrelated repository provides the negative control: writing it must NOT refetch the
 * query (confirming derivation is precise and there is no implicit namespace invalidation).
 */
import { MemoryStoreLive } from "@effect-app/infra/Store/Memory"
import { awaitAtomResult, buildQueryFamily, invalidateAndAwait, makeAtomClientRuntime } from "@effect-app/vue/atomQuery"
import { invalidateQueries } from "@effect-app/vue/mutate"
import { defaultRegistry } from "@effect/atom-vue"
import { expect, it } from "@effect/vitest"
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query"
import * as Context from "effect-app/Context"
import * as Effect from "effect-app/Effect"
import * as Layer from "effect-app/Layer"
import { makeRepo, RepositoryRegistryLive } from "effect-app/Model"
import * as S from "effect-app/Schema"
import * as ManagedRuntime from "effect/ManagedRuntime"
import * as Reactivity from "effect/unstable/reactivity/Reactivity"
import { createApp, effectScope, ref } from "vue"
// The legacy tanstack engine lives behind vue's blocked `./internal/*` export; reach it via source.
import { makeTanstackQuery, makeTanstackQueryInvalidator } from "../../vue/src/internal/tanstackQuery.ts"

class RepoItem extends S.Class<RepoItem>("RepoItem")({ id: S.String, label: S.String }) {}
class OtherItem extends S.Class<OtherItem>("OtherItem")({ id: S.String, label: S.String }) {}

class RepoItems extends Context.Service<RepoItems>()("RepoItems", { make: makeRepo("RepoItem", RepoItem, {}) }) {
  static Default = Layer.effect(this, this.make).pipe(
    Layer.provide(Layer.merge(MemoryStoreLive, RepositoryRegistryLive))
  )
}
class OtherItems extends Context.Service<OtherItems>()("OtherItems", { make: makeRepo("OtherItem", OtherItem, {}) }) {
  static Default = Layer.effect(this, this.make).pipe(
    Layer.provide(Layer.merge(MemoryStoreLive, RepositoryRegistryLive))
  )
}

// A fresh real-repository runtime per test (isolated store). The query/command effects are expressed
// purely as real repo operations; `runs` counts query-handler executions to detect (spurious) refetches.
const setupRepos = () => {
  const mrt = ManagedRuntime.make(Layer.mergeAll(RepoItems.Default, OtherItems.Default, Reactivity.layer))
  const repo = mrt.runSync(RepoItems)
  const other = mrt.runSync(OtherItems)
  const baseContext = mrt.runSync(Effect.context<any>())
  let runs = 0
  const count = Effect
    .sync(() => runs++)
    .pipe(
      Effect.andThen(repo.all),
      Effect.map((items) => items.length),
      Effect.orDie
    )
  const save = (id: string) => repo.save(new RepoItem({ id, label: id })).pipe(Effect.orDie)
  const saveOther = (id: string) => other.save(new OtherItem({ id, label: id })).pipe(Effect.orDie)
  return { baseContext, memoMap: mrt.memoMap, count, save, saveOther, runs: () => runs }
}

it("atom engine: repo.save invalidates+refetches the query; an unrelated repo write does not", async () => {
  const { baseContext, count, memoMap, runs, save, saveOther } = setupRepos()
  const reactivity = Context.get(baseContext, Reactivity.Reactivity)
  const rt = makeAtomClientRuntime(
    () => Layer.succeedContext(baseContext),
    memoMap
  )
  const invalidator = {
    invalidateAndAwait: (keys: ReadonlyArray<ReadonlyArray<unknown>>) =>
      invalidateAndAwait(keys).pipe(Effect.provideService(Reactivity.Reactivity, reactivity))
  }
  const atom = buildQueryFamily(rt as any, { id: "AtomRepo.List", handler: () => count } as any)(undefined)
  const unmount = defaultRegistry.mount(atom)
  const saveCmd = (id: string, eff: Effect.Effect<unknown, never, any>) =>
    Effect.runPromise(
      invalidateQueries({ id }, undefined, invalidator)(eff, { id }).pipe(Effect.provide(baseContext)) as any
    )

  try {
    expect(await Effect.runPromise(awaitAtomResult(defaultRegistry, atom) as any)).toBe(0)

    // Real write to the repo the query read => refetch; the query now sees the new item.
    await saveCmd("AtomRepo.Save", save("1"))
    expect(await Effect.runPromise(awaitAtomResult(defaultRegistry, atom) as any)).toBe(1)

    // Negative control: writing an UNRELATED repo must not re-run the query handler.
    const before = runs()
    await saveCmd("AtomOther.Save", saveOther("x"))
    expect(runs()).toBe(before)
  } finally {
    unmount()
  }
})

it("tanstack engine: repo.save invalidates+refetches the query; an unrelated repo write does not", async () => {
  const { baseContext, count, runs, save, saveOther } = setupRepos()
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity, staleTime: 0 } }
  })
  const useQuery = makeTanstackQuery(() => baseContext, queryClient)
  const invalidator = makeTanstackQueryInvalidator(queryClient)

  const app = createApp({ render: () => null })
  app.use(VueQueryPlugin, { queryClient })
  const scope = effectScope(true)
  let handle: any
  let data: any
  app.runWithContext(() =>
    scope.run(() => {
      const tuple = useQuery({ id: "TanstackRepo.List", handler: () => count } as any)(
        ref(undefined) as any,
        {} as any
      ) as any
      data = tuple[1]
      handle = tuple[3]
    })
  )
  const saveCmd = (id: string, eff: Effect.Effect<unknown, never, any>) =>
    Effect.runPromise(invalidateQueries({ id }, undefined, invalidator)(eff, { id }).pipe(Effect.provide(baseContext)))

  try {
    expect(await Effect.runPromise(handle.refetch())).toBe(0)

    await saveCmd("TanstackRepo.Save", save("1"))
    expect(data.value).toBe(1)

    // Negative control: writing an UNRELATED repo must not re-run the query handler.
    const before = runs()
    await saveCmd("TanstackOther.Save", saveOther("x"))
    expect(runs()).toBe(before)
  } finally {
    scope.stop()
  }
})

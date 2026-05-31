/* eslint-disable @typescript-eslint/no-explicit-any */
import { defaultRegistry } from "@effect/atom-vue"
import { expect, it } from "@effect/vitest"
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query"
import { DataDependencies, InvalidationKeysFromServer, makeQueryKey } from "effect-app/client"
import * as Context from "effect-app/Context"
import * as Effect from "effect-app/Effect"
import * as Fiber from "effect/Fiber"
import * as Layer from "effect/Layer"
import * as ManagedRuntime from "effect/ManagedRuntime"
import { TestClock } from "effect/testing"
import * as Reactivity from "effect/unstable/reactivity/Reactivity"
import { createApp, effectScope, ref } from "vue"
import { awaitAtomResult, buildQueryFamily, invalidateAndAwait, makeAtomClientRuntime } from "../src/atomQuery.js"
import { clearQueryReadDependencies, getDerivedInvalidationKeys, setQueryReadDependencies } from "../src/dependencyMetadata.js"
import { makeTanstackQuery, makeTanstackQueryInvalidator } from "../src/internal/tanstackQuery.js"
import { invalidateQueries } from "../src/mutate.js"

const repo = DataDependencies.repo("FrontendRepo")
const otherRepo = DataDependencies.repo("OtherRepo")

// --- shared registry + derivation logic --------------------------------------------------------

it("getDerivedInvalidationKeys returns keys of queries whose reads intersect the writes", () => {
  const inventoryKey = ["$Inventory", "List", undefined]
  const ordersKey = ["$Orders", "List", undefined]
  setQueryReadDependencies(inventoryKey, [repo])
  setQueryReadDependencies(ordersKey, [otherRepo])

  try {
    expect(getDerivedInvalidationKeys([repo])).toEqual([inventoryKey])
    expect(getDerivedInvalidationKeys([repo, otherRepo])).toEqual([inventoryKey, ordersKey])
    expect(getDerivedInvalidationKeys([])).toEqual([])
  } finally {
    clearQueryReadDependencies(inventoryKey)
    clearQueryReadDependencies(ordersKey)
  }
})

it("clearing read dependencies drops the query from derivation", () => {
  const inventoryKey = ["$Inventory", "List", undefined]
  setQueryReadDependencies(inventoryKey, [repo])
  clearQueryReadDependencies(inventoryKey)
  expect(getDerivedInvalidationKeys([repo])).toEqual([])
})

it("derivation matches on both dependency type and name (repo vs signal)", () => {
  const key = ["$Live", "Feed", undefined]
  setQueryReadDependencies(key, [DataDependencies.signal("Feed")])
  try {
    // Same name but different type (repo "Feed") must NOT intersect a signal read.
    expect(getDerivedInvalidationKeys([DataDependencies.repo("Feed")])).toEqual([])
    // Same type and name does intersect.
    expect(getDerivedInvalidationKeys([DataDependencies.signal("Feed")])).toEqual([key])
  } finally {
    clearQueryReadDependencies(key)
  }
})

it("derivation intersects when any one of multiple reads matches a write", () => {
  const key = ["$Mixed", "List", undefined]
  setQueryReadDependencies(key, [DataDependencies.repo("A"), DataDependencies.repo("B")])
  try {
    expect(getDerivedInvalidationKeys([DataDependencies.repo("B")])).toEqual([key])
    expect(getDerivedInvalidationKeys([DataDependencies.repo("C")])).toEqual([])
  } finally {
    clearQueryReadDependencies(key)
  }
})

it.effect("a command's write deps invalidate active queries whose recorded reads intersect", () =>
  Effect.gen(function*() {
    const inventoryKey = ["$Inventory", "List", undefined]
    setQueryReadDependencies(inventoryKey, [repo])

    const recorded: Array<ReadonlyArray<unknown>> = []
    const queryInvalidator = {
      invalidateAndAwait: (keys: ReadonlyArray<ReadonlyArray<unknown>>) =>
        Effect.sync(() => keys.forEach((key) => recorded.push(key)))
    }

    // The command handler records a write to the same repo the query read from.
    const mutate = invalidateQueries({ id: "Admin.Save" }, undefined, queryInvalidator)
    const command = DataDependencies.write(repo).pipe(Effect.as(123))

    const fiber = yield* Effect.forkChild(mutate(command, { id: "abc" }))
    yield* TestClock.adjust("1 millis")
    const result = yield* Fiber.join(fiber)

    clearQueryReadDependencies(inventoryKey)

    expect(result).toBe(123)
    expect(recorded).toContainEqual(inventoryKey)
  }))

// --- atom engine: recording wires through buildQueryFamily ---------------------------------------

it("atom engine: a query records its read deps so a command's writes derive it", async () => {
  const atomRepo = DataDependencies.repo("AtomRepo")
  const mrt = ManagedRuntime.make(Layer.empty)
  const baseContext = mrt.runSync(Effect.context<never>())
  const rt = makeAtomClientRuntime(
    () => Layer.succeedContext(baseContext) as Layer.Layer<any, never, never>,
    mrt.memoMap
  )

  let runs = 0
  const self = {
    id: "AtomInv.List",
    handler: () => DataDependencies.read(atomRepo).pipe(Effect.as(++runs))
  }
  const family = buildQueryFamily(rt as any, self as any)
  const atom = family(undefined)

  const unmount = defaultRegistry.mount(atom)
  try {
    await Effect.runPromise(awaitAtomResult(defaultRegistry, atom) as any)
    expect(runs).toBe(1)

    const fullKey = [...makeQueryKey(self), undefined]
    expect(getDerivedInvalidationKeys([atomRepo])).toContainEqual(fullKey)
    expect(getDerivedInvalidationKeys([repo])).not.toContainEqual(fullKey)
  } finally {
    unmount()
    clearQueryReadDependencies([...makeQueryKey(self), undefined])
  }
})

// --- legacy tanstack engine: recording + cache-removal cleanup -----------------------------------

const makeTanstackContext = (queryClient: QueryClient) => {
  const app = createApp({ render: () => null })
  app.use(VueQueryPlugin, { queryClient })
  const scope = effectScope(true)
  const run = <T>(fn: () => T): T => {
    let out!: T
    app.runWithContext(() => {
      scope.run(() => {
        out = fn()
      })
    })
    return out
  }
  return { run, dispose: () => scope.stop() }
}

it("tanstack engine: a query records reads, and a command's writes refetch it", async () => {
  const tsRepo = DataDependencies.repo("TanstackRepo")
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity, staleTime: 0 } }
  })
  const useQuery = makeTanstackQuery(() => Context.empty(), queryClient)

  let runs = 0
  const self = { id: "TanstackInv.List", handler: () => DataDependencies.read(tsRepo).pipe(Effect.as(++runs)) }
  const ctx = makeTanstackContext(queryClient)
  const [, , , handle] = ctx.run(() => useQuery(self as any)(ref(undefined) as any, {} as any)) as any

  try {
    await Effect.runPromise(handle.refetch())
    expect(runs).toBe(1)

    const fullKey = [...makeQueryKey(self), undefined]
    const derived = getDerivedInvalidationKeys([tsRepo])
    expect(derived).toContainEqual(fullKey)

    // Invalidating those derived keys via the tanstack invalidator refetches the active query.
    await Effect.runPromise(makeTanstackQueryInvalidator(queryClient).invalidateAndAwait(derived))
    expect(runs).toBe(2)
  } finally {
    ctx.dispose()
  }
})

it("tanstack engine: evicting a query from the cache clears its recorded reads", () => {
  const tsRepo = DataDependencies.repo("TanstackEvictRepo")
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  // Installs the cache-removal subscription that clears the registry on eviction.
  makeTanstackQuery(() => Context.empty(), queryClient)

  const key = ["$TanstackEvict", "List", undefined]
  const cache = queryClient.getQueryCache()
  cache.build(queryClient, { queryKey: key, queryFn: () => Promise.resolve(1) })
  setQueryReadDependencies(key, [tsRepo])
  expect(getDerivedInvalidationKeys([tsRepo])).toContainEqual(key)

  cache.clear()
  expect(getDerivedInvalidationKeys([tsRepo])).not.toContainEqual(key)
})

// --- atom engine: GC finalizer clears recorded reads --------------------------------------------

it("atom engine: disposing the query atom clears its recorded reads", async () => {
  const atomRepo = DataDependencies.repo("AtomGcRepo")
  const mrt = ManagedRuntime.make(Layer.empty)
  const baseContext = mrt.runSync(Effect.context<never>())
  const rt = makeAtomClientRuntime(
    () => Layer.succeedContext(baseContext) as Layer.Layer<any, never, never>,
    mrt.memoMap
  )
  const self = { id: "AtomGc.List", handler: () => DataDependencies.read(atomRepo).pipe(Effect.as(1)) }
  const atom = buildQueryFamily(rt as any, self as any)(undefined)
  const fullKey = [...makeQueryKey(self), undefined]

  const unmount = defaultRegistry.mount(atom)
  await Effect.runPromise(awaitAtomResult(defaultRegistry, atom) as any)
  expect(getDerivedInvalidationKeys([atomRepo])).toContainEqual(fullKey)

  // Disposing the registry runs the atom's finalizers, including `trackReadDependencies`.
  unmount()
  defaultRegistry.reset()
  expect(getDerivedInvalidationKeys([atomRepo])).not.toContainEqual(fullKey)
})

// --- full engine e2e matrix: every invalidation source, on each engine ---------------------------
//
// For each engine, a live query records a repo read; then commands sharing the query's namespace are
// run through the real mutate path, covering every invalidation source. The command namespace matches
// the query's, so the "no refetch" cases also confirm there is NO implicit namespace invalidation.

interface EngineHarness {
  readonly queryFullKey: ReadonlyArray<unknown>
  readonly fetchInitial: () => Promise<unknown>
  readonly runs: () => number
  readonly runCommand: (options: any, command: Effect.Effect<unknown, never, any>) => Promise<unknown>
  readonly dispose: () => void
}

const makeTanstackHarness = (queryRepo: DataDependencies.DataDependency): EngineHarness => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity, staleTime: 0 } }
  })
  const useQuery = makeTanstackQuery(() => Context.empty(), queryClient)
  const invalidator = makeTanstackQueryInvalidator(queryClient)
  let runs = 0
  const self = { id: "MatrixTs.List", handler: () => DataDependencies.read(queryRepo).pipe(Effect.as(++runs)) }
  const ctx = makeTanstackContext(queryClient)
  const [, , , handle] = ctx.run(() => useQuery(self as any)(ref(undefined) as any, {} as any)) as any
  return {
    queryFullKey: [...makeQueryKey(self), undefined],
    fetchInitial: () => Effect.runPromise(handle.refetch()),
    runs: () => runs,
    runCommand: (options, command) =>
      Effect.runPromise(invalidateQueries({ id: "MatrixTs.Save" }, options, invalidator)(command, { id: "x" })),
    dispose: () => ctx.dispose()
  }
}

const makeAtomHarness = (queryRepo: DataDependencies.DataDependency): EngineHarness => {
  const mrt = ManagedRuntime.make(Reactivity.layer)
  const baseContext = mrt.runSync(Effect.context<Reactivity.Reactivity>())
  const reactivity = Context.get(baseContext, Reactivity.Reactivity)
  const rt = makeAtomClientRuntime(
    () => Layer.succeedContext(baseContext) as Layer.Layer<any, never, never>,
    mrt.memoMap
  )
  const invalidator = {
    invalidateAndAwait: (keys: ReadonlyArray<ReadonlyArray<unknown>>) =>
      invalidateAndAwait(keys).pipe(Effect.provideService(Reactivity.Reactivity, reactivity))
  }
  let runs = 0
  const self = { id: "MatrixAtom.List", handler: () => DataDependencies.read(queryRepo).pipe(Effect.as(++runs)) }
  const atom = buildQueryFamily(rt as any, self as any)(undefined)
  const unmount = defaultRegistry.mount(atom)
  return {
    queryFullKey: [...makeQueryKey(self), undefined],
    fetchInitial: () => Effect.runPromise(awaitAtomResult(defaultRegistry, atom) as any),
    runs: () => runs,
    runCommand: (options, command) =>
      Effect.runPromise(
        invalidateQueries({ id: "MatrixAtom.Save" }, options, invalidator)(command, { id: "x" })
          .pipe(Effect.andThen(awaitAtomResult(defaultRegistry, atom).pipe(Effect.exit))) as any
      ),
    dispose: () => {
      unmount()
      clearQueryReadDependencies([...makeQueryKey(self), undefined])
    }
  }
}

const runInvalidationMatrix = (engine: string, makeHarness: (repo: DataDependencies.DataDependency) => EngineHarness) =>
  it(`${engine} engine e2e: invalidation source matrix`, async () => {
    const queryRepo = DataDependencies.repo(`${engine}MatrixRepo`)
    const otherRepo = DataDependencies.repo(`${engine}MatrixOther`)
    const h = makeHarness(queryRepo)
    const noop = Effect.succeed(undefined)

    const expectRefetch = async (label: string, options: any, command: Effect.Effect<unknown, never, any>) => {
      const before = h.runs()
      await h.runCommand(options, command)
      expect(h.runs(), `${label} should refetch`).toBeGreaterThan(before)
    }
    const expectNoRefetch = async (label: string, options: any, command: Effect.Effect<unknown, never, any>) => {
      const before = h.runs()
      await h.runCommand(options, command)
      expect(h.runs(), `${label} must not refetch`).toBe(before)
    }

    try {
      await h.fetchInitial()
      expect(h.runs()).toBeGreaterThanOrEqual(1)

      // 1. write-dependency derivation: command writes the repo the query read.
      await expectRefetch("intersecting write dep", undefined, DataDependencies.write(queryRepo).pipe(Effect.as(undefined)))

      // 2. write-dependency derivation: command writes an UNRELATED repo (same namespace).
      await expectNoRefetch("unrelated write dep", undefined, DataDependencies.write(otherRepo).pipe(Effect.as(undefined)))

      // 3. explicit `queryInvalidation` config targeting the query.
      await expectRefetch("explicit config", { queryInvalidation: () => [h.queryFullKey] }, noop)

      // 4. explicit config targeting an UNRELATED key.
      await expectNoRefetch("unrelated explicit config", { queryInvalidation: () => [["$NotAQuery"]] }, noop)

      // 5. server-sent invalidation key targeting the query.
      await expectRefetch(
        "server key",
        undefined,
        Effect.flatMap(InvalidationKeysFromServer, (svc) => svc.add(h.queryFullKey)).pipe(Effect.as(undefined))
      )

      // 6. nothing — no config, no deps, no server keys, same namespace (no implicit invalidation).
      await expectNoRefetch("empty command", undefined, noop)
    } finally {
      h.dispose()
    }
  })

runInvalidationMatrix("tanstack", makeTanstackHarness)
runInvalidationMatrix("atom", makeAtomHarness)

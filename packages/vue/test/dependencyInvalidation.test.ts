/* eslint-disable @typescript-eslint/no-explicit-any */
import { defaultRegistry } from "@effect/atom-vue"
import { expect, it } from "@effect/vitest"
import { DataDependencies, type InvalidationKey, InvalidationKeysFromServer, makeQueryKey } from "effect-app/client"
import * as Context from "effect-app/Context"
import * as Effect from "effect-app/Effect"
import * as Fiber from "effect/Fiber"
import * as Layer from "effect/Layer"
import * as ManagedRuntime from "effect/ManagedRuntime"
import { TestClock } from "effect/testing"
import * as Reactivity from "effect/unstable/reactivity/Reactivity"
import { awaitAtomResult, buildQueryFamily, invalidateAndAwait, makeAtomClientRuntime } from "../src/atomQuery.js"
import { clearQueryReadDependencies, getDerivedInvalidationKeys, setQueryReadDependencies } from "../src/dependencyMetadata.js"
import { invalidateQueries, type MutationOptionsBase } from "../src/mutate.js"

const repo = DataDependencies.repo("FrontendRepo")
const otherRepo = DataDependencies.repo("OtherRepo")

// --- shared registry + derivation logic --------------------------------------------------------

it("getDerivedInvalidationKeys returns keys of queries whose reads intersect the writes", () => {
  const inventoryKey = ["$Inventory", "List", undefined]
  const ordersKey = ["$Orders", "List", undefined]
  setQueryReadDependencies(inventoryKey, new Set([repo]))
  setQueryReadDependencies(ordersKey, new Set([otherRepo]))

  try {
    expect(getDerivedInvalidationKeys(new Set([repo]))).toEqual([inventoryKey])
    expect(getDerivedInvalidationKeys(new Set([repo, otherRepo]))).toEqual([inventoryKey, ordersKey])
    expect(getDerivedInvalidationKeys(new Set())).toEqual([])
  } finally {
    clearQueryReadDependencies(inventoryKey)
    clearQueryReadDependencies(ordersKey)
  }
})

it("clearing read dependencies drops the query from derivation", () => {
  const inventoryKey = ["$Inventory", "List", undefined]
  setQueryReadDependencies(inventoryKey, new Set([repo]))
  clearQueryReadDependencies(inventoryKey)
  expect(getDerivedInvalidationKeys(new Set([repo]))).toEqual([])
})

it("derivation matches on both dependency type and name (repo vs signal)", () => {
  const key = ["$Live", "Feed", undefined]
  setQueryReadDependencies(key, new Set([DataDependencies.signal("Feed")]))
  try {
    // Same name but different type (repo "Feed") must NOT intersect a signal read.
    expect(getDerivedInvalidationKeys(new Set([DataDependencies.repo("Feed")]))).toEqual([])
    // Same type and name does intersect.
    expect(getDerivedInvalidationKeys(new Set([DataDependencies.signal("Feed")]))).toEqual([key])
  } finally {
    clearQueryReadDependencies(key)
  }
})

it("derivation intersects when any one of multiple reads matches a write", () => {
  const key = ["$Mixed", "List", undefined]
  setQueryReadDependencies(key, new Set([DataDependencies.repo("A"), DataDependencies.repo("B")]))
  try {
    expect(getDerivedInvalidationKeys(new Set([DataDependencies.repo("B")]))).toEqual([key])
    expect(getDerivedInvalidationKeys(new Set([DataDependencies.repo("C")]))).toEqual([])
  } finally {
    clearQueryReadDependencies(key)
  }
})

it.effect("a command's write deps invalidate active queries whose recorded reads intersect", () =>
  Effect.gen(function*() {
    const inventoryKey = ["$Inventory", "List", undefined]
    setQueryReadDependencies(inventoryKey, new Set([repo]))

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
    expect(getDerivedInvalidationKeys(new Set([atomRepo]))).toContainEqual(fullKey)
    expect(getDerivedInvalidationKeys(new Set([repo]))).not.toContainEqual(fullKey)
  } finally {
    unmount()
    clearQueryReadDependencies([...makeQueryKey(self), undefined])
  }
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
  expect(getDerivedInvalidationKeys(new Set([atomRepo]))).toContainEqual(fullKey)

  // Disposing the registry runs the atom's finalizers, including `trackReadDependencies`.
  unmount()
  defaultRegistry.reset()
  expect(getDerivedInvalidationKeys(new Set([atomRepo]))).not.toContainEqual(fullKey)
})

// --- full engine e2e matrix: every invalidation source -----------------------------------------
//
// A live query records a repo read; then commands sharing the query's namespace are
// run through the real mutate path, covering every invalidation source. The command namespace matches
// the query's, so the "no refetch" cases also confirm there is NO implicit namespace invalidation.

interface EngineHarness {
  readonly queryFullKey: ReadonlyArray<unknown>
  readonly serverInvalidationKey: InvalidationKey
  readonly fetchInitial: () => Promise<unknown>
  readonly runs: () => number
  readonly runCommand: <A, E>(
    options: MutationOptionsBase | undefined,
    command: Effect.Effect<A, E>
  ) => Promise<unknown>
  readonly dispose: () => void
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
    serverInvalidationKey: makeQueryKey(self),
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

    const expectRefetch = async <A, E>(
      label: string,
      options: MutationOptionsBase | undefined,
      command: Effect.Effect<A, E>
    ) => {
      const before = h.runs()
      await h.runCommand(options, command)
      expect(h.runs(), `${label} should refetch`).toBeGreaterThan(before)
    }
    const expectNoRefetch = async <A, E>(
      label: string,
      options: MutationOptionsBase | undefined,
      command: Effect.Effect<A, E>
    ) => {
      const before = h.runs()
      await h.runCommand(options, command)
      expect(h.runs(), `${label} must not refetch`).toBe(before)
    }

    try {
      await h.fetchInitial()
      expect(h.runs()).toBeGreaterThanOrEqual(1)

      // 1. write-dependency derivation: command writes the repo the query read.
      await expectRefetch(
        "intersecting write dep",
        undefined,
        DataDependencies.write(queryRepo).pipe(Effect.as(undefined))
      )

      // 2. write-dependency derivation: command writes an UNRELATED repo (same namespace).
      await expectNoRefetch(
        "unrelated write dep",
        undefined,
        DataDependencies.write(otherRepo).pipe(Effect.as(undefined))
      )

      // 3. explicit `queryInvalidation` config targeting the query.
      await expectRefetch("explicit config", { queryInvalidation: () => [h.queryFullKey as any] }, noop)

      // 4. explicit config targeting an UNRELATED key.
      await expectNoRefetch("unrelated explicit config", { queryInvalidation: () => [["$NotAQuery"]] }, noop)

      // 5. server-sent invalidation key targeting the query.
      await expectRefetch(
        "server key",
        undefined,
        Effect.flatMap(InvalidationKeysFromServer, (svc) => svc.add(h.serverInvalidationKey)).pipe(Effect.as(undefined))
      )

      // 6. nothing — no config, no deps, no server keys, same namespace (no implicit invalidation).
      await expectNoRefetch("empty command", undefined, noop)
    } finally {
      h.dispose()
    }
  })

runInvalidationMatrix("atom", makeAtomHarness)

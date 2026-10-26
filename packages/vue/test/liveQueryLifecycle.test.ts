import { defaultRegistry } from "@effect/atom-vue"
import { DataDependencies, makeQueryKey } from "effect-app/client"
import * as Effect from "effect-app/Effect"
import * as Layer from "effect-app/Layer"
import * as ManagedRuntime from "effect/ManagedRuntime"
import { afterEach, describe, expect, it, vi } from "vitest"
import { awaitAtomResult, buildQueryFamily, invalidateAndAwait, makeAtomClientRuntime, withQueryOptions } from "../src/atomQuery.js"
import { getQueryReadDependencies } from "../src/dependencyMetadata.js"
import { acquireLiveQueryFetch, awaitLiveQueryFetch, beginLiveQueryFetch, configureLiveQueryInvalidation, endLiveQueryFetch, type LiveQueryInvalidationSource, registerLiveQuery, releaseLiveQueryFetch } from "../src/liveQueryInvalidation.js"

type Keys = Array<ReadonlyArray<ReadonlyArray<unknown>>>

const repo = DataDependencies.repo("Inventory", ["item-1"])
const never = () => new Promise<void>(() => {})
const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

const acquire = (key: ReadonlyArray<unknown>) => {
  const fetch = acquireLiveQueryFetch(key)
  if (fetch === undefined) throw new Error("expected a live fetch")
  return fetch
}

const isRegistered = (key: ReadonlyArray<unknown>) => {
  const fetch = acquireLiveQueryFetch(key)
  if (fetch !== undefined) releaseLiveQueryFetch(fetch)
  return fetch !== undefined
}

const makeSource = (ready: () => Promise<void> = () => Promise.resolve()) => {
  const invalidations: Keys = []
  const handlers = { receive: (_writes: DataDependencies.DataDependencies) => {}, reset: () => {} }
  const source: LiveQueryInvalidationSource = {
    ready,
    subscribe: (onWrites, onReset) => {
      handlers.receive = onWrites
      handlers.reset = onReset
      return () => {}
    },
    invalidate: (keys) => invalidations.push(keys)
  }
  return { source, invalidations, handlers }
}

describe("live query lifecycle", () => {
  const cleanups: Array<() => void> = []

  afterEach(async () => {
    while (cleanups.length > 0) cleanups.pop()?.()
    defaultRegistry.reset()
    vi.useRealTimers()
    await flush()
  })

  it("keeps a delayed invalidation when the replayed fetch publishes its result", async () => {
    const dependency = DataDependencies.repo("DelayedOrders")
    const { handlers, source } = makeSource()
    let calls = 0
    configureLiveQueryInvalidation({
      ...source,
      invalidate: (keys) => void Effect.runPromise(invalidateAndAwait(keys))
    })
    const mrt = ManagedRuntime.make(Layer.empty)
    cleanups.push(() => void mrt.dispose())
    const rt = makeAtomClientRuntime(() => Layer.empty, mrt.memoMap)
    const query = {
      id: "DelayedOrders.List",
      handler: () =>
        DataDependencies.read(dependency).pipe(Effect.andThen(Effect.sync(() => {
          // the server changes while the initial fetch is still discovering
          if (++calls === 1) handlers.receive(new Set([dependency]))
          return calls
        })))
    }
    const atom = withQueryOptions(
      buildQueryFamily(rt, query)(undefined),
      { live: { maxDelayMs: 10 }, revalidateOnFocus: false },
      [...makeQueryKey(query), undefined]
    )
    cleanups.push(defaultRegistry.mount(atom))
    await Effect.runPromise(awaitAtomResult(defaultRegistry, atom))
    await new Promise((resolve) => setTimeout(resolve, 30))
    await Effect.runPromise(awaitAtomResult(defaultRegistry, atom))
    expect(calls).toBe(2)
  })

  it("lets settled queries react while another query is still discovering", () => {
    const { handlers, invalidations, source } = makeSource(never)
    configureLiveQueryInvalidation(source)
    const pending = ["$Inventory", "Get", { id: "pending" }]
    const settled = ["$Inventory", "List", undefined]
    cleanups.push(registerLiveQuery(pending, () => DataDependencies.empty(), {}))
    cleanups.push(registerLiveQuery(settled, () => new Set([repo]), {}))
    const fetch = acquire(pending)
    cleanups.push(() => releaseLiveQueryFetch(fetch))

    handlers.receive(new Set([repo]))
    expect(invalidations).toEqual([[settled]])
  })

  it("requests readiness again when the same source is configured again", async () => {
    let calls = 0
    let open = () => {}
    const { source } = makeSource(() => ++calls === 1 ? never() : new Promise<void>((resolve) => open = resolve))
    configureLiveQueryInvalidation(source)
    const key = ["$Inventory", "Get", { id: "same" }]
    cleanups.push(registerLiveQuery(key, () => DataDependencies.empty(), {}))
    const fetch = acquire(key)
    cleanups.push(() => releaseLiveQueryFetch(fetch))
    let ready = false
    void awaitLiveQueryFetch(fetch).then(() => ready = true)

    configureLiveQueryInvalidation(source)
    await flush()
    expect(ready).toBe(false)
    open()
    await flush()
    expect(ready).toBe(true)
  })

  it("follows a source configured synchronously from ready()", async () => {
    const next = makeSource()
    const { source } = makeSource(() => {
      configureLiveQueryInvalidation(next.source)
      return never()
    })
    configureLiveQueryInvalidation(source)
    const key = ["$Inventory", "Get", { id: "sync" }]
    cleanups.push(registerLiveQuery(key, () => DataDependencies.empty(), {}))
    const fetch = acquire(key)
    cleanups.push(() => releaseLiveQueryFetch(fetch))
    await awaitLiveQueryFetch(fetch)
  })

  it("ignores a stale rejection from a replaced source", async () => {
    let reject = (_error: unknown) => {}
    const { source } = makeSource(() => new Promise<void>((_, rej) => reject = rej))
    configureLiveQueryInvalidation(source)
    const key = ["$Inventory", "Get", { id: "stale" }]
    cleanups.push(registerLiveQuery(key, () => DataDependencies.empty(), {}))
    const fetch = acquire(key)
    cleanups.push(() => releaseLiveQueryFetch(fetch))
    const waiting = awaitLiveQueryFetch(fetch)
    reject(new Error("old source"))
    configureLiveQueryInvalidation(makeSource().source)
    await expect(waiting).resolves.toBeUndefined()
  })

  it("invalidates a discovering query when the source resets", async () => {
    const { handlers, invalidations, source } = makeSource()
    configureLiveQueryInvalidation(source)
    const key = ["$Inventory", "Get", { id: "reset" }]
    let reads = DataDependencies.empty()
    cleanups.push(registerLiveQuery(key, () => reads, {}))
    const fetch = acquire(key)
    await awaitLiveQueryFetch(fetch)
    handlers.receive(new Set([repo]))
    handlers.reset()
    reads = new Set([repo])
    releaseLiveQueryFetch(fetch)
    expect(invalidations).toEqual([[key]])
  })

  it("catches up a query registered without a covering fetch", async () => {
    const { invalidations, source } = makeSource()
    configureLiveQueryInvalidation(source)
    const key = ["$Inventory", "List", "cached"]
    cleanups.push(registerLiveQuery(key, () => new Set([repo]), {}))
    expect(invalidations).toEqual([])
    await flush()
    expect(invalidations).toEqual([[key]])
  })

  it("does not catch up a query whose fetch covers the subscription", async () => {
    const { invalidations, source } = makeSource()
    configureLiveQueryInvalidation(source)
    const key = ["$Inventory", "List", "fresh"]
    cleanups.push(registerLiveQuery(key, () => new Set([repo]), {}))
    const fetch = acquire(key)
    await awaitLiveQueryFetch(fetch)
    releaseLiveQueryFetch(fetch)
    await flush()
    expect(invalidations).toEqual([])
  })

  it("refetches a query whose running fetch was only ready for a replaced source", async () => {
    configureLiveQueryInvalidation(makeSource().source)
    const key = ["$Inventory", "List", "switched"]
    cleanups.push(registerLiveQuery(key, () => new Set([repo]), {}))
    const fetch = acquire(key)
    await awaitLiveQueryFetch(fetch)
    const next = makeSource()
    configureLiveQueryInvalidation(next.source)
    await flush()
    expect(next.invalidations).toEqual([])
    releaseLiveQueryFetch(fetch)
    expect(next.invalidations).toEqual([[key]])
  })

  it("stops waiting for readiness when the fetch is aborted", async () => {
    configureLiveQueryInvalidation(makeSource(never).source)
    const key = ["$Inventory", "Get", { id: "abort" }]
    cleanups.push(registerLiveQuery(key, () => DataDependencies.empty(), {}))
    const fetch = acquire(key)
    const controller = new AbortController()
    const waiting = awaitLiveQueryFetch(fetch, controller.signal)
    controller.abort()
    await expect(waiting).rejects.toBeDefined()
    releaseLiveQueryFetch(fetch)

    const ready = vi.fn(() => Promise.resolve())
    configureLiveQueryInvalidation({ ...makeSource().source, ready })
    await flush()
    // only the catch-up for the still-registered query asks the new source
    expect(ready).toHaveBeenCalledTimes(1)
  })

  it("releases the deprecated fetch when readiness rejects", async () => {
    const { handlers, invalidations, source } = makeSource(() => Promise.reject(new Error("offline")))
    configureLiveQueryInvalidation(source)
    const key = ["$Inventory", "List", "legacy"]
    cleanups.push(registerLiveQuery(key, () => new Set([repo]), {}))
    await expect(beginLiveQueryFetch(key)).rejects.toThrow("offline")
    handlers.receive(new Set([repo]))
    expect(invalidations).toEqual([[key]])
  })

  it("records dependencies of a failed fetch", async () => {
    configureLiveQueryInvalidation(makeSource().source)
    const dependency = DataDependencies.repo("MissingOrders")
    const mrt = ManagedRuntime.make(Layer.empty)
    cleanups.push(() => void mrt.dispose())
    const rt = makeAtomClientRuntime(() => Layer.empty, mrt.memoMap)
    const query = {
      id: "MissingOrders.Get",
      handler: () => DataDependencies.read(dependency).pipe(Effect.andThen(Effect.fail("not found")))
    }
    const key = [...makeQueryKey(query), undefined]
    const atom = withQueryOptions(buildQueryFamily(rt, query)(undefined), { live: true, revalidateOnFocus: false }, key)
    cleanups.push(defaultRegistry.mount(atom))
    await Effect.runPromise(Effect.exit(awaitAtomResult(defaultRegistry, atom)))
    expect(getQueryReadDependencies(key)).toEqual(new Set([dependency]))
  })

  it("keeps dependencies of projected families apart", async () => {
    const first = DataDependencies.repo("ProjectedA")
    const second = DataDependencies.repo("ProjectedB")
    const mrt = ManagedRuntime.make(Layer.empty)
    cleanups.push(() => void mrt.dispose())
    const rt = makeAtomClientRuntime(() => Layer.empty, mrt.memoMap)
    const make = (queryKeyProjectionHash: string, dependency: DataDependencies.DataDependency) => ({
      id: "Projected.Get",
      queryKeyProjectionHash,
      handler: () => DataDependencies.read(dependency)
    })
    const a = buildQueryFamily(rt, make("a", first))(undefined)
    const b = buildQueryFamily(rt, make("b", second))(undefined)
    cleanups.push(defaultRegistry.mount(a), defaultRegistry.mount(b))
    await Effect.runPromise(awaitAtomResult(defaultRegistry, a))
    await Effect.runPromise(awaitAtomResult(defaultRegistry, b))
    const baseKey = makeQueryKey(make("a", first))
    expect(getQueryReadDependencies([...baseKey, "a", undefined])).toEqual(new Set([first]))
    expect(getQueryReadDependencies([...baseKey, "b", undefined])).toEqual(new Set([second]))
  })

  it("keeps keys with colliding hashes apart", () => {
    const { handlers, invalidations, source } = makeSource()
    configureLiveQueryInvalidation(source)
    const first = ["$Inventory", "Get", { id: "15019" }]
    const second = ["$Inventory", "Get", { id: "66804" }]
    cleanups.push(registerLiveQuery(first, () => new Set([repo]), {}))
    cleanups.push(registerLiveQuery(second, () => new Set([repo]), {}))
    handlers.receive(new Set([repo]))
    expect(invalidations).toEqual([[first], [second]])
  })

  it("subscribes once when a synchronous reset replaces the registration", () => {
    configureLiveQueryInvalidation(makeSource().source)
    const key = ["$Inventory", "List", "reentrant"]
    let unregister = registerLiveQuery(key, () => new Set([repo]), {})
    let subscriptions = 0
    let unsubscriptions = 0
    configureLiveQueryInvalidation({
      ready: () => Promise.resolve(),
      subscribe: (_onWrites, onReset) => {
        subscriptions++
        onReset()
        return () => unsubscriptions++
      },
      invalidate: () => {
        unregister()
        unregister = registerLiveQuery(key, () => new Set([repo]), {})
      }
    })
    unregister()
    expect([subscriptions, unsubscriptions]).toEqual([1, 1])
  })

  it("brings a pending delayed invalidation forward for a stricter observer", () => {
    vi.useFakeTimers()
    const { handlers, invalidations, source } = makeSource()
    configureLiveQueryInvalidation(source)
    const key = ["$Inventory", "List", "strict"]
    cleanups.push(registerLiveQuery(key, () => new Set([repo]), { maxDelayMs: 50 }))
    handlers.receive(new Set([repo]))
    vi.advanceTimersByTime(10)
    cleanups.push(registerLiveQuery(key, () => new Set([repo]), { maxDelayMs: 0 }))
    expect(invalidations).toEqual([[key]])
  })

  it("releases deprecated fetches together when they end out of order", async () => {
    const { handlers, invalidations, source } = makeSource()
    configureLiveQueryInvalidation(source)
    const first = ["$Inventory", "Get", { id: "legacy-a" }]
    const second = ["$Inventory", "Get", { id: "legacy-b" }]
    let firstReads = DataDependencies.empty()
    cleanups.push(registerLiveQuery(first, () => firstReads, {}))
    cleanups.push(registerLiveQuery(second, () => new Set([repo]), {}))
    const [a, b] = await Promise.all([beginLiveQueryFetch(first), beginLiveQueryFetch(second)])
    handlers.receive(new Set([repo]))
    endLiveQueryFetch(b)
    expect(invalidations).toEqual([])
    firstReads = new Set([repo])
    endLiveQueryFetch(a)
    expect(invalidations).toEqual([[first], [second]])
  })

  it("rejects an already aborted readiness wait", async () => {
    configureLiveQueryInvalidation(makeSource(never).source)
    const key = ["$Inventory", "Get", { id: "pre-aborted" }]
    cleanups.push(registerLiveQuery(key, () => DataDependencies.empty(), {}))
    const fetch = acquire(key)
    cleanups.push(() => releaseLiveQueryFetch(fetch))
    await expect(awaitLiveQueryFetch(fetch, AbortSignal.abort())).rejects.toBeDefined()
  })

  it("rejects an aborted wait after following a source switch", async () => {
    configureLiveQueryInvalidation(makeSource(never).source)
    const key = ["$Inventory", "Get", { id: "abort-after-switch" }]
    cleanups.push(registerLiveQuery(key, () => DataDependencies.empty(), {}))
    const fetch = acquire(key)
    cleanups.push(() => releaseLiveQueryFetch(fetch))
    const controller = new AbortController()
    const waiting = awaitLiveQueryFetch(fetch, controller.signal)
    configureLiveQueryInvalidation(makeSource(never).source)
    await flush()
    controller.abort()
    await expect(waiting).rejects.toBeDefined()
  })

  it("does not ask the source again after an unregistered query's catch-up is cancelled", async () => {
    let open = () => {}
    const ready = vi.fn(() => new Promise<void>((resolve) => open = resolve))
    const { invalidations, source } = makeSource(ready)
    configureLiveQueryInvalidation(source)
    const key = ["$Inventory", "List", "cancelled-catch-up"]
    registerLiveQuery(key, () => new Set([repo]), {})()
    open()
    await flush()
    expect(invalidations).toEqual([])
  })

  it.each([0, 60_000])("revalidates a remount once with staleTime %i", async (staleTime) => {
    const dependency = DataDependencies.repo("RemountOrders")
    configureLiveQueryInvalidation({
      ...makeSource().source,
      invalidate: (keys) => void Effect.runPromise(invalidateAndAwait(keys))
    })
    const mrt = ManagedRuntime.make(Layer.empty)
    cleanups.push(() => void mrt.dispose())
    const rt = makeAtomClientRuntime(() => Layer.empty, mrt.memoMap)
    let calls = 0
    const query = {
      id: "RemountOrders.List",
      // network latency: SWR's mount task sees the catch-up refetch in flight
      handler: () =>
        DataDependencies.read(dependency).pipe(
          Effect.andThen(Effect.sleep("1 millis")),
          Effect.andThen(Effect.sync(() => ++calls))
        )
    }
    const key = [...makeQueryKey(query), undefined]
    const atom = withQueryOptions(
      buildQueryFamily(rt, query)(undefined),
      { live: { maxDelayMs: 20 }, staleTime, revalidateOnFocus: false },
      key
    )
    const unmount = defaultRegistry.mount(atom)
    await Effect.runPromise(awaitAtomResult(defaultRegistry, atom))
    unmount()
    // the registry disposes asynchronously; a remount before that keeps the registration (nothing missed)
    await vi.waitFor(() => expect(isRegistered(key)).toBe(false))
    cleanups.push(defaultRegistry.mount(atom))
    await new Promise((resolve) => setTimeout(resolve, 50))
    await Effect.runPromise(awaitAtomResult(defaultRegistry, atom))
    expect(calls).toBe(2)
  })

  it("catches up a mounted stale query when the source is switched", async () => {
    const dependency = DataDependencies.repo("SwitchedOrders")
    const invalidate = (keys: ReadonlyArray<ReadonlyArray<unknown>>) => void Effect.runPromise(invalidateAndAwait(keys))
    configureLiveQueryInvalidation({ ...makeSource().source, invalidate })
    const mrt = ManagedRuntime.make(Layer.empty)
    cleanups.push(() => void mrt.dispose())
    const rt = makeAtomClientRuntime(() => Layer.empty, mrt.memoMap)
    let calls = 0
    const query = {
      id: "SwitchedOrders.List",
      handler: () => DataDependencies.read(dependency).pipe(Effect.andThen(Effect.sync(() => ++calls)))
    }
    const atom = withQueryOptions(
      buildQueryFamily(rt, query)(undefined),
      { live: true, staleTime: 0, revalidateOnFocus: false },
      [...makeQueryKey(query), undefined]
    )
    cleanups.push(defaultRegistry.mount(atom))
    await Effect.runPromise(awaitAtomResult(defaultRegistry, atom))
    await flush()
    expect(calls).toBe(1)
    configureLiveQueryInvalidation({ ...makeSource().source, invalidate })
    await flush()
    await Effect.runPromise(awaitAtomResult(defaultRegistry, atom))
    expect(calls).toBe(2)
  })

  it("keeps waiting when a switch runs between readiness settling and the wait resuming", async () => {
    let open = () => {}
    const ready = new Promise<void>((resolve) => open = resolve)
    configureLiveQueryInvalidation(makeSource(() => ready).source)
    const key = ["$Inventory", "Get", { id: "overtaken" }]
    cleanups.push(registerLiveQuery(key, () => DataDependencies.empty(), {}))
    const fetch = acquire(key)
    cleanups.push(() => releaseLiveQueryFetch(fetch))
    let settled = false
    void awaitLiveQueryFetch(fetch).then(() => settled = true, () => settled = true)
    void ready.then(() => configureLiveQueryInvalidation(makeSource(never).source))
    open()
    await flush()
    expect(settled).toBe(false)
  })

  it("rejects when ready() aborts the wait synchronously", async () => {
    const controller = new AbortController()
    configureLiveQueryInvalidation(
      makeSource(() => {
        controller.abort()
        return never()
      })
        .source
    )
    const key = ["$Inventory", "Get", { id: "sync-abort" }]
    cleanups.push(registerLiveQuery(key, () => DataDependencies.empty(), {}))
    const fetch = acquire(key)
    cleanups.push(() => releaseLiveQueryFetch(fetch))
    await expect(awaitLiveQueryFetch(fetch, controller.signal)).rejects.toBeDefined()
  })

  it.each(["modern", "legacy"] as const)(
    "keeps a %s wait when a switch is queued right after readiness",
    async (api) => {
      let open = () => {}
      const oldReady = new Promise<void>((resolve) => open = resolve)
      configureLiveQueryInvalidation(makeSource(() => oldReady).source)
      const key = ["$Inventory", "Get", { id: `deferred-${api}` }]
      cleanups.push(registerLiveQuery(key, () => DataDependencies.empty(), {}))
      let settled = false
      if (api === "modern") {
        const fetch = acquire(key)
        cleanups.push(() => releaseLiveQueryFetch(fetch))
        void awaitLiveQueryFetch(fetch).then(() => settled = true, () => settled = true)
      } else {
        cleanups.push(() => endLiveQueryFetch(true))
        void beginLiveQueryFetch(key).then(() => settled = true, () => settled = true)
      }
      void oldReady.then(() => queueMicrotask(() => configureLiveQueryInvalidation(makeSource(never).source)))
      open()
      await flush()
      expect(settled).toBe(false)
    }
  )
})

import { defaultRegistry } from "@effect/atom-vue"
import { DataDependencies, makeQueryKey } from "effect-app/client"
import * as Effect from "effect-app/Effect"
import * as Layer from "effect-app/Layer"
import * as ManagedRuntime from "effect/ManagedRuntime"
import { afterEach, describe, expect, it, vi } from "vitest"
import { awaitAtomResult, buildQueryFamily, invalidateAndAwait, invalidateSoft, makeAtomClientRuntime, withQueryOptions } from "../src/atomQuery.js"
import { getQueryInvalidationMode } from "../src/dependencyMetadata.js"
import { beginLiveQueryFetch, configureLiveQueryInvalidation, endLiveQueryFetch, registerLiveQuery } from "../src/liveQueryInvalidation.js"

const repo = DataDependencies.repo("Inventory", ["item-1"])
const otherId = DataDependencies.repo("Inventory", ["item-2"])

describe("live query invalidation", () => {
  const cleanups: Array<() => void> = []

  afterEach(() => {
    while (cleanups.length > 0) cleanups.pop()?.()
    vi.useRealTimers()
  })

  it.each(["await", "soft"] as const)(
    "keeps an observed %s query subscribed after successive repository-write refreshes",
    async (invalidation) => {
      const dependency = DataDependencies.repo("LiveOrders")
      const mrt = ManagedRuntime.make(Layer.empty)
      const rt = makeAtomClientRuntime(() => Layer.empty, mrt.memoMap)
      let calls = 0
      let receive = (_writes: DataDependencies.DataDependencies) => {}
      let reset = () => {}
      let settled = Promise.resolve()
      let refreshes = 0
      configureLiveQueryInvalidation({
        ready: () => Promise.resolve(),
        subscribe: (onWrites, onReset) => {
          receive = onWrites
          reset = onReset
          return () => {
            receive = () => {}
            reset = () => {}
          }
        },
        invalidate: (keys) => {
          refreshes++
          settled = Effect.runPromise(
            keys.every((key) => getQueryInvalidationMode(key) === "soft")
              ? invalidateSoft(keys).pipe(Effect.andThen(awaitAtomResult(defaultRegistry, atom)))
              : invalidateAndAwait(keys)
          )
        }
      })
      const query = {
        id: "LiveOrders.List",
        handler: () => DataDependencies.read(dependency).pipe(Effect.andThen(Effect.sync(() => ++calls)))
      }
      const base = buildQueryFamily(rt, query)(undefined)
      const atom = withQueryOptions(base, { live: true, invalidation, revalidateOnFocus: false }, [
        ...makeQueryKey(query),
        undefined
      ])
      const unmount = defaultRegistry.mount(atom)
      try {
        await Effect.runPromise(awaitAtomResult(defaultRegistry, atom))
        expect(calls).toBe(1)
        expect(getQueryInvalidationMode([...makeQueryKey(query), undefined])).toBe(invalidation)
        receive(new Set([dependency]))
        await settled
        expect(calls).toBe(2)
        expect(refreshes).toBe(1)
        receive(new Set([dependency]))
        await settled
        expect(calls).toBe(3)
        expect(refreshes).toBe(2)
        reset()
        await settled
        expect(calls).toBe(4)
        expect(refreshes).toBe(3)
        receive(new Set([dependency]))
        await settled
        expect(calls).toBe(5)
        expect(refreshes).toBe(4)
      } finally {
        unmount()
        defaultRegistry.reset()
        await mrt.dispose()
      }
    }
  )

  it.each(["write", "reset"] as const)(
    "skips registrations removed or replaced by a synchronous refresh during %s dispatch",
    (event) => {
      vi.useFakeTimers()
      const invalidations: Array<ReadonlyArray<ReadonlyArray<unknown>>> = []
      let receive = (_writes: DataDependencies.DataDependencies) => {}
      let reset = () => {}
      const first = ["$Inventory", "List", undefined]
      const removed = ["$Inventory", "Get", { id: "item-1" }]
      const replaced = ["$Inventory", "Get", { id: "item-2" }]
      let unregisterRemoved = () => {}
      let unregisterReplaced = () => {}
      configureLiveQueryInvalidation({
        ready: () => Promise.resolve(),
        subscribe: (onWrites, onReset) => {
          receive = onWrites
          reset = onReset
          return () => {}
        },
        invalidate: (keys) => {
          invalidations.push(keys)
          if (keys[0] !== first) return
          unregisterRemoved()
          unregisterReplaced()
          unregisterReplaced = registerLiveQuery(replaced, () => new Set([repo]), { maxDelayMs: 1_000 })
        }
      })

      cleanups.push(registerLiveQuery(first, () => new Set([repo]), {}))
      unregisterRemoved = registerLiveQuery(removed, () => new Set([repo]), {})
      unregisterReplaced = registerLiveQuery(replaced, () => new Set([repo]), {})
      cleanups.push(() => unregisterReplaced())

      if (event === "write") receive(new Set([repo]))
      else reset()
      vi.runAllTimers()
      expect(invalidations).toEqual([[first]])
    }
  )

  it("invalidates only live queries whose recorded reads intersect", () => {
    const invalidations: Array<ReadonlyArray<ReadonlyArray<unknown>>> = []
    let receive = (_writes: DataDependencies.DataDependencies) => {}
    configureLiveQueryInvalidation({
      ready: () => Promise.resolve(),
      subscribe: (onWrites) => {
        receive = onWrites
        return () => {}
      },
      invalidate: (keys) => invalidations.push(keys)
    })

    const key = ["$Inventory", "List", undefined]
    cleanups.push(registerLiveQuery(key, () => new Set([repo]), {}))
    receive(new Set([otherId]))
    expect(invalidations).toEqual([])

    receive(new Set([repo]))
    expect(invalidations).toEqual([[key]])
  })

  it("replays writes received while the initial query discovers its dependencies", async () => {
    const invalidations: Array<ReadonlyArray<ReadonlyArray<unknown>>> = []
    let receive = (_writes: DataDependencies.DataDependencies) => {}
    let open = () => {}
    const ready = new Promise<void>((resolve) => open = resolve)
    configureLiveQueryInvalidation({
      ready: () => ready,
      subscribe: (onWrites) => {
        receive = onWrites
        return () => {}
      },
      invalidate: (keys) => invalidations.push(keys)
    })

    const key = ["$Inventory", "Get", { id: "item-1" }]
    let reads = DataDependencies.empty()
    cleanups.push(registerLiveQuery(key, () => reads, {}))

    const starting = beginLiveQueryFetch(key)
    receive(new Set([repo]))
    open()
    const wasLive = await starting
    reads = new Set([repo])
    endLiveQueryFetch(wasLive)

    expect(invalidations).toEqual([[key]])
  })

  it("coalesces matching writes using the query's maximum delay", () => {
    vi.useFakeTimers()
    const invalidations: Array<ReadonlyArray<ReadonlyArray<unknown>>> = []
    let receive = (_writes: DataDependencies.DataDependencies) => {}
    configureLiveQueryInvalidation({
      ready: () => Promise.resolve(),
      subscribe: (onWrites) => {
        receive = onWrites
        return () => {}
      },
      invalidate: (keys) => invalidations.push(keys)
    })

    const key = ["$Inventory", "List", undefined]
    cleanups.push(registerLiveQuery(key, () => new Set([repo]), { maxDelayMs: 2_000 }))
    receive(new Set([repo]))
    receive(new Set([repo]))
    vi.advanceTimersByTime(1_999)
    expect(invalidations).toEqual([])
    vi.advanceTimersByTime(1)
    expect(invalidations).toEqual([[key]])
  })

  it("fails safe by invalidating every live query when the source resets", () => {
    const invalidations: Array<ReadonlyArray<ReadonlyArray<unknown>>> = []
    let reset = () => {}
    configureLiveQueryInvalidation({
      ready: () => Promise.resolve(),
      subscribe: (_onWrites, onReset) => {
        reset = onReset
        return () => {}
      },
      invalidate: (keys) => invalidations.push(keys)
    })

    const first = ["$Inventory", "List", undefined]
    const second = ["$Orders", "List", undefined]
    cleanups.push(registerLiveQuery(first, () => new Set([repo]), {}))
    cleanups.push(registerLiveQuery(second, () => new Set([otherId]), {}))
    reset()

    expect(invalidations).toEqual([[first], [second]])
  })
})

import { DataDependencies } from "effect-app/client"
import { afterEach, describe, expect, it, vi } from "vitest"
import { beginLiveQueryFetch, configureLiveQueryInvalidation, endLiveQueryFetch, registerLiveQuery } from "../src/liveQueryInvalidation.js"

const repo = DataDependencies.repo("Inventory", ["item-1"])
const otherId = DataDependencies.repo("Inventory", ["item-2"])

describe("live query invalidation", () => {
  const cleanups: Array<() => void> = []

  afterEach(() => {
    while (cleanups.length > 0) cleanups.pop()?.()
    vi.useRealTimers()
  })

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

import { DataDependencies } from "effect-app/client"
import * as Hash from "effect/Hash"

export interface LiveQueryOptions {
  /** Fixed maximum delay from the first matching write. Zero reacts immediately. */
  readonly maxDelayMs?: number
}

export interface LiveQueryInvalidationSource {
  /** Resolve only after events received after this point can no longer be missed. */
  readonly ready: () => Promise<void>
  readonly subscribe: (
    onWrites: (writes: DataDependencies.DataDependencies) => void,
    onReset: () => void
  ) => () => void
  readonly invalidate: (keys: ReadonlyArray<ReadonlyArray<unknown>>) => void
}

interface LiveQueryEntry {
  readonly key: ReadonlyArray<unknown>
  readonly reads: () => DataDependencies.DataDependencies
  observers: number
  readonly delays: Map<number, number>
  timer: ReturnType<typeof setTimeout> | undefined
}

const entries = new Map<number, LiveQueryEntry>()
let source: LiveQueryInvalidationSource | undefined
let unsubscribe: (() => void) | undefined
let discovering = 0
let bufferedWrites = DataDependencies.empty()

const invalidateEntry = (entry: LiveQueryEntry) => {
  entry.timer = undefined
  source?.invalidate([entry.key])
}

const schedule = (entry: LiveQueryEntry) => {
  if (entry.timer !== undefined) return
  const maxDelayMs = Math.min(...entry.delays.keys())
  if (maxDelayMs <= 0) return invalidateEntry(entry)
  entry.timer = setTimeout(() => invalidateEntry(entry), maxDelayMs)
}

const dispatch = (writes: DataDependencies.DataDependencies) => {
  if (!DataDependencies.isNonEmpty(writes)) return
  for (const entry of entries.values()) {
    if (DataDependencies.intersects(entry.reads(), writes)) schedule(entry)
  }
}

const receive = (writes: DataDependencies.DataDependencies) => {
  if (discovering > 0) {
    bufferedWrites = DataDependencies.merge(bufferedWrites, writes)
    return
  }
  dispatch(writes)
}

const reset = () => {
  bufferedWrites = DataDependencies.empty()
  for (const entry of entries.values()) {
    if (DataDependencies.isNonEmpty(entry.reads())) schedule(entry)
  }
}

const ensureSubscribed = () => {
  if (unsubscribe === undefined && source !== undefined && entries.size > 0) {
    unsubscribe = source.subscribe(receive, reset)
  }
}

export const configureLiveQueryInvalidation = (next: LiveQueryInvalidationSource) => {
  unsubscribe?.()
  unsubscribe = undefined
  source = next
  ensureSubscribed()
}

export const registerLiveQuery = (
  key: ReadonlyArray<unknown>,
  reads: () => DataDependencies.DataDependencies,
  options: LiveQueryOptions
) => {
  const hash = Hash.hash(key)
  const delay = options.maxDelayMs ?? 0
  const current = entries.get(hash)
  if (current !== undefined) {
    current.observers++
    current.delays.set(delay, (current.delays.get(delay) ?? 0) + 1)
  } else {
    entries.set(hash, {
      key,
      reads,
      observers: 1,
      delays: new Map([[delay, 1]]),
      timer: undefined
    })
  }
  ensureSubscribed()

  return () => {
    const entry = entries.get(hash)
    if (entry === undefined) return
    const delayObservers = entry.delays.get(delay) ?? 0
    if (delayObservers <= 1) entry.delays.delete(delay)
    else entry.delays.set(delay, delayObservers - 1)
    if (--entry.observers > 0) return
    if (entry.timer !== undefined) clearTimeout(entry.timer)
    entries.delete(hash)
    if (entries.size === 0) {
      unsubscribe?.()
      unsubscribe = undefined
      bufferedWrites = DataDependencies.empty()
    }
  }
}

export const beginLiveQueryFetch = async (key: ReadonlyArray<unknown>) => {
  if (!entries.has(Hash.hash(key)) || source === undefined) return false
  discovering++
  try {
    await source.ready()
    return true
  } catch (error) {
    discovering--
    throw error
  }
}

export const endLiveQueryFetch = (wasLive: boolean) => {
  if (!wasLive) return
  discovering = Math.max(0, discovering - 1)
  if (discovering > 0 || !DataDependencies.isNonEmpty(bufferedWrites)) return
  const writes = bufferedWrites
  bufferedWrites = DataDependencies.empty()
  dispatch(writes)
}

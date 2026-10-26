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
  readonly hash: number
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
let signalSourceChanged = () => {}
let sourceChanged = new Promise<void>((resolve) => signalSourceChanged = resolve)

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

// a synchronous refresh can remove or replace registrations while dispatching
const isCurrent = (entry: LiveQueryEntry) => entries.get(entry.hash) === entry

const dispatch = (writes: DataDependencies.DataDependencies) => {
  if (!DataDependencies.isNonEmpty(writes)) return
  for (const entry of Array.from(entries.values())) {
    if (isCurrent(entry) && DataDependencies.intersects(entry.reads(), writes)) schedule(entry)
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
  for (const entry of Array.from(entries.values())) {
    if (isCurrent(entry) && DataDependencies.isNonEmpty(entry.reads())) schedule(entry)
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
  signalSourceChanged()
  sourceChanged = new Promise<void>((resolve) => signalSourceChanged = resolve)
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
      hash,
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

/** Synchronously marks a live fetch as discovering; pair with `endLiveQueryFetch` even if interrupted. */
export const acquireLiveQueryFetch = (key: ReadonlyArray<unknown>) => {
  if (!entries.has(Hash.hash(key)) || source === undefined) return false
  discovering++
  return true
}

/** Waits for the current source; a reconfigured source supersedes a pending wait on the previous one. */
export const liveQueryReady = async (): Promise<void> => {
  const current = source
  if (current === undefined) return
  await Promise.race([current.ready(), sourceChanged])
  if (source !== current) return liveQueryReady()
}

/** @deprecated Interruptible between acquire and ready; use `acquireLiveQueryFetch` + `liveQueryReady`. */
export const beginLiveQueryFetch = async (key: ReadonlyArray<unknown>) => {
  if (!acquireLiveQueryFetch(key)) return false
  try {
    await liveQueryReady()
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

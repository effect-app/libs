import { DataDependencies } from "effect-app/client"
import * as MutableHashMap from "effect/MutableHashMap"
import * as Option from "effect/Option"

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
  readonly needsCatchUp: () => boolean
  observers: number
  readonly delays: Map<number, number>
  timer: ReturnType<typeof setTimeout> | undefined
  firstWriteAt: number
  deadline: number
  /** live fetches between acquire and release; their writes are buffered until reads are known */
  discovering: number
  /** live fetches still waiting for source readiness */
  awaitingReady: number
  buffered: DataDependencies.DataDependencies
  /** invalidate when discovery ends (reset, or a source epoch no fetch covered) */
  dirty: boolean
  /** latest source epoch a fetch of this entry was ready for */
  coveredEpoch: number
  /** pending check for writes missed before this subscription's epoch was covered */
  catchUp: AbortController | undefined
}

/** One live fetch: acquire before running, release on every exit. */
export interface LiveQueryFetch {
  readonly key: ReadonlyArray<unknown>
}

interface FetchState {
  readonly entry: LiveQueryEntry
  awaiting: boolean
  released: boolean
}

const entries = MutableHashMap.empty<ReadonlyArray<unknown>, LiveQueryEntry>()
const fetches = new WeakMap<LiveQueryFetch, FetchState>()
type ReadyOutcome = { readonly _tag: "ready" } | { readonly _tag: "switched" } | {
  readonly _tag: "failed"
  readonly error: unknown
}
/** One shared `ready()` call per epoch; waiters detach on abort so none accumulate on the promise. */
let observation: { readonly epoch: number; readonly waiters: Set<(outcome: ReadyOutcome) => void> } | undefined
let source: LiveQueryInvalidationSource | undefined
let unsubscribe: (() => void) | undefined
let subscribing = false
let epoch = 0

// a synchronous refresh can remove or replace registrations while dispatching
const isCurrent = (entry: LiveQueryEntry) => Option.getOrUndefined(MutableHashMap.get(entries, entry.key)) === entry

const forEachCurrent = (f: (entry: LiveQueryEntry) => void) => {
  for (const entry of Array.from(MutableHashMap.values(entries))) {
    if (isCurrent(entry)) f(entry)
  }
}

const invalidateEntry = (entry: LiveQueryEntry) => {
  entry.timer = undefined
  if (isCurrent(entry)) source?.invalidate([entry.key])
}

// (re)arm for the strictest observer; a stricter observer or write can only bring the deadline forward
const arm = (entry: LiveQueryEntry) => {
  const deadline = entry.firstWriteAt + Math.min(...entry.delays.keys())
  if (entry.timer !== undefined) {
    if (entry.deadline <= deadline) return
    clearTimeout(entry.timer)
    entry.timer = undefined
  }
  entry.deadline = deadline
  const wait = deadline - Date.now()
  if (wait <= 0) return invalidateEntry(entry)
  entry.timer = setTimeout(() => invalidateEntry(entry), wait)
}

const schedule = (entry: LiveQueryEntry) => {
  if (entry.timer === undefined) entry.firstWriteAt = Date.now()
  arm(entry)
}

// catch-up replaces a refetch, so it bypasses write coalescing; a running refetch makes SWR skip its own
const invalidateNow = (entry: LiveQueryEntry) => {
  if (entry.discovering > 0) return void (entry.dirty = true)
  if (entry.timer !== undefined) clearTimeout(entry.timer)
  invalidateEntry(entry)
}

const receive = (writes: DataDependencies.DataDependencies) => {
  if (!DataDependencies.isNonEmpty(writes)) return
  forEachCurrent((entry) => {
    if (entry.discovering > 0) entry.buffered = DataDependencies.merge(entry.buffered, writes)
    else if (DataDependencies.intersects(entry.reads(), writes)) schedule(entry)
  })
}

const reset = () =>
  forEachCurrent((entry) => {
    if (entry.discovering > 0) entry.dirty = true
    else if (DataDependencies.isNonEmpty(entry.reads())) schedule(entry)
  })

const settle = (current: NonNullable<typeof observation>, outcome: ReadyOutcome) => {
  if (observation === current) observation = undefined
  if (current.epoch !== epoch) return
  const waiters = Array.from(current.waiters)
  current.waiters.clear()
  for (const f of waiters) f(outcome)
}

const observeReady = (waiter: (outcome: ReadyOutcome) => void) => {
  let current = observation
  if (current === undefined || current.epoch !== epoch) {
    const started = { epoch, waiters: new Set([waiter]) }
    current = observation = started
    // the waiter is attached first: `ready()` may reconfigure synchronously
    let ready: Promise<void>
    try {
      ready = source?.ready() ?? Promise.resolve()
    } catch (error) {
      ready = Promise.reject(error)
    }
    ready.then(() => settle(started, { _tag: "ready" }), (error) => settle(started, { _tag: "failed", error }))
  } else {
    current.waiters.add(waiter)
  }
  const observed = current
  return () => observed.waiters.delete(waiter)
}

/** Whether the current source became ready before being replaced; rejects with its error or on abort. */
const readyOnce = (signal?: AbortSignal) =>
  new Promise<boolean>((resolve, reject) => {
    if (signal?.aborted === true) return reject(signal.reason)
    if (source === undefined) return resolve(true)
    const onAbort = () => {
      detach()
      reject(signal?.reason)
    }
    signal?.addEventListener("abort", onAbort, { once: true })
    const detach = observeReady((outcome) => {
      signal?.removeEventListener("abort", onAbort)
      if (outcome._tag === "failed") reject(outcome.error)
      else resolve(outcome._tag === "ready")
    })
  })

/** Resolves with the epoch whose readiness was observed; a reconfigured source supersedes the wait. */
const waitReady = async (signal?: AbortSignal): Promise<number> => {
  const target = epoch
  return await readyOnce(signal) ? target : waitReady(signal)
}

const cancelCatchUp = (entry: LiveQueryEntry) => {
  entry.catchUp?.abort()
  entry.catchUp = undefined
}

// a reconfigured source restarts it; a live fetch or unregistering cancels it
const catchUp = (entry: LiveQueryEntry) => {
  cancelCatchUp(entry)
  if (source === undefined) return
  const target = epoch
  const controller = new AbortController()
  entry.catchUp = controller
  readyOnce(controller.signal).then((ready) => {
    if (entry.catchUp === controller) entry.catchUp = undefined
    if (!ready || epoch !== target || !isCurrent(entry)) return
    if (entry.awaitingReady === 0 && entry.coveredEpoch !== target && entry.needsCatchUp()) invalidateNow(entry)
  }, () => {})
}

const unsubscribeNow = () => {
  const current = unsubscribe
  unsubscribe = undefined
  current?.()
}

const ensureSubscribed = () => {
  if (unsubscribe !== undefined || subscribing || source === undefined || MutableHashMap.size(entries) === 0) return
  const target = epoch
  const active = () => epoch === target
  subscribing = true
  let handle: () => void
  try {
    handle = source.subscribe(
      (writes) => {
        if (active()) receive(writes)
      },
      () => {
        if (active()) reset()
      }
    )
  } finally {
    subscribing = false
  }
  if (!active() || MutableHashMap.size(entries) === 0) {
    handle()
    return ensureSubscribed()
  }
  unsubscribe = handle
}

export const configureLiveQueryInvalidation = (next: LiveQueryInvalidationSource) => {
  unsubscribeNow()
  source = next
  epoch++
  const previous = observation
  observation = undefined
  if (previous !== undefined) {
    const waiters = Array.from(previous.waiters)
    previous.waiters.clear()
    for (const f of waiters) f({ _tag: "switched" })
  }
  ensureSubscribed()
  forEachCurrent(catchUp)
}

export const registerLiveQuery = (
  key: ReadonlyArray<unknown>,
  reads: () => DataDependencies.DataDependencies,
  options: LiveQueryOptions,
  /** checked once the source is ready; false when the caller refetches anyway (that live fetch covers missed writes) */
  registration: { readonly needsCatchUp?: () => boolean } = {}
) => {
  const delay = options.maxDelayMs ?? 0
  let entry = Option.getOrUndefined(MutableHashMap.get(entries, key))
  if (entry !== undefined) {
    entry.observers++
    entry.delays.set(delay, (entry.delays.get(delay) ?? 0) + 1)
    if (entry.timer !== undefined) arm(entry)
  } else {
    entry = {
      key,
      reads,
      needsCatchUp: registration.needsCatchUp ?? (() => true),
      observers: 1,
      delays: new Map([[delay, 1]]),
      timer: undefined,
      firstWriteAt: 0,
      deadline: 0,
      discovering: 0,
      awaitingReady: 0,
      buffered: DataDependencies.empty(),
      dirty: false,
      coveredEpoch: -1,
      catchUp: undefined
    }
    MutableHashMap.set(entries, key, entry)
    ensureSubscribed()
    // writes missed while unsubscribed (cached result, or a fetch that started before this registration)
    catchUp(entry)
  }

  const registered = entry
  let active = true
  return () => {
    if (!active) return
    active = false
    const delayObservers = registered.delays.get(delay) ?? 0
    if (delayObservers <= 1) registered.delays.delete(delay)
    else registered.delays.set(delay, delayObservers - 1)
    if (--registered.observers > 0) return
    if (registered.timer !== undefined) clearTimeout(registered.timer)
    registered.timer = undefined
    cancelCatchUp(registered)
    if (isCurrent(registered)) MutableHashMap.remove(entries, key)
    if (MutableHashMap.size(entries) === 0) unsubscribeNow()
  }
}

/** Synchronously starts a live fetch for a registered key; release it with `releaseLiveQueryFetch` on every exit. */
export const acquireLiveQueryFetch = (key: ReadonlyArray<unknown>): LiveQueryFetch | undefined => {
  const entry = Option.getOrUndefined(MutableHashMap.get(entries, key))
  if (entry === undefined || source === undefined) return undefined
  entry.discovering++
  entry.awaitingReady++
  // this fetch awaits readiness itself, covering the epoch the catch-up was waiting for
  cancelCatchUp(entry)
  const fetch: LiveQueryFetch = { key }
  fetches.set(fetch, { entry, awaiting: true, released: false })
  return fetch
}

const stopAwaiting = (state: FetchState) => {
  if (!state.awaiting) return
  state.awaiting = false
  state.entry.awaitingReady--
}

/** Waits until writes after this point reach the fetch; abort to stop waiting. */
export const awaitLiveQueryFetch = async (fetch: LiveQueryFetch, signal?: AbortSignal) => {
  const state = fetches.get(fetch)
  if (state === undefined || state.released) return
  try {
    const ready = await waitReady(signal)
    state.entry.coveredEpoch = Math.max(state.entry.coveredEpoch, ready)
  } finally {
    stopAwaiting(state)
  }
}

export const releaseLiveQueryFetch = (fetch: LiveQueryFetch) => {
  const state = fetches.get(fetch)
  if (state === undefined || state.released) return
  state.released = true
  stopAwaiting(state)
  const { entry } = state
  if (--entry.discovering > 0 || !isCurrent(entry)) return
  const { buffered, dirty } = entry
  entry.buffered = DataDependencies.empty()
  entry.dirty = false
  if (dirty || DataDependencies.intersects(entry.reads(), buffered)) schedule(entry)
}

/** Waits for the current source; a reconfigured source supersedes a pending wait on the previous one. */
export const liveQueryReady = (): Promise<void> => waitReady().then(() => {})

// boolean callers cannot say which fetch ended, so release theirs together once all have ended
const legacyFetches: Array<LiveQueryFetch> = []
let legacyActive = 0

/** @deprecated Interruptible between acquire and ready; use `acquireLiveQueryFetch` + `awaitLiveQueryFetch`. */
export const beginLiveQueryFetch = async (key: ReadonlyArray<unknown>) => {
  const fetch = acquireLiveQueryFetch(key)
  if (fetch === undefined) return false
  legacyActive++
  legacyFetches.push(fetch)
  try {
    await awaitLiveQueryFetch(fetch)
  } catch (error) {
    endLiveQueryFetch(true)
    throw error
  }
  return true
}

/** @deprecated Pairs with `beginLiveQueryFetch`; use `releaseLiveQueryFetch`. */
export const endLiveQueryFetch = (wasLive: boolean) => {
  if (!wasLive || legacyActive === 0 || --legacyActive > 0) return
  for (const fetch of legacyFetches.splice(0)) releaseLiveQueryFetch(fetch)
}

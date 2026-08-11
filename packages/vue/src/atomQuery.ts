/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Shared atom core for the query/mutation engine (used by query.ts + mutate.ts).
 *
 * Replaces the @tanstack/vue-query engine with Effect `Atom`, keeping the public
 * `.query()/.suspense()/.mutate()` contract unchanged:
 *   - cache identity   = the atom reference (one per [handler, input], via Atom.family)
 *   - invalidation key = reactivity keys (= the app's existing namespace query keys)
 *   - SWR + focus      = Atom.swr (+ windowFocusSignal)
 *   - gcTime           = Atom.setIdleTTL / Atom.keepAlive
 *   - retry            = Effect.retry inside the atom effect
 *
 * Built over the app's RPC client through the existing `RequestHandlerWithInput`
 * abstraction (mirrors AtomRpc's recipe; see docs/atom-query-plan.md).
 */
import { defaultRegistry } from "@effect/atom-vue"
import { DataDependencies, makeQueryKey } from "effect-app/client"
import type { ClientForOptions } from "effect-app/client/clientFor"
import { ServiceUnavailableError } from "effect-app/client/errors"
import * as Effect from "effect-app/Effect"
import * as Option from "effect-app/Option"
import * as S from "effect-app/Schema"
import * as Cause from "effect/Cause"
import * as Duration from "effect/Duration"
import * as Equal from "effect/Equal"
import * as Hash from "effect/Hash"
import type * as Layer from "effect/Layer"
import * as Ref from "effect/Ref"
import * as Stream from "effect/Stream"
import type * as Tracer from "effect/Tracer"
import { isHttpClientError } from "effect/unstable/http/HttpClientError"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import * as Atom from "effect/unstable/reactivity/Atom"
import * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry"
import { clearQueryReadDependencies, getQueryReadDependencies, type QueryInvalidationMode, registerQueryInvalidationMode, setQueryReadDependencies } from "./dependencyMetadata.ts"
import { reportRuntimeError } from "./lib.ts"
import { beginLiveQueryFetch, endLiveQueryFetch, type LiveQueryOptions, registerLiveQuery } from "./liveQueryInvalidation.ts"

/** All non-empty prefixes of a key, longest last. `[a,b,c]` -> `[[a],[a,b],[a,b,c]]`. */
const prefixesOf = (key: ReadonlyArray<unknown>): ReadonlyArray<ReadonlyArray<unknown>> =>
  key.map((_, i) => key.slice(0, i + 1))

const uniqueKeys = (keys: ReadonlyArray<ReadonlyArray<unknown>>): ReadonlyArray<ReadonlyArray<unknown>> => {
  const out: Array<ReadonlyArray<unknown>> = []
  const seen = new Set<number>()
  for (const key of keys) {
    const hash = Hash.hash(key)
    if (seen.has(hash)) continue
    seen.add(hash)
    out.push(key)
  }
  return out
}

// --- awaitable invalidation -------------------------------------------------------------------
// keyHash -> live query atoms registered under that key. A query atom is tracked while it is alive
// in the registry (mounted OR cached within idle-ttl) and removed on GC, so invalidation reaches
// cached-but-unmounted queries too (e.g. a list you navigated away from).
const keyAtoms = new Map<number, Set<Atom.Atom<AsyncResult.AsyncResult<any, any>>>>()

const trackByKeys =
  (keys: ReadonlyArray<ReadonlyArray<unknown>>) =>
  <A, E>(atom: Atom.Atom<AsyncResult.AsyncResult<A, E>>): Atom.Atom<AsyncResult.AsyncResult<A, E>> =>
    Atom.transform(atom, (get) => {
      for (const key of keys) {
        const h = Hash.hash(key)
        let set = keyAtoms.get(h)
        if (!set) keyAtoms.set(h, set = new Set())
        set.add(atom)
        get.addFinalizer(() => {
          set.delete(atom)
          if (set.size === 0) keyAtoms.delete(h)
        })
      }
      return get(atom)
    }, { initialValueTarget: atom })

const trackWritableByKeys =
  (keys: ReadonlyArray<ReadonlyArray<unknown>>) =>
  <A, E, W>(atom: Atom.Writable<AsyncResult.AsyncResult<A, E>, W>): Atom.Writable<AsyncResult.AsyncResult<A, E>, W> => {
    const tracked = trackByKeys(keys)(atom)
    return Atom.writable(
      (get) => get(tracked),
      (ctx, value) => ctx.set(atom, value),
      (refresh) => refresh(tracked)
    )
  }

/**
 * Keep a query's recorded read-dependencies registered for as long as it is alive, and drop them when
 * its atom is GC'd (mirrors `trackByKeys`).
 *
 * `recordReads` only stores the deps on an actual fetch. A query that unmounts and later remounts from
 * cache (within idle-ttl) does NOT re-run the handler, so its registry entry — cleared by the previous
 * teardown's finalizer — would never be restored, and a subsequent mutation could not derive it as an
 * invalidation target. Re-asserting the last-known reads on every (re)subscribe closes that gap, so the
 * registry mirrors the live query even across cache-hit remounts.
 */
const trackReadDependencies =
  (key: ReadonlyArray<unknown>, getReads: () => DataDependencies.DataDependencies) =>
  <A, E>(atom: Atom.Atom<AsyncResult.AsyncResult<A, E>>): Atom.Atom<AsyncResult.AsyncResult<A, E>> =>
    Atom.transform(atom, (get) => {
      const reads = getReads()
      if (DataDependencies.isNonEmpty(reads)) setQueryReadDependencies(key, reads)
      get.addFinalizer(() => clearQueryReadDependencies(key))
      return get(atom)
    }, { initialValueTarget: atom })

const atomsForKeys = (keys: ReadonlyArray<unknown>): ReadonlyArray<Atom.Atom<AsyncResult.AsyncResult<any, any>>> => {
  const atoms = new Set<Atom.Atom<AsyncResult.AsyncResult<any, any>>>()
  for (const key of keys) {
    const set = keyAtoms.get(Hash.hash(key))
    if (set) { for (const a of set) atoms.add(a) }
  }
  return [...atoms]
}

/** Refresh registered query atoms without making the triggering mutation await them. */
export const invalidateSoft = (keys: ReadonlyArray<unknown>): Effect.Effect<void> =>
  Effect
    .gen(function*() {
      const atoms = atomsForKeys(keys)
      yield* Effect.forEach(atoms, captureAtomQueryParentSpan, { discard: true, concurrency: "unbounded" })
      if (atoms.length === 0) return
      yield* Effect.forEach(atoms, (atom) => Effect.sync(() => defaultRegistry.refresh(atom)), {
        discard: true
      })
    })
    .pipe(Effect.orDie)

/**
 * Invalidate the given keys and AWAIT the result. `keyAtoms` resolves all matching hierarchical
 * keys to a deduplicated set of query atoms. Refresh that set directly: sending the whole key set
 * through `Reactivity.invalidate` invokes one atom's registered callback once per matching key,
 * repeatedly superseding the same fetch when a mutation carries many row/prefix keys.
 *
 * Resolves once the affected queries have settled, so a mutation can `yield*` this and know the
 * affected queries are fresh. (The await reads via the module-global default registry — the one the
 * vue composables resolve via `injectRegistry`'s fallback.)
 */
export const invalidateAndAwait = (keys: ReadonlyArray<unknown>): Effect.Effect<void> =>
  Effect
    .gen(function*() {
      const atoms = atomsForKeys(keys)
      yield* Effect.forEach(atoms, captureAtomQueryParentSpan, { discard: true, concurrency: "unbounded" })
      if (atoms.length === 0) return
      yield* Effect.forEach(atoms, (atom) => Effect.sync(() => defaultRegistry.refresh(atom)), {
        discard: true
      })
      yield* Effect.forEach(atoms, (a) => awaitAtomResult(defaultRegistry, a).pipe(Effect.exit))
    })
    .pipe(Effect.orDie)

const isPlainObject = (o: unknown): o is Record<string, unknown> => {
  if (typeof o !== "object" || o === null) return false
  const proto = Object.getPrototypeOf(o)
  return proto === Object.prototype || proto === null
}

/**
 * Structural sharing (tanstack `replaceEqualDeep`): walk `next` against `prev` and reuse `prev`'s
 * reference for any unchanged array/object sub-tree, so unchanged data keeps referential identity
 * (Vue skips re-rendering it). Leaves — including decoded Schema CLASS INSTANCES — are compared with
 * Effect `Equal.equals` (structural), which reuses equal instances that tanstack's `===` could not.
 */
export const replaceEqualDeep = (prev: any, next: any): any => {
  if (prev === next) return prev
  const bothArrays = Array.isArray(prev) && Array.isArray(next)
  if (bothArrays || (isPlainObject(prev) && isPlainObject(next))) {
    const a: Record<PropertyKey, any> = prev
    const b: Record<PropertyKey, any> = next
    const copy: Record<PropertyKey, any> = bothArrays ? [] : {}
    const nextKeys: Array<PropertyKey> = bothArrays ? (b as Array<any>).map((_, i) => i) : Object.keys(b)
    const nextSize = nextKeys.length
    const prevSize = bothArrays ? (a as Array<any>).length : Object.keys(a).length
    let equalItems = 0
    for (let i = 0; i < nextSize; i++) {
      const key = nextKeys[i]!
      copy[key] = replaceEqualDeep(a[key], b[key])
      if (copy[key] === a[key] && a[key] !== undefined) equalItems++
    }
    return prevSize === nextSize && equalItems === prevSize ? prev : copy
  }
  return Equal.equals(prev, next) ? prev : next
}

/** Atom combinator: share each new `Success` value structurally against the previous one. */
const structuralShare = <A, E>(
  self: Atom.Atom<AsyncResult.AsyncResult<A, E>>
): Atom.Atom<AsyncResult.AsyncResult<A, E>> =>
  Atom.transform(self, (get) => {
    const next = get(self)
    if (next._tag !== "Success") return next
    const prev = Option.flatMap(get.self<AsyncResult.AsyncResult<A, E>>(), AsyncResult.value)
    if (Option.isNone(prev)) return next
    const shared = replaceEqualDeep(prev.value, next.value)
    return shared === next.value
      ? next
      : AsyncResult.success(shared, { waiting: next.waiting, timestamp: next.timestamp })
  }, { initialValueTarget: self })

export interface AtomClientRuntime {
  readonly runtime: Atom.AtomRuntime<any, never>
  readonly factory: Atom.RuntimeFactory
}

/**
 * Build one AtomRuntime (and its factory) from an already-built app context.
 * Shares the ManagedRuntime's `memoMap` so layers are not built twice, and so
 * query-registration and mutation-invalidation resolve the SAME `Reactivity`.
 */
export const makeAtomClientRuntime = <R>(
  getContext: () => Layer.Layer<R, never, never>,
  memoMap: Layer.MemoMap
): AtomClientRuntime => {
  const factory = Atom.context({ memoMap })
  const runtime = factory((_get) => getContext())
  return { runtime, factory }
}

const isRetryable = (e: unknown): boolean =>
  isHttpClientError(e)
  || S.is(ServiceUnavailableError)(e)
  || (typeof e === "object" && e !== null && (e as any)._tag === "RpcClientError")

export interface AtomQueryOptions {
  /** background-refresh threshold (TanStack staleTime; default 5s) */
  readonly staleTime?: Duration.Input
  /** dispose-when-idle (TanStack gcTime; default 5min). "infinity" => keepAlive */
  readonly gcTime?: Duration.Input | "infinity"
  readonly invalidation?: QueryInvalidationMode
  /**
   * Revalidate a stale query on window focus AND on network reconnect (default on, matching
   * tanstack refetchOnWindowFocus + refetchOnReconnect).
   */
  readonly revalidateOnFocus?: boolean
  /**
   * Reuse references of unchanged sub-trees across refetches (default on, matching tanstack
   * structuralSharing). Uses Effect `Equal` so decoded Schema instances share too — more effective
   * than tanstack's `===`, but a deep compare per refetch (O(rows·fields)). Set `false` for very
   * large or mostly-changing result sets where the compare costs more than the saved re-renders.
   */
  readonly structuralSharing?: boolean
  /** poll: re-fetch every N ms (tanstack refetchInterval). */
  readonly refetchInterval?: number
  /** Refresh when writes intersect the dependencies recorded by this query. */
  readonly live?: boolean | LiveQueryOptions
}

const defaults = { staleTime: Duration.seconds(5), gcTime: Duration.minutes(5) }

export interface AtomQueryMetadata {
  readonly staleTimeMs: number
}

const atomQueryMetadata = new WeakMap<Atom.Atom<AsyncResult.AsyncResult<any, any>>, AtomQueryMetadata>()
const atomQueryParentSpans = new WeakMap<Atom.Atom<AsyncResult.AsyncResult<any, any>>, Tracer.AnySpan>()
const atomQueryKeys = new WeakMap<Atom.Atom<AsyncResult.AsyncResult<any, any>>, ReadonlyArray<unknown>>()

export const queryKeyForAtom = <A, E>(
  atom: Atom.Atom<AsyncResult.AsyncResult<A, E>>
): ReadonlyArray<unknown> | undefined => atomQueryKeys.get(atom)

const atomSpanTarget = <A, E>(atom: Atom.Atom<AsyncResult.AsyncResult<A, E>>) => {
  let target = atom
  while (target.initialValueTarget !== undefined) {
    target = target.initialValueTarget
  }
  return target
}

const takeAtomQueryParentSpan = <A, E>(atom: Atom.Atom<AsyncResult.AsyncResult<A, E>>) => {
  const target = atomSpanTarget(atom)
  const span = atomQueryParentSpans.get(target)
  if (span !== undefined) atomQueryParentSpans.delete(target)
  return span
}

const setAtomQueryParentSpan = <A, E>(
  atom: Atom.Atom<AsyncResult.AsyncResult<A, E>>,
  span: Tracer.AnySpan
) => {
  atomQueryParentSpans.set(atomSpanTarget(atom), span)
}

export const captureAtomQueryParentSpan = <A, E>(
  atom: Atom.Atom<AsyncResult.AsyncResult<A, E>>
): Effect.Effect<void> =>
  Effect.currentParentSpan.pipe(
    Effect.tap((span) => Effect.sync(() => setAtomQueryParentSpan(atom, span))),
    Effect.ignore
  )

export const refreshAtomWithCurrentSpan = <A, E>(
  registry: AtomRegistry.AtomRegistry,
  atom: Atom.Atom<AsyncResult.AsyncResult<A, E>>
): Effect.Effect<void> =>
  captureAtomQueryParentSpan(atom).pipe(
    Effect.andThen(Effect.sync(() => registry.refresh(atom)))
  )

const setAtomQueryMetadata = <A, E>(
  atom: Atom.Atom<AsyncResult.AsyncResult<A, E>>,
  opts: AtomQueryOptions = {}
) => {
  const staleTimeMs = staleTimeMsOf(opts)
  const previous = atomQueryMetadata.get(atom)
  atomQueryMetadata.set(atom, {
    staleTimeMs: previous === undefined ? staleTimeMs : Math.min(previous.staleTimeMs, staleTimeMs)
  })
  return atom
}

export const getAtomQueryMetadata = <A, E>(
  atom: Atom.Atom<AsyncResult.AsyncResult<A, E>>
): AtomQueryMetadata | undefined => atomQueryMetadata.get(atom)

/** Exported so the vue hook can do refetch-on-mount-per-observer with the same rule as swr. */
export const isStaleResult = (r: AsyncResult.AsyncResult<any, any>, staleTimeMs: number): boolean => {
  if (r.waiting) return false
  const ts = r._tag === "Success"
    ? r.timestamp
    : r._tag === "Failure"
    ? Option.getOrUndefined(Option.map(r.previousSuccess, (s) => s.timestamp))
    : undefined
  if (ts === undefined) return r._tag !== "Initial"
  return Date.now() - ts >= staleTimeMs
}

export const staleTimeMsOf = (opts: AtomQueryOptions): number =>
  Duration.toMillis(Duration.fromInputUnsafe(opts.staleTime ?? defaults.staleTime))

// A query fetch that is interrupted (a subscriber lost interest / a refresh superseded it / the
// component navigated) leaves the family atom `waiting=true` with NO fiber running — effect-core
// `makeEffect` removes its result-observer before interrupting, so the interrupt is never written
// back; it stays `waitingFrom(previous)`. `swr`/`isStaleResult` both short-circuit
// `if (waiting) return false`, so that stuck `waiting` is neither completing nor considered stale —
// mount/focus/staleness all skip it. Left alone the interrupt is TERMINAL: any current or future
// subscriber inherits the `waiting` forever (cold → `latestDefined` throws → white screen; warm →
// the Mako Bauhaus PickList stale wedge).
//
// The invariant we restore in this layer (no effect-core change): an interrupt must never be a
// terminal state. We do NOT auto-retry the interrupted fetch — an interrupt is intentional (that
// caller lost interest), and the first observer recovers through its normal refresh/staleness rules.
// We only guarantee that a *genuine* new/parallel/future observer is never stuck on a departed
// observer's interrupt: per family atom we count live computes (`inFlight`), so "stuck" = a `waiting`
// result with `inFlight === 0` (nothing is actually fetching). On mount a stuck atom triggers one
// fresh fetch instead of adopting the dangling `waiting`; a genuinely in-flight fetch (`inFlight > 0`)
// is joined, not superseded (dedup / re-entrancy preserved). `recovering` dedupes concurrent mounts
// so exactly one recovery fetch is issued until a fetch is running again.
export interface QueryFetchState {
  inFlight: number
  recovering: boolean
}
export const queryFetchStates = new WeakMap<Atom.Atom<any>, QueryFetchState>()

const recoverStuckWaitingOnMount =
  <A, E>(familyAtom: Atom.Atom<AsyncResult.AsyncResult<A, E>>) =>
  (wrapped: Atom.Atom<AsyncResult.AsyncResult<A, E>>): Atom.Atom<AsyncResult.AsyncResult<A, E>> =>
    Atom.transform(wrapped, (get) => {
      const current = get.once(wrapped)
      get.subscribe(wrapped, (value) => get.setSelf(value))
      const state = queryFetchStates.get(familyAtom)
      const waiting = current?.waiting === true
      // Stuck: the result says `waiting` yet nothing is in-flight — an interrupt was hidden and left
      // `waiting` dangling. Treat it as not-yet-fetched and refetch; a live fetch (`inFlight > 0`) is
      // joined, not superseded. `recovering` prevents concurrent mounts from issuing more than one
      // recovery fetch (cleared once a fetch is actually running again).
      if (state && waiting && state.inFlight === 0 && !state.recovering) {
        state.recovering = true
        get.refresh(familyAtom)
      }
      return current
    }, { initialValueTarget: wrapped })

export const withQueryOptions = <A, E>(
  self: Atom.Atom<AsyncResult.AsyncResult<A, E>>,
  opts: AtomQueryOptions = {},
  liveKey?: ReadonlyArray<unknown>
): Atom.Atom<AsyncResult.AsyncResult<A, E>> => {
  setAtomQueryMetadata(self, opts)
  const staleTime: Duration.Input = opts.staleTime ?? defaults.staleTime
  let atom = self
  if (liveKey !== undefined) {
    atom = Atom.transform(atom, (get) => {
      const unregister = registerQueryInvalidationMode(liveKey, opts.invalidation ?? "await")
      get.addFinalizer(unregister)
      return get(self)
    }, { initialValueTarget: self })
  }
  if (opts.live && liveKey !== undefined) {
    const liveOptions = opts.live === true ? {} : opts.live
    atom = Atom.transform(atom, (get) => {
      const unregister = registerLiveQuery(
        liveKey,
        () => getQueryReadDependencies(liveKey),
        liveOptions
      )
      get.addFinalizer(unregister)
      return get(self)
    }, { initialValueTarget: self })
  }
  const revalidateOnFocus = opts.revalidateOnFocus ?? true
  atom = Atom.swr({
    staleTime,
    revalidateOnFocus,
    focusSignal: revalidateOnFocus ? focusOrReconnectSignal : undefined
  })(atom)
  atom = recoverStuckWaitingOnMount(self)(atom)
  if (opts.refetchInterval) atom = Atom.withRefresh(Duration.millis(opts.refetchInterval))(atom)
  if (opts.structuralSharing ?? true) atom = structuralShare(atom)
  return atom
}

/** Constant atom for disabled / `mode:"optional"`-None queries: stays Initial, never fetches. */
export const disabledQueryAtom: Atom.Atom<AsyncResult.AsyncResult<any, any>> = Atom.readable(() =>
  AsyncResult.initial(false)
)

/**
 * Bumps when the browser regains connectivity (the `online` event) — the tanstack
 * `refetchOnReconnect` trigger. One shared listener (module-level). SSR-guarded.
 */
const onlineSignal: Atom.Atom<number> = Atom.readable((get) => {
  let count = 0
  if (typeof window === "undefined") return count
  const update = () => {
    if (navigator.onLine) get.setSelf(++count)
  }
  window.addEventListener("online", update)
  get.addFinalizer(() => window.removeEventListener("online", update))
  return count
})

/**
 * Focus OR reconnect, as a single signal for `swr` — both should stale-revalidate a query.
 * swr takes one `focusSignal`, so we fold window-focus + reconnect into one derived atom;
 * a bump from either triggers swr's stale check.
 */
const focusOrReconnectSignal: Atom.Atom<number> = Atom.make((get) => get(Atom.windowFocusSignal) + get(onlineSignal))

/**
 * Build the per-input atom family for a request handler — the query CACHE IDENTITY.
 *
 * This is the TanStack `queryKey = [handler, input]` equivalent and the piece that makes
 * caching cross-component: `Atom.family` memoizes one atom per structurally-distinct input
 * (v4 hashes the input via Hash/Equal), so every component querying the same handler+input
 * reads the SAME atom instance => one fetch, one shared result in the global registry,
 * ref-counted and GC'd on idle ttl. (The registry + ttl give lifetime; reactivity keys give
 * invalidation; the family gives identity/sharing — all three are needed.)
 *
 * The family is created once per handler (see query.ts's per-handler cache), so it is shared
 * process-wide via the registry.
 *
 * Invalidation is hierarchical: each atom registers under EVERY prefix of its full key
 * `[...makeQueryKey(self), input]`. Since reactivity matches keys by exact hash, registering
 * all prefixes means `invalidate(P)` refreshes every atom whose key starts with `P` — e.g.
 * `["$X"]` refreshes all inputs, `["$X","$List",input]` only that input. (`makeQueryKey`'s
 * collapsed form `getQueryKey` — what mutations invalidate by default — is one of the prefixes.)
 */
export const buildQueryFamily = <I, A, E>(
  rt: AtomClientRuntime,
  self: {
    readonly id: string
    readonly handler: (i: I) => Effect.Effect<A, E, any>
    readonly options?: ClientForOptions
    readonly queryKeyProjectionHash?: string
  }
) => {
  const baseKey = makeQueryKey(self) // hierarchical, input-independent

  return Atom.family((input: I) => {
    const fullKey = [...baseKey, input]
    // Record the repository/server read-dependencies seen while fetching, keyed by `fullKey`, so a
    // later mutation whose writes intersect them can derive this query as an invalidation target.
    // The last recorded reads are retained on the (memoized) family atom so `trackReadDependencies`
    // can re-assert them on a cache-hit remount that never re-runs the handler.
    let lastReads: DataDependencies.DataDependencies = DataDependencies.empty()
    // Fetch bookkeeping read by `recoverStuckWaitingOnMount`. `inFlight` counts live computes, so a
    // `waiting` result with `inFlight === 0` is a stuck/hidden interrupt. `recovering` guards the
    // recovery refresh against concurrent mounts; a running fetch clears it.
    const fetchState: QueryFetchState = { inFlight: 0, recovering: false }
    let atom: Atom.Atom<AsyncResult.AsyncResult<A, E>>
    atom = rt.runtime.atom(
      Effect.suspend(() => {
        // A fetch is now running: the atom is not stuck, and any pending recovery is fulfilled.
        fetchState.recovering = false
        fetchState.inFlight++
        const recordReads = Effect
          .gen(function*() {
            const readsRef = yield* Ref.make(DataDependencies.empty())
            const writesRef = yield* Ref.make(DataDependencies.empty())
            const recorder = DataDependencies.makeDataDependencyRecorder(readsRef, writesRef)
            const result = yield* self
              .handler(input)
              .pipe(Effect.provideService(DataDependencies.DataDependencyRecorder, recorder))
            lastReads = yield* Ref.get(readsRef)
            setQueryReadDependencies(fullKey, lastReads)
            return result
          })
        let liveFetch = false
        const effect = Effect
          .gen(function*() {
            liveFetch = yield* Effect.promise(() => beginLiveQueryFetch(fullKey))
            return yield* recordReads.pipe(Effect.retry({ times: 5, while: isRetryable }))
          })
          .pipe(
            Effect.ensuring(Effect.sync(() => endLiveQueryFetch(liveFetch))),
            Effect.tapCauseIf(Cause.hasDies, (cause) => reportRuntimeError(cause)),
            // On exit, the compute is no longer in-flight. An interrupt (subscriber lost interest / a
            // superseding refresh) may leave the result at `waiting`; with `inFlight` back at 0 that
            // reads as "stuck", so the next mount recovers it (`recoverStuckWaitingOnMount`). We do not
            // re-fire here — the interrupt was intentional; recovery is driven by a genuine (re)mount.
            Effect.onExit(() =>
              Effect.sync(() => {
                fetchState.inFlight = Math.max(0, fetchState.inFlight - 1)
              })
            ),
            Effect.withSpan(`query ${self.id}`, {}, { captureStackTrace: false })
          )
        const parentSpan = takeAtomQueryParentSpan(atom)
        return parentSpan === undefined
          ? effect
          : effect.pipe(Effect.withParentSpan(parentSpan, { captureStackTrace: false }))
      })
    )
    // Register under every prefix of the full key => hierarchical (prefix) invalidation. Two roles:
    //   - withReactivity: `Reactivity.invalidate(key)` refreshes this atom (the actual refetch).
    //   - trackByKeys:    records the atom in `keyAtoms` so the mutation can AWAIT its settle.
    const projectedFullKey = self.queryKeyProjectionHash === undefined
      ? fullKey
      : [...baseKey, self.queryKeyProjectionHash, input]
    const reactivityKeys = uniqueKeys([...prefixesOf(fullKey), ...prefixesOf(projectedFullKey)])
    atom = rt.factory.withReactivity(reactivityKeys)(atom)
    atom = trackByKeys(reactivityKeys)(atom)
    atom = trackReadDependencies(fullKey, () => lastReads)(atom)
    // gcTime LAST so the whole chain (incl. the registration + tracking) stays alive through the
    // idle window, letting invalidation reach a cached-but-unmounted query.
    atom = Atom.setIdleTTL(atom, defaults.gcTime)
    const registered = setAtomQueryMetadata(Atom.withLabel(`query:${self.id}`)(atom))
    const writable = Atom.writable(
      (get) => {
        const current = get.once(registered)
        get.subscribe(registered, (value) => get.setSelf(value))
        return current
      },
      (ctx, value: AsyncResult.AsyncResult<A, E>) => ctx.setSelf(value),
      (refresh) => refresh(registered)
    )
    const writableWithTarget = Object.assign(writable, { initialValueTarget: registered })
    const result = setAtomQueryMetadata(Atom.withLabel(`query-cache:${self.id}`)(writableWithTarget))
    // Key the fetch state by the atom `withQueryOptions` receives, so its mount hook can find it.
    queryFetchStates.set(result, fetchState)
    atomQueryKeys.set(result, fullKey)
    return result
  })
}

export const buildStreamQueryFamily = <I, A, E>(
  rt: AtomClientRuntime,
  self: {
    readonly id: string
    readonly handler: (i: I) => Stream.Stream<A, E, any>
    readonly options?: ClientForOptions
    readonly queryKeyProjectionHash?: string
  }
) => {
  const baseKey = makeQueryKey(self)

  return Atom.family((input: I) => {
    let atom = rt.runtime.pull(
      self.handler(input).pipe(
        Stream.tapCause((cause) => Cause.hasDies(cause) ? reportRuntimeError(cause) : Effect.void)
      )
    )
    const fullKey = [...baseKey, input]
    const projectedFullKey = self.queryKeyProjectionHash === undefined
      ? fullKey
      : [...baseKey, self.queryKeyProjectionHash, input]
    const reactivityKeys = uniqueKeys([...prefixesOf(fullKey), ...prefixesOf(projectedFullKey)])
    atom = rt.factory.withReactivity(reactivityKeys)(atom)
    atom = trackWritableByKeys(reactivityKeys)(atom)
    atom = Atom.setIdleTTL(atom, defaults.gcTime)
    return setAtomQueryMetadata(Atom.withLabel(`stream-query:${self.id}`)(atom))
  })
}

/** Await the first resolved (non-Waiting) result of an atom. Failing query results fail the Effect. */
export const awaitAtomResult = <A, E>(
  registry: AtomRegistry.AtomRegistry,
  atom: Atom.Atom<AsyncResult.AsyncResult<A, E>>
) => AtomRegistry.getResult(registry, atom, { suspendOnWaiting: true })

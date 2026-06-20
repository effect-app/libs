/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import * as Array from "effect-app/Array"
import { makeQueryKey, type Req } from "effect-app/client"
import type { ClientForOptions, RequestHandlerWithInput, RequestStreamHandlerWithInput } from "effect-app/client/clientFor"
import { type CauseException } from "effect-app/client/errors"
import type * as Context from "effect-app/Context"
import * as Effect from "effect-app/Effect"
import * as Option from "effect-app/Option"
import * as Exit from "effect/Exit"
import * as Stream from "effect/Stream"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import * as Atom from "effect/unstable/reactivity/Atom"
import { computed, type ComputedRef, type MaybeRefOrGetter, onBeforeUnmount, onMounted, ref, toValue, type WatchSource } from "vue"
import { injectRegistry, useAtomValue } from "@effect/atom-vue"
import { type AtomClientRuntime, type AtomQueryOptions, awaitAtomResult, buildQueryFamily, disabledQueryAtom, isStaleResult, staleTimeMsOf, withQueryOptions } from "./atomQuery.ts"

// --- minimal local types (replacing the former @tanstack/vue-query type imports) ---
type DefaultError = Error
type QueryKey = ReadonlyArray<unknown>
/** Options accepted by `refetch()` — kept for source compatibility; the atom path ignores them. */
export interface RefetchOptions {
  readonly cancelRefetch?: boolean
  readonly throwOnError?: boolean
}
/** The 4th tuple element: private atom/registry handle for client helpers. */
export interface QueryHandle<A = unknown, E = unknown> {
  readonly awaitResult: () => Effect.Effect<A, E, never>
  readonly refetch: () => Effect.Effect<A, E, never>
  readonly refresh: () => void
  readonly registry: ReturnType<typeof injectRegistry>
  readonly atom: ComputedRef<Atom.Atom<AsyncResult.AsyncResult<A, E>>>
}
export interface QueryView<A, E> extends QueryHandle<A, E> {
  readonly result: ComputedRef<AsyncResult.AsyncResult<A, E>>
  readonly data: ComputedRef<A | undefined>
}

// retained generic aliases so the exported option-interface arity is unchanged for consumers
export type UseQueryReturnType<A = any, E = any> = QueryHandle<A, E>
export type UseQueryDefinedReturnType<A = any, E = any> = QueryHandle<A, E>
export type QueryObserverResult<A = any, _E = any> = AsyncResult.AsyncResult<A, any>
export type SuspenseQueryTuple<A, E> = readonly [
  ComputedRef<AsyncResult.AsyncResult<A, E>>,
  ComputedRef<A>,
  (options?: RefetchOptions) => Effect.Effect<A, E, never>,
  QueryHandle<A, E>
]

export type SuspenseQueryView<A, E> =
  & Omit<QueryView<A, E>, "data">
  & {
    readonly data: ComputedRef<A>
  }
  & SuspenseQueryTuple<A, E>

export type QueryAtomFamily<I, A, E> = (input: I) => Atom.Atom<AsyncResult.AsyncResult<A, E>>

interface QueryFamilyDescriptor<I, A, E> {
  readonly id: string
  readonly handler: (i: I) => Effect.Effect<A, E, any>
  readonly options?: ClientForOptions
  readonly queryKeyProjectionHash?: string
}

const queryFamilyCacheKey = (q: { readonly id: string; readonly options?: ClientForOptions; readonly queryKeyProjectionHash?: string }) =>
  `${makeQueryKey(q).join("/")}:${q.queryKeyProjectionHash ?? ""}`

// One atom family per request shape, keyed by the stable query key + projection hash (not the
// handler object — `clientFor` returns a fresh proxy per call, so the object isn't shareable).
// Module-level + key-indexed => the family is process-global, so the same request+input read
// the same atom across components/pages => cross-page caching via the global registry.
const queryFamilyByKey = new Map<string, any>()
const getQueryFamily = <I, A, E>(
  rt: AtomClientRuntime,
  q: QueryFamilyDescriptor<I, A, E>
): QueryAtomFamily<I, A, E> => {
  const key = queryFamilyCacheKey(q)
  let f = queryFamilyByKey.get(key)
  if (!f) {
    f = buildQueryFamily(rt, q)
    queryFamilyByKey.set(key, f)
  }
  return f
}

// Atom-engine query options (formerly reconstructed from @tanstack/vue-query types).
// The generic arity is kept so the exported interface signatures are unchanged for consumers.
export interface CustomUseQueryOptions<
  TQueryFnData = unknown,
  TError = DefaultError,
  TData = TQueryFnData,
  TQueryData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey
> {
  readonly enabled?: MaybeRefOrGetter<boolean | undefined>
  /** stale threshold in ms (or a Duration input) */
  readonly staleTime?: number
  /** garbage-collect after idle, ms (or "infinity") */
  readonly gcTime?: number | "infinity"
  readonly refetchOnWindowFocus?: boolean
  readonly structuralSharing?: boolean
  /** poll: re-fetch every N ms (tanstack refetchInterval) */
  readonly refetchInterval?: number
  readonly select?: (data: TQueryFnData) => TData
  /** accepted for source compatibility; not used by the atom engine */
  readonly retry?: boolean | number
  readonly meta?: Record<string, unknown>
  readonly _phantom?: [TQueryData, TQueryKey, TError]
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
type NonFunctionGuard<T> = T extends Function ? never : T

export interface CustomUndefinedInitialQueryOptions<
  TQueryFnData = unknown,
  TError = DefaultError,
  TData = TQueryFnData,
  TQueryData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey
> extends CustomUseQueryOptions<TQueryFnData, TError, TData, TQueryData, TQueryKey> {
  readonly initialData?: TQueryFnData | (() => TQueryFnData) | undefined
  readonly placeholderData?: NonFunctionGuard<TQueryData> | ((prev: TQueryData | undefined) => TQueryData) | undefined
}
export interface CustomDefinedInitialQueryOptions<
  TQueryFnData = unknown,
  TError = DefaultError,
  TData = TQueryFnData,
  TQueryData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey
> extends CustomUseQueryOptions<TQueryFnData, TError, TData, TQueryData, TQueryKey> {
  readonly initialData: TQueryFnData | (() => TQueryFnData)
  readonly placeholderData?: NonFunctionGuard<TQueryData> | ((prev: TQueryData | undefined) => TQueryData) | undefined
}

export interface CustomDefinedPlaceholderQueryOptions<
  TQueryFnData = unknown,
  TError = DefaultError,
  TData = TQueryFnData,
  TQueryData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey
> extends CustomUseQueryOptions<TQueryFnData, TError, TData, TQueryData, TQueryKey> {
  readonly initialData?: TQueryFnData | (() => TQueryFnData) | undefined
  readonly placeholderData: NonFunctionGuard<TQueryData> | ((prev: TQueryData | undefined) => TQueryData)
}

export interface AtomQueryNewOptions<TQueryFnData = unknown, TData = TQueryFnData> {
  readonly enabled?: MaybeRefOrGetter<boolean | undefined>
  readonly staleTime?: number
  readonly idleTTL?: number | "infinity"
  readonly gcTime?: number | "infinity"
  readonly revalidateOnFocus?: boolean
  readonly refetchOnWindowFocus?: boolean
  readonly structuralSharing?: boolean
  readonly refreshEvery?: number
  readonly refetchInterval?: number
  readonly select?: (data: TQueryFnData) => TData
}

const normalizeQueryOptions = (options?: {
  readonly staleTime?: number
  readonly gcTime?: number | "infinity"
  readonly idleTTL?: number | "infinity"
  readonly refetchOnWindowFocus?: boolean
  readonly revalidateOnFocus?: boolean
  readonly structuralSharing?: boolean
  readonly refetchInterval?: number
  readonly refreshEvery?: number
}): AtomQueryOptions => {
  const out: {
    staleTime?: number
    gcTime?: number | "infinity"
    revalidateOnFocus?: boolean
    structuralSharing?: boolean
    refetchInterval?: number
  } = {}
  if (options?.staleTime !== undefined) out.staleTime = options.staleTime
  const gcTime = options?.idleTTL ?? options?.gcTime
  if (gcTime !== undefined) out.gcTime = gcTime
  const revalidateOnFocus = options?.revalidateOnFocus ?? options?.refetchOnWindowFocus
  if (revalidateOnFocus !== undefined) out.revalidateOnFocus = revalidateOnFocus
  if (options?.structuralSharing !== undefined) out.structuralSharing = options.structuralSharing
  const refetchInterval = options?.refreshEvery ?? options?.refetchInterval
  if (refetchInterval !== undefined) out.refetchInterval = refetchInterval
  return out
}

export const useAtomQuery = <A, E>(
  atom: () => Atom.Atom<AsyncResult.AsyncResult<A, E>>
): QueryView<A, E> => {
  const registry = injectRegistry()
  const atomRef = computed(atom)
  const atomResult = useAtomValue(() => atomRef.value)
  const result = computed(() => atomResult.value)
  const refresh = () => registry.refresh(atomRef.value)
  const awaitResult = () => awaitAtomResult(registry, atomRef.value)
  const refetch = () =>
    Effect.gen(function*() {
      refresh()
      return yield* awaitResult()
    })
  const data = computed(() => Option.getOrUndefined(AsyncResult.value(result.value)))

  return {
    result,
    data,
    awaitResult,
    refetch,
    refresh,
    registry,
    atom: atomRef
  }
}

export const useAtomSuspense = <A, E>(
  atom: () => Atom.Atom<AsyncResult.AsyncResult<A, E>>
): Promise<SuspenseQueryView<A, E>> => {
  const view = useAtomQuery(atom)
  const data = computed<A>(() => {
    const latest = view.data.value
    if (latest === undefined) {
      throw new Error("Internal Error: atom suspense resolved without a latest value")
    }
    return latest
  })

  const isMounted = ref(true)
  onBeforeUnmount(() => {
    isMounted.value = false
  })

  const eff = Effect.gen(function*() {
    const exit = yield* view.awaitResult().pipe(Effect.exit)
    if (!isMounted.value) {
      return yield* Effect.interrupt
    }
    if (Exit.isFailure(exit)) {
      return yield* Exit.failCause(exit.cause)
    }

    const fetch = (_options?: RefetchOptions) => view.refetch()
    const handle = {
      awaitResult: view.awaitResult,
      refetch: view.refetch,
      refresh: view.refresh,
      registry: view.registry,
      atom: view.atom
    }
    return Object.assign([
      view.result,
      data,
      fetch,
      handle
    ] as const, {
      ...view,
      data
    })
  })

  return Effect.runPromise(eff)
}

const optionValue = <I>(
  arr: I | WatchSource<I> | undefined | WatchSource<Option.Option<I>>,
  options?: { readonly mode?: "optional"; readonly enabled?: MaybeRefOrGetter<boolean | undefined> }
): readonly [{ readonly value: I }, ComputedRef<boolean>] => {
  if (options?.mode === "optional") {
    const getOption: () => Option.Option<I> = typeof arr === "function"
      ? arr as () => Option.Option<I>
      : () => (arr as { value: Option.Option<I> }).value
    return [
      { get value() { return Option.getOrUndefined(getOption()) as I } },
      computed(() => Option.isSome(getOption()))
    ] as const
  }
  const req = !arr
    ? ({ value: undefined as I })
    : typeof arr === "function"
    ? ({ get value() { return (arr as any)() } })
    : (ref(arr) as any)
  const enabled = options?.enabled
  return [req, computed(() => enabled === undefined ? true : !!toValue(enabled))] as const
}

const observedAtom = <A, E>(
  atom: Atom.Atom<AsyncResult.AsyncResult<A, E>>,
  options?: {
    readonly staleTime?: number
    readonly gcTime?: number | "infinity"
    readonly idleTTL?: number | "infinity"
    readonly refetchOnWindowFocus?: boolean
    readonly revalidateOnFocus?: boolean
    readonly structuralSharing?: boolean
    readonly refetchInterval?: number
    readonly refreshEvery?: number
  }
): Atom.Atom<AsyncResult.AsyncResult<A, E>> => withQueryOptions(atom, normalizeQueryOptions(options))

const queryAtomFor = <I, A, E, TData>(
  rt: AtomClientRuntime,
  q: QueryFamilyDescriptor<I, A, E>,
  arg: I,
  options?: Omit<AtomQueryNewOptions<A, TData>, "select"> | Omit<CustomUseQueryOptions<A, E, TData>, "select">
): Atom.Atom<AsyncResult.AsyncResult<A, E>> => {
  const family = getQueryFamily(rt, q)
  return observedAtom(family(arg), options)
}

const makeQueryView = <I, A, E, TData>(
  getAtomRt: () => AtomClientRuntime,
  q: QueryFamilyDescriptor<I, A, E>,
  arg: I | WatchSource<I> | undefined | WatchSource<Option.Option<I>>,
  options?: (AtomQueryNewOptions<A, TData> | CustomUseQueryOptions<A, E, TData>) & {
    readonly mode?: "optional"
  }
): QueryView<TData, E> => {
  const atomRt = getAtomRt()
  const registry = injectRegistry()
  const [req, enabledRef] = optionValue<I>(arg, options)
  const family = getQueryFamily(atomRt, q)
  const atomRef = computed(() =>
    enabledRef.value ? observedAtom(family(req.value), options) : disabledQueryAtom
  )
  const rawResult = useAtomValue(() => atomRef.value) as ComputedRef<AsyncResult.AsyncResult<A, E>>
  const select = options?.select
  const result = (select
    ? computed(() => AsyncResult.map(rawResult.value, select))
    : rawResult) as ComputedRef<AsyncResult.AsyncResult<TData, E>>
  const refresh = () => registry.refresh(atomRef.value)
  const awaitResult = () =>
    select
      ? awaitAtomResult(registry, atomRef.value).pipe(Effect.map(select))
      : awaitAtomResult(registry, atomRef.value)
  const refetch = () =>
    Effect.gen(function*() {
      refresh()
      return yield* awaitResult()
    })
  const staleMs = staleTimeMsOf(normalizeQueryOptions(options))
  onMounted(() => {
    if (!enabledRef.value) return
    if (isStaleResult(registry.get(atomRef.value), staleMs)) refresh()
  })
  const data = computed(() => Option.getOrUndefined(AsyncResult.value(result.value)))

  return {
    result,
    data,
    awaitResult,
    refetch,
    refresh,
    registry,
    atom: atomRef
  }
}

export const makeQueryFamily = <R>(_getRuntime: () => Context.Context<R>, getAtomRt: () => AtomClientRuntime) => {
  const useQueryFamily: {
    <I, E, A, Request extends Req, Name extends string>(
      q: RequestHandlerWithInput<I, A, E, R, Request, Name>
    ): QueryAtomFamily<I, A, E>
  } = <I, E, A, Request extends Req, Name extends string>(
    q: RequestHandlerWithInput<I, A, E, R, Request, Name>
  ) => getQueryFamily(getAtomRt(), q)

  return useQueryFamily
}

export const makeQueryAtom = <R>(_getRuntime: () => Context.Context<R>, getAtomRt: () => AtomClientRuntime) => {
  const useQueryAtom: {
    <I, E, A, Request extends Req, Name extends string>(
      q: RequestHandlerWithInput<I, A, E, R, Request, Name>
    ): {
      <TData = A>(
        arg: I,
        options?: Omit<AtomQueryNewOptions<A, TData>, "select">
      ): Atom.Atom<AsyncResult.AsyncResult<A, E>>
    }
  } = <I, E, A, Request extends Req, Name extends string>(
    q: RequestHandlerWithInput<I, A, E, R, Request, Name>
  ) =>
  <TData = A>(
    arg: I,
    options?: Omit<AtomQueryNewOptions<A, TData>, "select">
  ) => queryAtomFor(getAtomRt(), q, arg, options)

  return useQueryAtom
}

export const makeQueryNew = <R>(_getRuntime: () => Context.Context<R>, getAtomRt: () => AtomClientRuntime) => {
  const useQueryNew: {
    <I, E, A, Request extends Req, Name extends string>(
      q: RequestHandlerWithInput<I, A, E, R, Request, Name>
    ): {
      <TData = A>(
        arg: WatchSource<Option.Option<I>>,
        options: Omit<AtomQueryNewOptions<A, TData>, "enabled"> & { mode: "optional" }
      ): QueryView<TData, E>

      <TData = A>(
        arg: I | WatchSource<I> | undefined,
        options?: AtomQueryNewOptions<A, TData>
      ): QueryView<TData, E>
    }
  } = <I, E, A, Request extends Req, Name extends string>(
    q: RequestHandlerWithInput<I, A, E, R, Request, Name>
  ) =>
  <TData = A>(
    arg: I | WatchSource<I> | undefined | WatchSource<Option.Option<I>>,
    options?: AtomQueryNewOptions<A, TData> & { readonly mode?: "optional" }
  ) => makeQueryView<I, A, E, TData>(getAtomRt, q, arg, options)

  return useQueryNew
}

export const makeQuery = <R>(_getRuntime: () => Context.Context<R>, getAtomRt: () => AtomClientRuntime) => {
  const useQuery_: {
    <I, A, E, Request extends Req, Name extends string>(
      q: RequestHandlerWithInput<I, A, E, R, Request, Name>
    ): {
      <TData = A>(
        arg: WatchSource<Option.Option<I>>,
        options: Omit<CustomUndefinedInitialQueryOptions<A, E, TData>, "enabled"> & { mode: "optional" }
      ): readonly [
        ComputedRef<AsyncResult.AsyncResult<TData, E>>,
        ComputedRef<TData | undefined>,
        (options?: RefetchOptions) => Effect.Effect<QueryObserverResult<TData, CauseException<E>>>,
        UseQueryDefinedReturnType<TData, CauseException<E>>
      ]

      <TData = A>(
        arg: I | WatchSource<I> | undefined,
        options?: CustomUndefinedInitialQueryOptions<A, E, TData>
      ): readonly [
        ComputedRef<AsyncResult.AsyncResult<TData, E>>,
        ComputedRef<TData | undefined>,
        (options?: RefetchOptions) => Effect.Effect<QueryObserverResult<TData, CauseException<E>>>,
        UseQueryDefinedReturnType<TData, CauseException<E>>
      ]

      <TData = A>(
        arg: I | WatchSource<I> | undefined,
        options: CustomDefinedInitialQueryOptions<A, E, TData>
      ): readonly [
        ComputedRef<AsyncResult.AsyncResult<TData, E>>,
        ComputedRef<TData>,
        (options?: RefetchOptions) => Effect.Effect<QueryObserverResult<TData, CauseException<E>>>,
        UseQueryDefinedReturnType<TData, CauseException<E>>
      ]

      <TData = A>(
        arg: I | WatchSource<I> | undefined,
        options: CustomDefinedPlaceholderQueryOptions<A, E, TData>
      ): readonly [
        ComputedRef<AsyncResult.AsyncResult<TData, E>>,
        ComputedRef<TData>,
        (options?: RefetchOptions) => Effect.Effect<QueryObserverResult<TData, CauseException<E>>>,
        UseQueryDefinedReturnType<TData, CauseException<E>>
      ]
    }
  } = <I, A, E, Request extends Req, Name extends string>(
    q: RequestHandlerWithInput<I, A, E, R, Request, Name>
  ) =>
  <TData = A>(
    arg: I | WatchSource<I> | undefined | WatchSource<Option.Option<I>>,
    options?: any
  ) => {
    const view = makeQueryView<I, A, E, TData>(getAtomRt, q, arg, options)

    // 4th element is internal-only; the public `.suspense()` Promise boundary lives in makeClient.
    const handle = {
      awaitResult: view.awaitResult,
      refetch: view.refetch,
      refresh: view.refresh,
      registry: view.registry,
      atom: view.atom
    }

    return [
      view.result,
      view.data,
      (_options?: RefetchOptions) => view.refetch(),
      handle
    ] as any
  }

  const useQuery: {
    /**
     * Effect results are passed to the caller, including errors.
     * When `I = void` the input argument may be omitted.
     * @deprecated use client helpers instead (.query())
     */
    <I, E, A, Request extends Req, Name extends string>(
      self: RequestHandlerWithInput<I, A, E, R, Request, Name>
    ): {
      <TData = A>(
        arg: WatchSource<Option.Option<I>>,
        options: Omit<CustomUndefinedInitialQueryOptions<A, CauseException<E>, TData>, "enabled"> & { mode: "optional" }
      ): readonly [
        ComputedRef<AsyncResult.AsyncResult<TData, E>>,
        ComputedRef<TData | undefined>,
        (options?: RefetchOptions) => Effect.Effect<QueryObserverResult<TData, CauseException<E>>>,
        UseQueryReturnType<any, any>
      ]
      <TData = A>(
        arg: I | WatchSource<I>,
        options: CustomDefinedInitialQueryOptions<A, CauseException<E>, TData>
      ): readonly [
        ComputedRef<AsyncResult.AsyncResult<TData, E>>,
        ComputedRef<TData>,
        (options?: RefetchOptions) => Effect.Effect<QueryObserverResult<TData, CauseException<E>>>,
        UseQueryReturnType<any, any>
      ]
      <TData = A>(
        arg: I | WatchSource<I>,
        options: CustomDefinedPlaceholderQueryOptions<A, CauseException<E>, TData>
      ): readonly [
        ComputedRef<AsyncResult.AsyncResult<TData, E>>,
        ComputedRef<TData>,
        (options?: RefetchOptions) => Effect.Effect<QueryObserverResult<TData, CauseException<E>>>,
        UseQueryReturnType<any, any>
      ]
      <TData = A>(
        arg: I | WatchSource<I>,
        options?: CustomUndefinedInitialQueryOptions<A, CauseException<E>, TData>
      ): readonly [
        ComputedRef<AsyncResult.AsyncResult<TData, E>>,
        ComputedRef<TData | undefined>,
        (options?: RefetchOptions) => Effect.Effect<QueryObserverResult<TData, CauseException<E>>>,
        UseQueryReturnType<any, any>
      ]
    }
  } = ((
    self: any
  ) => {
    const q = useQuery_(self)
    return (arg?: any, options?: any) => q(arg, options)
  }) as any
  return useQuery
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface MakeQuery2<R> extends ReturnType<typeof makeQuery<R>> {}

type StreamQueryResult<A, E> = readonly [
  ComputedRef<AsyncResult.AsyncResult<A[], E>>,
  ComputedRef<A[] | undefined>,
  (options?: RefetchOptions) => Effect.Effect<QueryObserverResult<A[], CauseException<E>>>,
  UseQueryReturnType<any, any>
]

export const makeStreamQuery = <R>(
  getRuntime: () => Context.Context<R>,
  getAtomRt: () => AtomClientRuntime
) => {
  const query = makeQuery(getRuntime, getAtomRt)
  // A stream query is an ordinary atom query over an effect that collects the whole stream
  // into an array (`Stream.runCollect`). It reuses all the atom machinery (family cache, swr,
  // invalidation, structural sharing). Note: unlike the old tanstack `streamedQuery`, the result
  // appears once the stream completes, not incrementally (stream queries are not used today).
  const streamQuery_: {
    <I, E, A, Request extends Req, Name extends string>(
      q: RequestStreamHandlerWithInput<I, A, E, R, Request, Name>
    ): (arg: I | WatchSource<I>) => StreamQueryResult<A, E>
  } = (q: any) => {
    const hook = query({
      id: q.id,
      options: q.options,
      handler: (i: any) => Stream.runCollect(q.handler(i)).pipe(Effect.map((chunk) => [...chunk]))
    } as any)
    return (arg?: any) => hook(arg) as any
  }

  return streamQuery_
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface MakeStreamQuery2<R> extends ReturnType<typeof makeStreamQuery<R>> {}

function orPrevious<E, A>(result: AsyncResult.AsyncResult<A, E>) {
  return AsyncResult.isFailure(result) && Option.isSome(result.previousSuccess)
    ? AsyncResult.success(result.previousSuccess.value, { waiting: result.waiting })
    : result
}

export function composeQueries<
  R extends Record<string, AsyncResult.AsyncResult<any, any>>
>(
  results: R,
  renderPreviousOnFailure?: boolean
): AsyncResult.AsyncResult<
  {
    [Property in keyof R]: R[Property] extends AsyncResult.AsyncResult<infer A, any> ? A
      : never
  },
  {
    [Property in keyof R]: R[Property] extends AsyncResult.AsyncResult<any, infer E> ? E
      : never
  }[keyof R]
> {
  const values = renderPreviousOnFailure
    ? Object.values(results).map(orPrevious)
    : Object.values(results)
  const error = values.find(AsyncResult.isFailure)
  if (error) {
    return error
  }
  const initial = Array.findFirst(values, (x) => x._tag === "Initial" ? Option.some(x) : Option.none())
  if (initial.value !== undefined) {
    return initial.value
  }
  const loading = Array.findFirst(values, (x) => AsyncResult.isInitial(x) && x.waiting ? Option.some(x) : Option.none())
  if (loading.value !== undefined) {
    return loading.value
  }

  const isRefreshing = values.some((x) => x.waiting)

  const r = Object.entries(results).reduce((prev, [key, value]) => {
    prev[key] = AsyncResult.value(value).value
    return prev
  }, {} as any)
  return AsyncResult.success(r, { waiting: isRefreshing })
}

export const useUpdateQuery = () => {
  const registry = injectRegistry()

  // NOTE: query atoms are derived (read-only) here, so unlike tanstack's `setQueryData` we can't
  // optimistically patch the cache in place — this refetches the query (the `updater` is ignored).
  // A first-class optimistic-update layer is planned for the atom-native redesign.
  const f: {
    <I, A>(
      query: RequestHandlerWithInput<I, A, any, any, any, any>,
      input: I,
      updater: (data: NoInfer<A>) => NoInfer<A>
    ): void
  } = (query: any, input: any, _updater: any) => {
    const family = queryFamilyByKey.get(queryFamilyCacheKey(query))
    if (!family) {
      console.warn(`Query ${query.id} has not been used yet; nothing to update`)
      return
    }
    registry.refresh(family(input))
  }
  return f
}

import { injectRegistry } from "@effect/atom-vue"
import { QueryClient, useQuery as useTanstackQuery } from "@tanstack/vue-query"
import { DataDependencies, makeQueryKey, type Req } from "effect-app/client"
import type { RequestHandlerWithInput } from "effect-app/client/clientFor"
import { CauseException, ServiceUnavailableError } from "effect-app/client/errors"
import type * as Context from "effect-app/Context"
import * as Effect from "effect-app/Effect"
import * as Option from "effect-app/Option"
import * as S from "effect-app/Schema"
import * as Cause from "effect/Cause"
import * as Ref from "effect/Ref"
import type * as Tracer from "effect/Tracer"
import { isHttpClientError } from "effect/unstable/http/HttpClientError"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import * as Atom from "effect/unstable/reactivity/Atom"
import { computed, type MaybeRefOrGetter, shallowRef, toValue, watch, type WatchSource } from "vue"
import { replaceEqualDeep } from "../atomQuery.ts"
import { clearQueryReadDependencies, setQueryReadDependencies } from "../dependencyMetadata.ts"
import { reportRuntimeError } from "../lib.ts"
import type { QueryInvalidator } from "../mutate.ts"
import type { CustomDefinedInitialQueryOptions, CustomDefinedPlaceholderQueryOptions, CustomUndefinedInitialQueryOptions, CustomUseQueryOptions, MakeQuery2, QueryCacheUpdater, QueryHandle, QueryObserverResult, RefetchOptions } from "../query.ts"
import { makeRunPromise } from "../runtime.ts"

const swrToQuery = <E, A>(r: {
  readonly error: CauseException<E> | null | undefined
  readonly data: A | undefined
  readonly isValidating: boolean
}): AsyncResult.AsyncResult<A, E> => {
  if (r.error !== undefined && r.error !== null) {
    return AsyncResult.failureWithPrevious(
      r.error.originalCause,
      {
        previous: r.data === undefined ? Option.none() : Option.some(AsyncResult.success(r.data)),
        waiting: r.isValidating
      }
    )
  }
  if (r.data !== undefined) {
    return AsyncResult.success<A, E>(r.data, { waiting: r.isValidating })
  }

  return AsyncResult.initial(r.isValidating)
}

const recoverCauseException = <A, E>(error: unknown): Effect.Effect<A, E> =>
  error instanceof CauseException
    ? Effect.failCause(error.originalCause)
    : Effect.die(error)

const isRetryable = (error: unknown) => {
  if (error instanceof CauseException) {
    return isHttpClientError(error.cause) || S.is(ServiceUnavailableError)(error.cause)
  }
  return false
}

const isInputOption = <I>(value: I | Option.Option<I> | undefined): value is Option.Option<I> => Option.isOption(value)

const resolveInput = <I>(
  arg: I | WatchSource<I> | undefined | WatchSource<Option.Option<I>>,
  mode: "optional" | undefined
): I | undefined => {
  if (mode === "optional") {
    const option = toValue(arg)
    return isInputOption(option) && Option.isSome(option) ? option.value : undefined
  }
  const value = toValue(arg)
  return isInputOption(value) ? undefined : value
}

const resolveEnabled = <I>(
  arg: I | WatchSource<I> | undefined | WatchSource<Option.Option<I>>,
  options: {
    readonly mode?: "optional" | undefined
    readonly enabled?: MaybeRefOrGetter<boolean | undefined> | undefined
  } | undefined
) => {
  if (options?.mode === "optional") {
    return computed(() => {
      const option = toValue(arg)
      return Option.isSome(option)
    })
  }
  return computed(() => {
    const enabled = options?.enabled
    if (enabled === undefined) return true
    return !!toValue(enabled)
  })
}

type LegacyTanstackOptions<A, E, TData> =
  & (
    | CustomUndefinedInitialQueryOptions<A, E, TData>
    | CustomDefinedInitialQueryOptions<A, E, TData>
    | CustomDefinedPlaceholderQueryOptions<A, E, TData>
    | CustomUseQueryOptions<A, E, TData>
  )
  & { readonly mode?: "optional" | undefined }

export const makeTanstackQueryClient = () => new QueryClient()

export const makeTanstackQueryInvalidator = (queryClient: QueryClient): QueryInvalidator => ({
  invalidateAndAwait: (keys) =>
    Effect.gen(function*() {
      const span = yield* Effect.currentParentSpan.pipe(Effect.orElseSucceed(() => undefined))
      yield* Effect.forEach(
        keys,
        (queryKey) => {
          const options = { updateMeta: { span } }
          return Effect.promise(() => queryClient.invalidateQueries({ queryKey }, options))
        },
        { discard: true, concurrency: "inherit" }
      )
    })
})

const fullQueryKey = (
  q: { readonly queryKeyProjectionHash?: string },
  queryKey: ReadonlyArray<unknown>,
  input: unknown
) => q.queryKeyProjectionHash === undefined ? [...queryKey, input] : [...queryKey, q.queryKeyProjectionHash, input]

export const makeTanstackQueryCacheUpdater = (queryClient: QueryClient): QueryCacheUpdater => ({
  update: <I, A, E, R, Request extends Req, Name extends string>(
    _registry: ReturnType<typeof injectRegistry>,
    query: RequestHandlerWithInput<I, A, E, R, Request, Name>,
    input: I,
    updater: (data: NoInfer<A>) => NoInfer<A>
  ) => {
    const queryKey = fullQueryKey(query, makeQueryKey(query), input)
    if (queryClient.getQueryData(queryKey) === undefined) {
      console.warn(`Query ${query.id} has not been used yet; nothing to update`)
      return
    }
    queryClient.setQueryData(queryKey, (data: A | undefined) => data === undefined ? data : updater(data))
  }
})

export const makeTanstackQuery = <R>(
  getRuntime: () => Context.Context<R>,
  queryClient: QueryClient
): MakeQuery2<R> => {
  // Drop a query's recorded read-dependencies when tanstack evicts it from the cache, so the
  // registry mirrors the live queries (mirrors the atom engine's `trackReadDependencies` finalizer).
  queryClient.getQueryCache().subscribe((event) => {
    if (event.type === "removed") clearQueryReadDependencies(event.query.queryKey)
  })

  const useQuery: MakeQuery2<R> = <I, A, E, Request extends Req, Name extends string>(
    q: RequestHandlerWithInput<I, A, E, R, Request, Name>
  ) =>
  <TData = A>(
    arg: I | WatchSource<I> | undefined | WatchSource<Option.Option<I>>,
    options?: LegacyTanstackOptions<A, CauseException<E>, TData>
  ) => {
    const runPromise = makeRunPromise(getRuntime())
    const queryKey = makeQueryKey(q)
    const enabled = resolveEnabled(arg, options)
    const structuralSharing = options?.structuralSharing === false ? false : replaceEqualDeep
    const tanstackOptions = {
      ...(options?.staleTime !== undefined ? { staleTime: options.staleTime } : {}),
      ...(typeof options?.gcTime === "number" ? { gcTime: options.gcTime } : {}),
      ...(options?.refetchOnWindowFocus !== undefined ? { refetchOnWindowFocus: options.refetchOnWindowFocus } : {}),
      structuralSharing,
      ...(options?.refetchInterval !== undefined ? { refetchInterval: options.refetchInterval } : {}),
      ...(options?.select !== undefined ? { select: options.select } : {})
    }
    const tanstack = useTanstackQuery<A, CauseException<E>, TData>({
      ...tanstackOptions,
      enabled,
      throwOnError: false,
      retry: (retryCount: number, error: unknown) => isRetryable(error) && retryCount < 5,
      queryKey: computed(() => {
        const input = resolveInput(arg, options?.mode)
        return fullQueryKey(q, queryKey, input)
      }),
      queryFn: (
        { meta, signal }: {
          readonly meta?: { readonly span?: Tracer.AnySpan | undefined } | undefined
          readonly signal: AbortSignal
        }
      ) =>
        runPromise(
          Effect.gen(function*() {
            const input = resolveInput(arg, options?.mode)!
            // Record the repository/server read-dependencies seen while fetching, keyed by the
            // tanstack queryKey, so a later mutation whose writes intersect them derives this query
            // as an invalidation target (the tanstack invalidator invalidates by this same key).
            const readsRef = yield* Ref.make(DataDependencies.empty())
            const writesRef = yield* Ref.make(DataDependencies.empty())
            const recorder = DataDependencies.makeDataDependencyRecorder(readsRef, writesRef)
            const result = yield* q
              .handler(input)
              .pipe(
                Effect.provideService(DataDependencies.DataDependencyRecorder, recorder),
                Effect.tapCauseIf(Cause.hasDies, (cause) => reportRuntimeError(cause)),
                Effect.withSpan(`query ${q.id}`, {}, { captureStackTrace: false }),
                meta?.span === undefined
                  ? (effect) => effect
                  : Effect.withParentSpan(meta.span, { captureStackTrace: false })
              )
            setQueryReadDependencies(fullQueryKey(q, queryKey, input), yield* Ref.get(readsRef))
            return result
          }),
          { signal }
        )
    }, queryClient)

    const latestSuccess = shallowRef<TData>()
    const result = computed((): AsyncResult.AsyncResult<TData, E> =>
      swrToQuery({
        error: tanstack.error.value,
        data: tanstack.data.value === undefined ? latestSuccess.value : tanstack.data.value,
        isValidating: tanstack.isFetching.value
      })
    )
    watch(result, (value) => latestSuccess.value = Option.getOrUndefined(AsyncResult.value(value)), { immediate: true })
    const seedLatestSuccess = (data: TData) => {
      if (latestSuccess.value === undefined) {
        latestSuccess.value = data
      }
    }

    const registry = injectRegistry()
    const latestSuccessRef = computed(() => latestSuccess.value)
    const atom = computed<Atom.Atom<AsyncResult.AsyncResult<TData, E>>>(() => Atom.readable(() => result.value))

    const awaitResult = (): Effect.Effect<TData, E> =>
      Effect
        .tryPromise({
          try: async () => {
            const queryResult = await tanstack.suspense()
            const data = queryResult.data
            if (data === undefined) {
              throw new Error("TanStack query resolved without data")
            }
            seedLatestSuccess(data)
            return data
          },
          catch: (error) => error
        })
        .pipe(
          Effect.catch((error) => recoverCauseException<TData, E>(error))
        )

    const refetch = (): Effect.Effect<TData, E> =>
      Effect.gen(function*() {
        const span = yield* Effect.currentParentSpan.pipe(Effect.orElseSucceed(() => undefined))
        return yield* Effect
          .tryPromise({
            try: async () => {
              const options = { throwOnError: true, updateMeta: { span } }
              const queryResult = await tanstack.refetch(options)
              const data = queryResult.data
              if (data === undefined) {
                throw new Error("TanStack query refetched without data")
              }
              return data
            },
            catch: (error) => error
          })
          .pipe(
            Effect.catch((error) => recoverCauseException<TData, E>(error))
          )
      })

    const handle: QueryHandle<TData, E> = {
      awaitResult,
      refetch,
      refresh: () => {
        void tanstack.refetch()
      },
      registry,
      atom
    }

    const fetch = (_options?: RefetchOptions): Effect.Effect<QueryObserverResult<TData, CauseException<E>>> =>
      refetch().pipe(Effect.exit, Effect.map(AsyncResult.fromExit))

    return [
      result,
      latestSuccessRef,
      fetch,
      handle
    ] as const
  }

  return useQuery
}

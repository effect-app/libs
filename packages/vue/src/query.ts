/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { streamedQuery } from "@tanstack/query-core"
import { type DefaultError, type Enabled, type InitialDataFunction, type NonUndefinedGuard, type PlaceholderDataFunction, type QueryKey, type QueryObserverOptions, type QueryObserverResult, type RefetchOptions, useQuery as useTanstackQuery, useQueryClient, type UseQueryDefinedReturnType, type UseQueryReturnType } from "@tanstack/vue-query"
import { Array, Cause, type Context, Effect, Exit, Option, S } from "effect-app"
import { makeQueryKey, type Req } from "effect-app/client"
import type { RequestHandler, RequestHandlerWithInput, RequestStreamHandler, RequestStreamHandlerWithInput } from "effect-app/client/clientFor"
import { CauseException, ServiceUnavailableError } from "effect-app/client/errors"
import { type Span } from "effect/Tracer"
import * as Channel from "effect/Channel"
import * as Pull from "effect/Pull"
import * as Scope from "effect/Scope"
import type * as Stream from "effect/Stream"
import { isHttpClientError } from "effect/unstable/http/HttpClientError"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import { computed, type ComputedRef, type MaybeRefOrGetter, ref, shallowRef, watch, type WatchSource } from "vue"
import { reportRuntimeError } from "./lib.js"
import { makeRunPromise } from "./runtime.js"

// we must use interface extends, or we get the dreaded typescript error of isn't portable blabla @tanstack/vue-query/build/modern/types.js
// but because how they are dealing with some extends clause, we loose all properties except initialData
// so we actually reconstruct the interfaces here from the ground up :/
export interface CustomUseQueryOptions<
  TQueryFnData = unknown,
  TError = DefaultError,
  TData = TQueryFnData,
  TQueryData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey
> extends
  Omit<
    QueryObserverOptions<TQueryFnData, TError, TData, TQueryData, TQueryKey>,
    "queryKey" | "queryFn" | "initialData" | "enabled" | "placeholderData"
  >
{
  enabled?: MaybeRefOrGetter<boolean | undefined> | (() => Enabled<TQueryFnData, TError, TQueryData, TQueryKey>)
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
  initialData?: undefined | InitialDataFunction<NonUndefinedGuard<TQueryFnData>> | NonUndefinedGuard<TQueryFnData>
  placeholderData?:
    | undefined
    | NonFunctionGuard<TQueryData>
    | PlaceholderDataFunction<NonFunctionGuard<TQueryData>, TError, NonFunctionGuard<TQueryData>, TQueryKey>
}
export interface CustomDefinedInitialQueryOptions<
  TQueryFnData = unknown,
  TError = DefaultError,
  TData = TQueryFnData,
  TQueryData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey
> extends CustomUseQueryOptions<TQueryFnData, TError, TData, TQueryData, TQueryKey> {
  initialData: NonUndefinedGuard<TQueryFnData> | (() => NonUndefinedGuard<TQueryFnData>)
  placeholderData?:
    | undefined
    | NonFunctionGuard<TQueryData>
    | PlaceholderDataFunction<NonFunctionGuard<TQueryData>, TError, NonFunctionGuard<TQueryData>, TQueryKey>
}

export interface CustomDefinedPlaceholderQueryOptions<
  TQueryFnData = unknown,
  TError = DefaultError,
  TData = TQueryFnData,
  TQueryData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey
> extends CustomUseQueryOptions<TQueryFnData, TError, TData, TQueryData, TQueryKey> {
  initialData?: NonUndefinedGuard<TQueryFnData> | (() => NonUndefinedGuard<TQueryFnData>) | undefined
  placeholderData:
    | NonFunctionGuard<TQueryData>
    | PlaceholderDataFunction<NonFunctionGuard<TQueryData>, TError, NonFunctionGuard<TQueryData>, TQueryKey>
}

function swrToQuery<E, A>(r: {
  error: CauseException<E> | undefined
  data: A | undefined
  isValidating: boolean
}): AsyncResult.AsyncResult<A, E> {
  if (r.error !== undefined) {
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

function streamToAsyncIterableWithCauseException<A, E, R>(
  self: Stream.Stream<A, E, R>,
  context: Context.Context<R>,
  id: string
): AsyncIterable<A> {
  return {
    [Symbol.asyncIterator]() {
      const runPromise = Effect.runPromiseWith(context)
      const runPromiseExit = Effect.runPromiseExitWith(context)
      const scope = Scope.makeUnsafe()
      let pull: any
      let currentIter: Iterator<A> | undefined
      return {
        async next(): Promise<IteratorResult<A>> {
          if (currentIter) {
            const next = currentIter.next()
            if (!next.done) return next
            currentIter = undefined
          }
          pull ??= await runPromise(Channel.toPullScoped((self as any).channel, scope))
          const exit = await runPromiseExit(pull)
          if (Exit.isSuccess(exit)) {
            currentIter = (exit.value as any)[Symbol.iterator]()
            return currentIter!.next()!
          } else if (Pull.isDoneCause((exit as any).cause)) {
            return { done: true, value: undefined }
          }
          throw new CauseException((exit as any).cause, id)
        },
        return(_) {
          return runPromise(Effect.as(Scope.close(scope, Exit.void), { done: true, value: undefined }) as any)
        }
      }
    }
  }
}

export const makeQuery = <R>(getRuntime: () => Context.Context<R>) => {
  const useQuery_: {
    <I, A, E, Request extends Req, Name extends string>(
      q:
        | RequestHandlerWithInput<I, A, E, R, Request, Name>
        | RequestHandler<A, E, R, Request, Name>
    ): {
      <TData = A>(
        arg: I | WatchSource<I> | undefined,
        options?: CustomUndefinedInitialQueryOptions<A, E, TData>
      ): readonly [
        ComputedRef<AsyncResult.AsyncResult<TData, E>>,
        ComputedRef<TData | undefined>,
        (options?: RefetchOptions) => Effect.Effect<QueryObserverResult<TData, CauseException<E>>, never, never>,
        UseQueryDefinedReturnType<TData, CauseException<E>>
      ]

      <TData = A>(
        arg: I | WatchSource<I> | undefined,
        options: CustomDefinedInitialQueryOptions<A, E, TData>
      ): readonly [
        ComputedRef<AsyncResult.AsyncResult<TData, E>>,
        ComputedRef<TData>,
        (options?: RefetchOptions) => Effect.Effect<QueryObserverResult<TData, CauseException<E>>, never, never>,
        UseQueryDefinedReturnType<TData, CauseException<E>>
      ]

      <TData = A>(
        arg: I | WatchSource<I> | undefined,
        options: CustomDefinedPlaceholderQueryOptions<A, E, TData>
      ): readonly [
        ComputedRef<AsyncResult.AsyncResult<TData, E>>,
        ComputedRef<TData>,
        (options?: RefetchOptions) => Effect.Effect<QueryObserverResult<TData, CauseException<E>>, never, never>,
        UseQueryDefinedReturnType<TData, CauseException<E>>
      ]
    }
  } = <I, A, E, Request extends Req, Name extends string>(
    q:
      | RequestHandlerWithInput<I, A, E, R, Request, Name>
      | RequestHandler<A, E, R, Request, Name>
  ) =>
  <TData = A>(
    arg: I | WatchSource<I> | undefined,
    // todo QueryKey type would be [string, ...string[]], but with I it would be [string, ...string[], I]
    options?: any
    // TODO
  ) => {
    // we wrap into CauseException because we want to keep the full cause of the failure.
    const runPromise = makeRunPromise(getRuntime())
    const arr = arg
    const req: { value: I } = !arg
      ? undefined as any
      : typeof arr === "function"
      ? ({
        get value() {
          return (arr as any)()
        }
      })
      : ref(arg)
    const queryKey = makeQueryKey(q)
    const projectionHash = (q as { queryKeyProjectionHash?: string }).queryKeyProjectionHash
    const baseQueryKey = projectionHash === undefined ? queryKey : [...queryKey, projectionHash]
    const handler = q.handler

    const defaultOptions = {
      // we do not want to throw errors, because we turn the success and error responses into a Result type
      // why don't we turn the error/success response into a Result type before returning to tanstack query? because we want to leverage tanstack query's retry and caching mechanism, which relies on throwing errors to trigger retries, and we don't want to interfere with that by catching the errors too early.
      // but if we allow tanstack query to throw, it will trigger the error boundary in Vue - via a "watcher callback" error - which we currently report and log, which is not what we want.
      // TODO: we might want to rethink the strategy of how to handle errors that happen after the initial load.
      // For suspense, the initial load is captured by the suspense boundary.
      // For subsequent loads (or non suspense use) we currently are required to use the QueryResult component to conditionally render error/loading/etc.
      throwOnError: false
    }

    const r = useTanstackQuery<A, CauseException<E>, TData>(
      Effect.isEffect(handler)
        ? {
          ...defaultOptions,
          ...options,
          retry: (retryCount, error) => {
            if (error instanceof CauseException) {
              if (!isHttpClientError(error.cause) && !S.is(ServiceUnavailableError)(error.cause)) {
                return false
              }
            }

            return retryCount < 5
          },
          queryKey: baseQueryKey,
          queryFn: ({ meta, signal }) =>
            runPromise(
              handler
                .pipe(
                  Effect.tapCauseIf(Cause.hasDies, (cause) => reportRuntimeError(cause)),
                  Effect.withSpan(`query ${q.id}`, {}, { captureStackTrace: false }),
                  meta?.["span"] ? Effect.withParentSpan(meta["span"] as Span) : (_) => _
                ),
              { signal }
            )
        }
        : {
          ...defaultOptions,
          ...options,
          retry: (retryCount, error) => {
            if (error instanceof CauseException) {
              if (!isHttpClientError(error.cause) && !S.is(ServiceUnavailableError)(error.cause)) {
                return false
              }
            }

            return retryCount < 5
          },
          queryKey: projectionHash === undefined ? [...queryKey, req] : [...queryKey, req, projectionHash],
          queryFn: ({ meta, signal }) =>
            runPromise(
              handler(req.value)
                .pipe(
                  Effect.tapCauseIf(Cause.hasDies, (cause) => reportRuntimeError(cause)),
                  Effect.withSpan(`query ${q.id}`, {}, { captureStackTrace: false }),
                  meta?.["span"] ? Effect.withParentSpan(meta["span"] as Span) : (_) => _
                ),
              { signal }
            )
        }
    )

    const latestSuccess = shallowRef<TData>()
    const result = computed((): AsyncResult.AsyncResult<TData, E> =>
      swrToQuery({
        error: r.error.value ?? undefined,
        data: r.data.value === undefined ? latestSuccess.value : r.data.value, // we fall back to existing data, as tanstack query might loose it when the key changes
        isValidating: r.isFetching.value
      })
    )
    // not using `computed` here as we have a circular dependency
    watch(result, (value) => latestSuccess.value = Option.getOrUndefined(AsyncResult.value(value)), { immediate: true })

    return [
      result,
      computed(() => latestSuccess.value),
      // one thing to keep in mind is that span will be disconnected as Context does not pass from outside.
      // TODO: consider how we should handle the Result here which is `QueryObserverResult<A, E>`
      // and always ends up in the success channel, even when error..
      (options?: RefetchOptions) =>
        Effect.currentSpan.pipe(
          Effect.orElseSucceed(() => null),
          Effect.flatMap((span) => Effect.promise(() => r.refetch({ ...options, updateMeta: { span } })))
        ),
      r
    ] as any
  }

  const useQuery: {
    /**
     * Effect results are passed to the caller, including errors.
     * @deprecated use client helpers instead (.query())
     */
    <E, A, Request extends Req, Name extends string>(
      self: RequestHandler<A, E, R, Request, Name>
    ): {
      // required options, with initialData
      /**
       * Effect results are passed to the caller, including errors.
       */
      <TData = A>(
        options: CustomDefinedInitialQueryOptions<A, CauseException<E>, TData>
      ): readonly [
        ComputedRef<AsyncResult.AsyncResult<TData, E>>,
        ComputedRef<TData>,
        (options?: RefetchOptions) => Effect.Effect<QueryObserverResult<TData, CauseException<E>>>,
        UseQueryReturnType<any, any>
      ]
      <TData = A>(
        options: CustomDefinedPlaceholderQueryOptions<A, E, TData>
      ): readonly [
        ComputedRef<AsyncResult.AsyncResult<TData, E>>,
        ComputedRef<TData>,
        (options?: RefetchOptions) => Effect.Effect<QueryObserverResult<TData, CauseException<E>>, never, never>,
        UseQueryDefinedReturnType<TData, CauseException<E>>
      ]
      // optional options, optional A
      /**
       * Effect results are passed to the caller, including errors.
       */
      <TData = A>(options?: CustomUndefinedInitialQueryOptions<A, CauseException<E>, TData>): readonly [
        ComputedRef<AsyncResult.AsyncResult<A, E>>,
        ComputedRef<A | undefined>,
        (options?: RefetchOptions) => Effect.Effect<QueryObserverResult<TData, CauseException<E>>>,
        UseQueryReturnType<any, any>
      ]
    }
    /**
     * Effect results are passed to the caller, including errors.
     * @deprecated use client helpers instead (.query())
     */
    <Arg, E, A, Request extends Req, Name extends string>(
      self: RequestHandlerWithInput<Arg, A, E, R, Request, Name>
    ): {
      // required options, with initialData
      /**
       * Effect results are passed to the caller, including errors.
       */
      <TData = A>(
        arg: Arg | WatchSource<Arg>,
        options: CustomDefinedInitialQueryOptions<A, CauseException<E>, TData>
      ): readonly [
        ComputedRef<AsyncResult.AsyncResult<TData, E>>,
        ComputedRef<TData>,
        (options?: RefetchOptions) => Effect.Effect<QueryObserverResult<TData, CauseException<E>>>,
        UseQueryReturnType<any, any>
      ]
      // required options, with placeholderData
      /**
       * Effect results are passed to the caller, including errors.
       */
      <TData = A>(
        arg: Arg | WatchSource<Arg>,
        options: CustomDefinedPlaceholderQueryOptions<A, CauseException<E>, TData>
      ): readonly [
        ComputedRef<AsyncResult.AsyncResult<TData, E>>,
        ComputedRef<TData>,
        (options?: RefetchOptions) => Effect.Effect<QueryObserverResult<TData, CauseException<E>>>,
        UseQueryReturnType<any, any>
      ]
      // optional options, optional A
      /**
       * Effect results are passed to the caller, including errors.
       */
      <TData = A>(
        arg: Arg | WatchSource<Arg>,
        options?: CustomUndefinedInitialQueryOptions<A, CauseException<E>, TData>
      ): readonly [
        ComputedRef<AsyncResult.AsyncResult<TData, E>>,
        ComputedRef<TData | undefined>,
        (options?: RefetchOptions) => Effect.Effect<QueryObserverResult<TData, CauseException<E>>>,
        UseQueryReturnType<any, any>
      ]
    }
  } = (
    self: any
  ) => {
    const q = useQuery_(self)

    return (argOrOptions?: any, options?: any) =>
      Effect.isEffect(self.handler)
        ? q(undefined, argOrOptions)
        : q(argOrOptions, options)
  }
  return useQuery
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface MakeQuery2<R> extends ReturnType<typeof makeQuery<R>> {}

export const makeStreamQuery = <R>(getRuntime: () => Context.Context<R>) =>
<I, A, E, Request extends Req, Name extends string>(
  q:
    | RequestStreamHandlerWithInput<I, A, E, R, Request, Name>
    | RequestStreamHandler<A, E, R, Request, Name>
) =>
(
  arg: I | WatchSource<I> | undefined,
  options?: any
) => {
  const context = getRuntime()
  const arr = arg
  const req: { value: I } = !arg
    ? undefined as any
    : typeof arr === "function"
    ? ({
      get value() {
        return (arr as any)()
      }
    })
    : ref(arg)
  const queryKey = makeQueryKey(q)
  const handler = q.handler
  const isWithInput = typeof handler === "function"

  const defaultOptions = {
    throwOnError: false
  }

  const retry = (retryCount: number, error: unknown) => {
    if (error instanceof CauseException) {
      if (!isHttpClientError(error.cause) && !S.is(ServiceUnavailableError)(error.cause)) {
        return false
      }
    }
    return retryCount < 5
  }

  const r = useTanstackQuery<A[], CauseException<E>, A[]>(
    {
      ...defaultOptions,
      ...options,
      retry,
      queryKey: isWithInput ? [...queryKey, req] : queryKey,
      queryFn: streamedQuery({
        streamFn: () => {
          const stream = isWithInput
            ? (handler as any)(req.value)
            : handler
          return streamToAsyncIterableWithCauseException(stream, context, q.id)
        }
      })
    }
  )

  const latestSuccess = shallowRef<A[]>()
  const result = computed((): AsyncResult.AsyncResult<A[], E> =>
    swrToQuery({
      error: r.error.value ?? undefined,
      data: r.data.value === undefined ? latestSuccess.value : r.data.value,
      isValidating: r.isFetching.value
    })
  )
  watch(result, (value) => latestSuccess.value = Option.getOrUndefined(AsyncResult.value(value)), { immediate: true })

  return [
    result,
    computed(() => latestSuccess.value),
    (options?: RefetchOptions) =>
      Effect.currentSpan.pipe(
        Effect.orElseSucceed(() => null),
        Effect.flatMap((span) => Effect.promise(() => r.refetch({ ...options, updateMeta: { span } })))
      ),
    r
  ] as any
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
  const queryClient = useQueryClient()

  const f: {
    <A>(
      query: RequestHandler<A, any, any, any, any>,
      updater: (data: NoInfer<A>) => NoInfer<A>
    ): void
    <I, A>(
      query: RequestHandlerWithInput<I, A, any, any, any, any>,
      input: I,
      updater: (data: NoInfer<A>) => NoInfer<A>
    ): void
  } = (query: any, updateOrInput: any, updaterMaybe?: any) => {
    const updater = updaterMaybe !== undefined ? updaterMaybe : updateOrInput
    const key = updaterMaybe !== undefined
      ? [...makeQueryKey(query), updateOrInput]
      : makeQueryKey(query)
    const data = queryClient.getQueryData(key)
    if (data) {
      queryClient.setQueryData(key, updater)
    } else {
      console.warn(`Query data for key ${key} not found`, key)
    }
  }
  return f
}

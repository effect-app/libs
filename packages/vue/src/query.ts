/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import * as Result from "@effect-atom/atom/Result"
import { isHttpClientError } from "@effect/platform/HttpClientError"
import { type DefaultError, type Enabled, type InitialDataFunction, type NonUndefinedGuard, type PlaceholderDataFunction, type QueryKey, type QueryObserverOptions, type QueryObserverResult, type RefetchOptions, useQuery as useTanstackQuery, useQueryClient, type UseQueryDefinedReturnType, type UseQueryReturnType } from "@tanstack/vue-query"
import { Array, Cause, Effect, Option, Runtime, S } from "effect-app"
import { type Req } from "effect-app/client"
import type { RequestHandler, RequestHandlerWithInput } from "effect-app/client/clientFor"
import { ServiceUnavailableError } from "effect-app/client/errors"
import { type Span } from "effect/Tracer"
import { computed, type ComputedRef, type MaybeRefOrGetter, ref, shallowRef, watch, type WatchSource } from "vue"
import { makeQueryKey, reportRuntimeError } from "./lib.js"

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
    | undefined
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

export interface KnownFiberFailure<E> extends Runtime.FiberFailure {
  readonly [Runtime.FiberFailureCauseId]: Cause.Cause<E>
}

export const makeQuery = <R>(getRuntime: () => Runtime.Runtime<R>) => {
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
        ComputedRef<Result.Result<TData, E>>,
        ComputedRef<TData | undefined>,
        (options?: RefetchOptions) => Effect.Effect<QueryObserverResult<TData, KnownFiberFailure<E>>, never, never>,
        UseQueryDefinedReturnType<TData, KnownFiberFailure<E>>
      ]

      <TData = A>(
        arg: I | WatchSource<I> | undefined,
        options: CustomDefinedInitialQueryOptions<A, E, TData>
      ): readonly [
        ComputedRef<Result.Result<TData, E>>,
        ComputedRef<TData>,
        (options?: RefetchOptions) => Effect.Effect<QueryObserverResult<TData, KnownFiberFailure<E>>, never, never>,
        UseQueryDefinedReturnType<TData, KnownFiberFailure<E>>
      ]

      <TData = A>(
        arg: I | WatchSource<I> | undefined,
        options: CustomDefinedPlaceholderQueryOptions<A, E, TData>
      ): readonly [
        ComputedRef<Result.Result<TData, E>>,
        ComputedRef<TData>,
        (options?: RefetchOptions) => Effect.Effect<QueryObserverResult<TData, KnownFiberFailure<E>>, never, never>,
        UseQueryDefinedReturnType<TData, KnownFiberFailure<E>>
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
    const runPromise = Runtime.runPromise(getRuntime())
    const arr = arg
    const req: { value: I } = !arg
      ? undefined
      : typeof arr === "function"
      ? ({
        get value() {
          return (arr as any)()
        }
      } as any)
      : ref(arg)
    const queryKey = makeQueryKey(q)
    const handler = q.handler

    const r = useTanstackQuery<A, KnownFiberFailure<E>, TData>(
      Effect.isEffect(handler)
        ? {
          ...options,
          retry: (retryCount, error) => {
            if (Runtime.isFiberFailure(error)) {
              const cause = error[Runtime.FiberFailureCauseId]
              const sq = Cause.squash(cause)
              if (!isHttpClientError(sq) && !S.is(ServiceUnavailableError)(sq)) {
                return false
              }
            }

            return retryCount < 5
          },
          queryKey,
          queryFn: ({ meta, signal }) =>
            runPromise(
              handler
                .pipe(
                  Effect.tapDefect(reportRuntimeError),
                  Effect.withSpan(`query ${q.id}`, { captureStackTrace: false }),
                  meta?.["span"] ? Effect.withParentSpan(meta["span"] as Span) : (_) => _
                ),
              { signal }
            )
        }
        : {
          ...options,
          retry: (retryCount, error) => {
            if (Runtime.isFiberFailure(error)) {
              const cause = error[Runtime.FiberFailureCauseId]
              const sq = Cause.squash(cause)
              if (!isHttpClientError(sq) && !S.is(ServiceUnavailableError)(sq)) {
                return false
              }
            }

            return retryCount < 5
          },
          queryKey: [...queryKey, req],
          queryFn: ({ meta, signal }) =>
            runPromise(
              handler(req.value)
                .pipe(
                  Effect.tapDefect(reportRuntimeError),
                  Effect.withSpan(`query ${q.id}`, { captureStackTrace: false }),
                  meta?.["span"] ? Effect.withParentSpan(meta["span"] as Span) : (_) => _
                ),
              { signal }
            )
        }
    )

    const latestSuccess = shallowRef<TData>()
    const result = computed((): Result.Result<TData, E> =>
      swrToQuery({
        error: r.error.value ?? undefined,
        data: r.data.value === undefined ? latestSuccess.value : r.data.value, // we fall back to existing data, as tanstack query might loose it when the key changes
        isValidating: r.isFetching.value
      })
    )
    // not using `computed` here as we have a circular dependency
    watch(result, (value) => latestSuccess.value = Option.getOrUndefined(Result.value(value)), { immediate: true })

    return [
      result,
      computed(() => latestSuccess.value),
      // one thing to keep in mind is that span will be disconnected as Context does not pass from outside.
      // TODO: consider how we should handle the Result here which is `QueryObserverResult<A, KnownFiberFailure<E>>`
      // and always ends up in the success channel, even when error..
      (options?: RefetchOptions) =>
        Effect.currentSpan.pipe(
          Effect.orElseSucceed(() => null),
          Effect.flatMap((span) => Effect.promise(() => r.refetch({ ...options, updateMeta: { span } })))
        ),
      r
    ] as any
  }

  function swrToQuery<E, A>(r: {
    error: KnownFiberFailure<E> | undefined
    data: A | undefined
    isValidating: boolean
  }): Result.Result<A, E> {
    if (r.error) {
      return Result.failureWithPrevious(
        r.error[Runtime.FiberFailureCauseId],
        {
          previous: r.data === undefined ? Option.none() : Option.some(Result.success(r.data)),
          waiting: r.isValidating
        }
      )
    }
    if (r.data !== undefined) {
      return Result.success<A, E>(r.data, { waiting: r.isValidating })
    }

    return Result.initial(r.isValidating)
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
        options: CustomDefinedInitialQueryOptions<A, KnownFiberFailure<E>, TData>
      ): readonly [
        ComputedRef<Result.Result<TData, E>>,
        ComputedRef<TData>,
        (options?: RefetchOptions) => Effect.Effect<QueryObserverResult<TData, KnownFiberFailure<E>>>,
        UseQueryReturnType<any, any>
      ]
      <TData = A>(
        options: CustomDefinedPlaceholderQueryOptions<A, E, TData>
      ): readonly [
        ComputedRef<Result.Result<TData, E>>,
        ComputedRef<TData>,
        (options?: RefetchOptions) => Effect.Effect<QueryObserverResult<TData, KnownFiberFailure<E>>, never, never>,
        UseQueryDefinedReturnType<TData, KnownFiberFailure<E>>
      ]
      // optional options, optional A
      /**
       * Effect results are passed to the caller, including errors.
       */
      <TData = A>(options?: CustomUndefinedInitialQueryOptions<A, KnownFiberFailure<E>, TData>): readonly [
        ComputedRef<Result.Result<A, E>>,
        ComputedRef<A | undefined>,
        (options?: RefetchOptions) => Effect.Effect<QueryObserverResult<TData, KnownFiberFailure<E>>>,
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
        options: CustomDefinedInitialQueryOptions<A, KnownFiberFailure<E>, TData>
      ): readonly [
        ComputedRef<Result.Result<TData, E>>,
        ComputedRef<TData>,
        (options?: RefetchOptions) => Effect.Effect<QueryObserverResult<TData, KnownFiberFailure<E>>>,
        UseQueryReturnType<any, any>
      ]
      // required options, with placeholderData
      /**
       * Effect results are passed to the caller, including errors.
       */
      <TData = A>(
        arg: Arg | WatchSource<Arg>,
        options: CustomDefinedPlaceholderQueryOptions<A, KnownFiberFailure<E>, TData>
      ): readonly [
        ComputedRef<Result.Result<TData, E>>,
        ComputedRef<TData>,
        (options?: RefetchOptions) => Effect.Effect<QueryObserverResult<TData, KnownFiberFailure<E>>>,
        UseQueryReturnType<any, any>
      ]
      // optional options, optional A
      /**
       * Effect results are passed to the caller, including errors.
       */
      <TData = A>(
        arg: Arg | WatchSource<Arg>,
        options?: CustomUndefinedInitialQueryOptions<A, KnownFiberFailure<E>, TData>
      ): readonly [
        ComputedRef<Result.Result<TData, E>>,
        ComputedRef<TData | undefined>,
        (options?: RefetchOptions) => Effect.Effect<QueryObserverResult<TData, KnownFiberFailure<E>>>,
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

function orPrevious<E, A>(result: Result.Result<A, E>) {
  return Result.isFailure(result) && Option.isSome(result.previousSuccess)
    ? Result.success(result.previousSuccess.value, { waiting: result.waiting })
    : result
}

export function composeQueries<
  R extends Record<string, Result.Result<any, any>>
>(
  results: R,
  renderPreviousOnFailure?: boolean
): Result.Result<
  {
    [Property in keyof R]: R[Property] extends Result.Result<infer A, any> ? A
      : never
  },
  {
    [Property in keyof R]: R[Property] extends Result.Result<any, infer E> ? E
      : never
  }[keyof R]
> {
  const values = renderPreviousOnFailure
    ? Object.values(results).map(orPrevious)
    : Object.values(results)
  const error = values.find(Result.isFailure)
  if (error) {
    return error
  }
  const initial = Array.findFirst(values, (x) => x._tag === "Initial" ? Option.some(x) : Option.none())
  if (initial.value !== undefined) {
    return initial.value
  }
  const loading = Array.findFirst(values, (x) => Result.isInitial(x) && x.waiting ? Option.some(x) : Option.none())
  if (loading.value !== undefined) {
    return loading.value
  }

  const isRefreshing = values.some((x) => x.waiting)

  const r = Object.entries(results).reduce((prev, [key, value]) => {
    prev[key] = Result.value(value).value
    return prev
  }, {} as any)
  return Result.success(r, { waiting: isRefreshing })
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

/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import * as Result from "@effect-atom/atom/Result"
import { isHttpClientError } from "@effect/platform/HttpClientError"
import { type Enabled, type InitialDataFunction, type QueryKey, type QueryObserverOptions, type QueryObserverResult, type RefetchOptions, useQuery, type UseQueryReturnType } from "@tanstack/vue-query"
import { Array, Cause, Effect, Option, Runtime, S } from "effect-app"
import type { RequestHandler, RequestHandlerWithInput, TaggedRequestClassAny } from "effect-app/client/clientFor"
import { ServiceUnavailableError } from "effect-app/client/errors"
import { type Span } from "effect/Tracer"
import { computed, type ComputedRef, type MaybeRefOrGetter, ref, type ShallowRef, shallowRef, watch, type WatchSource } from "vue"
import { getRuntime, makeQueryKey, reportRuntimeError } from "./lib.js"

export interface QueryObserverOptionsCustom<
  TQueryFnData = unknown,
  TError = Error,
  TData = TQueryFnData,
  TQueryData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey
> extends
  Omit<QueryObserverOptions<TQueryFnData, TError, TData, TQueryData, TQueryKey>, "queryKey" | "queryFn" | "enabled">
{
  enabled?: MaybeRefOrGetter<boolean | undefined> | (() => Enabled<TQueryFnData, TError, TQueryData, TQueryKey>)
}

export interface KnownFiberFailure<E> extends Runtime.FiberFailure {
  readonly [Runtime.FiberFailureCauseId]: Cause.Cause<E>
}

export const makeQuery = <R>(runtime: ShallowRef<Runtime.Runtime<R> | undefined>) => {
  // TODO: options
  // declare function useQuery<TQueryFnData = unknown, TError = DefaultError, TData = TQueryFnData, TQueryKey extends QueryKey = QueryKey>(options: UndefinedInitialQueryOptions<TQueryFnData, TError, TData, TQueryKey>, queryClient?: QueryClient): UseQueryReturnType<TData, TError>;
  // declare function useQuery<TQueryFnData = unknown, TError = DefaultError, TData = TQueryFnData, TQueryKey extends QueryKey = QueryKey>(options: DefinedInitialQueryOptions<TQueryFnData, TError, TData, TQueryKey>, queryClient?: QueryClient): UseQueryDefinedReturnType<TData, TError>;
  // declare function useQuery<TQueryFnData = unknown, TError = DefaultError, TData = TQueryFnData, TQueryKey extends QueryKey = QueryKey>(options: UseQueryOptions<TQueryFnData, TError, TData, TQueryFnData, TQueryKey>, queryClient?: QueryClient): UseQueryReturnType<TData, TError>;
  const useSafeQuery_ = <I, A, E, Request extends TaggedRequestClassAny>(
    q:
      | RequestHandlerWithInput<I, A, E, R, Request>
      | RequestHandler<A, E, R, Request>,
    arg?: I | WatchSource<I>,
    options: QueryObserverOptionsCustom<unknown, KnownFiberFailure<E>, A> = {} // TODO
  ) => {
    const runPromise = Runtime.runPromise(getRuntime(runtime))
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

    const r = useQuery<unknown, KnownFiberFailure<E>, A>(
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
                  Effect.withSpan(`query ${q.name}`, { captureStackTrace: false }),
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
                  Effect.withSpan(`query ${q.name}`, { captureStackTrace: false }),
                  meta?.["span"] ? Effect.withParentSpan(meta["span"] as Span) : (_) => _
                ),
              { signal }
            )
        }
    )

    const latestSuccess = shallowRef<A>()
    const result = computed((): Result.Result<A, E> =>
      swrToQuery({
        error: r.error.value ?? undefined,
        data: r.data.value ?? latestSuccess.value, // we fall back to existing data, as tanstack query might loose it when the key changes
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
    ] as const
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

  const useSafeQuery: {
    // required options, with initialData
    <E, A, Request extends TaggedRequestClassAny>(
      self: RequestHandler<A, E, R, Request>,
      options: QueryObserverOptionsCustom<A, E> & { initialData: A | InitialDataFunction<A> }
    ): readonly [
      ComputedRef<Result.Result<A, E>>,
      ComputedRef<A>,
      (options?: RefetchOptions) => Effect<QueryObserverResult<A, KnownFiberFailure<E>>>,
      UseQueryReturnType<any, any>
    ]
    <Arg, E, A, Request extends TaggedRequestClassAny>(
      self: RequestHandlerWithInput<Arg, A, E, R, Request>,
      arg: Arg | WatchSource<Arg>,
      options: QueryObserverOptionsCustom<A, E> & { initialData: A | InitialDataFunction<A> }
    ): readonly [
      ComputedRef<Result.Result<A, E>>,
      ComputedRef<A>,
      (options?: RefetchOptions) => Effect<QueryObserverResult<A, KnownFiberFailure<E>>>,
      UseQueryReturnType<any, any>
    ]

    // optional options, optional A
    <E, A, Request extends TaggedRequestClassAny>(
      self: RequestHandler<A, E, R, Request>,
      options?: QueryObserverOptionsCustom<A, E>
    ): readonly [
      ComputedRef<Result.Result<A, E>>,
      ComputedRef<A | undefined>,
      (options?: RefetchOptions) => Effect<QueryObserverResult<A, KnownFiberFailure<E>>>,
      UseQueryReturnType<any, any>
    ]
    <Arg, E, A, Request extends TaggedRequestClassAny>(
      self: RequestHandlerWithInput<Arg, A, E, R, Request>,
      arg: Arg | WatchSource<Arg>,
      options?: QueryObserverOptionsCustom<A, E>
    ): readonly [
      ComputedRef<Result.Result<A, E>>,
      ComputedRef<A | undefined>,
      (options?: RefetchOptions) => Effect<QueryObserverResult<A, KnownFiberFailure<E>>>,
      UseQueryReturnType<any, any>
    ]
  } = (
    self: any,
    argOrOptions?: any,
    options?: any
  ) =>
    Effect.isEffect(self.handler)
      ? useSafeQuery_(self, undefined, argOrOptions)
      : useSafeQuery_(self, argOrOptions, options)
  return useSafeQuery
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

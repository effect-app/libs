/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import * as Result from "@effect-rx/rx/Result"
import type {
  InitialDataFunction,
  QueryKey,
  QueryObserverOptions,
  QueryObserverResult,
  RefetchOptions,
  UseQueryReturnType
} from "@tanstack/vue-query"
import { useQuery } from "@tanstack/vue-query"
import { Array, Cause, Effect, Option, Runtime, S } from "effect-app"
import { ServiceUnavailableError } from "effect-app/client"
import { isHttpRequestError, isHttpResponseError } from "effect-app/http/http-client"
import { computed, ref } from "vue"
import type { ComputedRef, ShallowRef, WatchSource } from "vue"
import { getRuntime, makeQueryKey, reportRuntimeError } from "./lib.js"

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface QueryObserverOptionsCustom<
  TQueryFnData = unknown,
  TError = Error,
  TData = TQueryFnData,
  TQueryData = TQueryFnData,
  TQueryKey extends QueryKey = QueryKey,
  TPageParam = never
> extends
  Omit<QueryObserverOptions<TQueryFnData, TError, TData, TQueryData, TQueryKey, TPageParam>, "queryKey" | "queryFn">
{}

export interface KnownFiberFailure<E> extends Runtime.FiberFailure {
  readonly [Runtime.FiberFailureCauseId]: Cause.Cause<E>
}

export const makeQuery = <R>(runtime: ShallowRef<Runtime.Runtime<R> | undefined>) => {
  // TODO: options
  // declare function useQuery<TQueryFnData = unknown, TError = DefaultError, TData = TQueryFnData, TQueryKey extends QueryKey = QueryKey>(options: UndefinedInitialQueryOptions<TQueryFnData, TError, TData, TQueryKey>, queryClient?: QueryClient): UseQueryReturnType<TData, TError>;
  // declare function useQuery<TQueryFnData = unknown, TError = DefaultError, TData = TQueryFnData, TQueryKey extends QueryKey = QueryKey>(options: DefinedInitialQueryOptions<TQueryFnData, TError, TData, TQueryKey>, queryClient?: QueryClient): UseQueryDefinedReturnType<TData, TError>;
  // declare function useQuery<TQueryFnData = unknown, TError = DefaultError, TData = TQueryFnData, TQueryKey extends QueryKey = QueryKey>(options: UseQueryOptions<TQueryFnData, TError, TData, TQueryFnData, TQueryKey>, queryClient?: QueryClient): UseQueryReturnType<TData, TError>;
  const useSafeQuery_ = <I, A, E>(
    q:
      | {
        readonly handler: (
          req: I
        ) => Effect<
          A,
          E,
          R
        >
        name: string
      }
      | {
        readonly handler: Effect<
          A,
          E,
          R
        >
        name: string
      },
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
              if (!isHttpRequestError(sq) && !isHttpResponseError(sq) && !S.is(ServiceUnavailableError)(sq)) {
                return false
              }
            }

            return retryCount < 5
          },
          queryKey,
          queryFn: ({ signal }) =>
            runPromise(
              handler
                .pipe(
                  Effect.tapDefect(reportRuntimeError),
                  Effect.withSpan(`query ${q.name}`, { captureStackTrace: false })
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
              if (!isHttpRequestError(sq) && !isHttpResponseError(sq) && !S.is(ServiceUnavailableError)(sq)) {
                return false
              }
            }

            return retryCount < 5
          },
          queryKey: [...queryKey, req],
          queryFn: ({ signal }) =>
            runPromise(
              handler(req.value)
                .pipe(
                  Effect.tapDefect(reportRuntimeError),
                  Effect.withSpan(`query ${q.name}`, { captureStackTrace: false })
                ),
              { signal }
            )
        }
    )

    const result = computed(() =>
      swrToQuery({
        error: r.error.value ?? undefined,
        data: r.data.value,
        isValidating: r.isFetching.value
      })
    )
    const latestSuccess = computed(() => Option.getOrUndefined(Result.value(result.value)))
    return [result, latestSuccess, r.refetch, r] as const
  }

  function swrToQuery<E, A>(r: {
    error: KnownFiberFailure<E> | undefined
    data: A | undefined
    isValidating: boolean
  }): Result.Result<A, E> {
    if (r.error) {
      return Result.failureWithPrevious(
        r.error[Runtime.FiberFailureCauseId],
        r.data === undefined ? Option.none() : Option.some(Result.success(r.data)),
        r.isValidating
      )
    }
    if (r.data !== undefined) {
      return Result.success<A, E>(r.data, r.isValidating)
    }

    return Result.initial(r.isValidating)
  }

  function useSafeQuery<E, A>(
    self: {
      handler: Effect<A, E, R>
      name: string
    },
    options: QueryObserverOptionsCustom<A, E> & { initialData: A | InitialDataFunction<A> }
  ): readonly [
    ComputedRef<Result.Result<A, E>>,
    ComputedRef<A>,
    (options?: RefetchOptions) => Promise<QueryObserverResult<any, any>>,
    UseQueryReturnType<any, any>
  ]
  function useSafeQuery<Arg, E, A>(
    self: {
      handler: (arg: Arg) => Effect<A, E, R>
      name: string
    },
    arg: Arg | WatchSource<Arg>,
    options: QueryObserverOptionsCustom<A, E>
  ): readonly [
    ComputedRef<Result.Result<A, E>>,
    ComputedRef<A>,
    (options?: RefetchOptions) => Promise<QueryObserverResult<any, any>>,
    UseQueryReturnType<any, any>
  ]
  function useSafeQuery<E, A>(
    self: {
      handler: Effect<A, E, R>
      name: string
    },
    options?: QueryObserverOptionsCustom<A, E>
  ): readonly [
    ComputedRef<Result.Result<A, E>>,
    ComputedRef<A | undefined>,
    (options?: RefetchOptions) => Promise<QueryObserverResult<any, any>>,
    UseQueryReturnType<any, any>
  ]
  function useSafeQuery<Arg, E, A>(
    self: {
      handler: (arg: Arg) => Effect<A, E, R>
      name: string
    },
    arg: Arg | WatchSource<Arg>,
    options?: QueryObserverOptionsCustom<A, E>
  ): readonly [
    ComputedRef<Result.Result<A, E>>,
    ComputedRef<A | undefined>,
    (options?: RefetchOptions) => Promise<QueryObserverResult<any, any>>,
    UseQueryReturnType<any, any>
  ]
  function useSafeQuery(
    self: any,
    /*
  q:
    | {
      handler: (
        req: I
      ) => Effect<
        A,
        E,
        R
      >
      name: string
    }
    | {
      handler: Effect<
        A,
        E,
        R
      >
      name: string
    },
  */
    argOrOptions?: any,
    options?: any
  ) {
    return Effect.isEffect(self.handler)
      ? useSafeQuery_(self, undefined, argOrOptions)
      : useSafeQuery_(self, argOrOptions, options)
  }
  return useSafeQuery
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface MakeQuery<R> extends ReturnType<typeof makeQuery<R>> {}

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
  return Result.success(r, isRefreshing)
}

function orPrevious<E, A>(result: Result.Result<A, E>) {
  return Result.isFailure(result) && Option.isSome(result.previousValue)
    ? Result.success(result.previousValue.value, result.waiting)
    : result
}

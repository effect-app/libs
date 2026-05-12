/* eslint-disable @typescript-eslint/no-explicit-any */
import { matchQuery } from "@tanstack/query-core"
import { type InvalidateOptions, type InvalidateQueryFilters, type QueryClient, useQueryClient } from "@tanstack/vue-query"
import { type InvalidationKey, InvalidationKeysFromServer, makeInvalidationKeysService, makeQueryKey, type Req } from "effect-app/client"
import type { ClientForOptions, RequestHandlerWithInput } from "effect-app/client/clientFor"
import * as Effect from "effect-app/Effect"
import { tuple } from "effect-app/Function"
import * as Option from "effect-app/Option"
import type * as Cause from "effect/Cause"
import * as Exit from "effect/Exit"
import * as Ref from "effect/Ref"
import * as Stream from "effect/Stream"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import { computed, type ComputedRef, shallowRef } from "vue"

export const getQueryKey = (h: { id: string; options?: ClientForOptions }) => {
  const key = makeQueryKey(h)
  const ns = key.filter((_) => _.startsWith("$"))
  // we invalidate the full namespace of the action e.g $project/$configuration.get, we invalidate $project/$configuration
  // for $project/$configuration/$something.get, we invalidate $project/$configuration/$something
  const k = ns.length ? ns : undefined
  if (!k) throw new Error("empty query key for: " + h.id)
  return k
}

export function mutationResultToVue<A, E>(
  mutationResult: AsyncResult.AsyncResult<A, E>
): Res<A, E> {
  switch (mutationResult._tag) {
    case "Initial": {
      return { loading: mutationResult.waiting, data: undefined, error: undefined }
    }
    case "Success": {
      return {
        loading: false,
        data: mutationResult.value,
        error: undefined
      }
    }
    case "Failure": {
      return {
        loading: false,
        data: undefined,
        error: mutationResult.cause
      }
    }
  }
}

export interface Res<A, E> {
  readonly loading: boolean
  readonly data: A | undefined
  readonly error: Cause.Cause<E> | undefined
}

export function make<A, E, R>(self: Effect.Effect<A, E, R>) {
  const result = shallowRef(AsyncResult.initial() as AsyncResult.AsyncResult<A, E>)

  const execute = Effect
    .sync(() => {
      result.value = AsyncResult.waiting(result.value)
    })
    .pipe(
      Effect.andThen(self),
      Effect.exit,
      Effect.map(AsyncResult.fromExit),
      Effect.flatMap((r) => Effect.sync(() => result.value = r))
    )

  const latestSuccess = computed(() => Option.getOrUndefined(AsyncResult.value(result.value)))

  return tuple(result, latestSuccess, execute)
}

export interface MutationOptionsBase<A = unknown, B = A, E2 = never, R2 = never> {
  /**
   * By default we invalidate the full namespace of the query key, e.g $project/$configuration.get, we invalidate $project/$configuration.
   * This can be overridden by providing a function that returns an array of filters and options.
   */
  queryInvalidation?: (defaultKey: string[], name: string, input?: unknown, output?: Exit.Exit<unknown, unknown>) => {
    filters?: InvalidateQueryFilters | undefined
    options?: InvalidateOptions | undefined
  }[]
  /**
   * Run an additional Effect after the mutation succeeds. Its output becomes the
   * final result returned to the caller. Query cache is invalidated once on
   * mutation exit and again after this Effect completes. Useful for long-running
   * operations (e.g. polling a background job) where you want the caller to
   * receive the downstream result and the cache to refresh once it is ready.
   *
   * @example
   * ```ts
   * useMutation(startExportCommand, {
   *   select: (result) => pollUntilDone(result.jobId)
   *   // caller receives the pollUntilDone output, not the original result
   * })
   * ```
   */
  select?: (result: A) => Effect.Effect<B, E2, R2>
}

export const asResult = <Args extends readonly any[], A, E, R>(
  handler: (...args: Args) => Effect.Effect<A, E, R>
): readonly [
  ComputedRef<AsyncResult.AsyncResult<A, E>>,
  (...args: Args) => Effect.Effect<Exit.Exit<A, E>, never, R>
] => {
  const state = shallowRef<AsyncResult.AsyncResult<A, E>>(AsyncResult.initial())

  const act = (...args: Args) =>
    Effect
      .sync(() => {
        state.value = AsyncResult.initial(true)
      })
      .pipe(
        Effect.andThen(Effect.suspend(() =>
          handler(...args).pipe(
            Effect.exit,
            Effect.tap((exit) => Effect.sync(() => (state.value = AsyncResult.fromExit(exit))))
          )
        ))
      )

  return tuple(computed(() => state.value), act) as any
}

/**
 * Like `asResult`, but for streams. The ref is updated with each emitted value
 * (keeping `waiting: true`) and is finalised (with `waiting: false`) once the
 * stream terminates successfully. Errors are surfaced as `AsyncResult.failure`.
 */
export const asStreamResult = <Args extends readonly any[], A, E, R>(
  handler: (...args: Args) => Stream.Stream<A, E, R>
): readonly [ComputedRef<AsyncResult.AsyncResult<A, E>>, (...args: Args) => Effect.Effect<void, never, R>] => {
  const state = shallowRef<AsyncResult.AsyncResult<A, E>>(AsyncResult.initial())

  const runStream = (stream: Stream.Stream<A, E, R>): Effect.Effect<void, never, R> =>
    Effect
      .sync(() => {
        state.value = AsyncResult.initial(true)
      })
      .pipe(
        Effect.andThen(
          stream.pipe(
            Stream.runForEach((value) =>
              Effect.sync(() => {
                state.value = AsyncResult.success(value, { waiting: true })
              })
            ),
            Effect.exit,
            Effect.flatMap((exit) =>
              Effect.sync(() => {
                if (exit._tag === "Success") {
                  const current = state.value
                  if (AsyncResult.isSuccess(current)) {
                    state.value = AsyncResult.success(current.value, { waiting: false })
                  } else {
                    state.value = AsyncResult.initial(false)
                  }
                } else {
                  state.value = AsyncResult.failure(exit.cause)
                }
              })
            )
          )
        )
      )

  const act = (...args: Args) => runStream(handler(...args))

  return tuple(computed(() => state.value), act) as any
}

const buildInvalidateCache = (
  queryClient: QueryClient,
  self: { id: string; options?: ClientForOptions },
  queryInvalidation?: MutationOptionsBase["queryInvalidation"]
) => {
  type InvalidationTarget = {
    readonly filters: InvalidateQueryFilters | undefined
    readonly options: InvalidateOptions | undefined
  }

  const invalidateQueriesFn = (
    filters?: InvalidateQueryFilters,
    options?: InvalidateOptions
  ) =>
    Effect.currentSpan.pipe(
      Effect.orElseSucceed(() => null),
      Effect.flatMap((span) =>
        Effect.promise(() => queryClient.invalidateQueries(filters, { ...options, updateMeta: { span } }))
      )
    )

  const getClientInvalidationTargets = (
    input: unknown,
    output: Exit.Exit<unknown, unknown>
  ): ReadonlyArray<InvalidationTarget> => {
    const queryKey = getQueryKey(self)

    if (queryInvalidation) {
      return queryInvalidation(queryKey, self.id, input, output).map((_) => ({
        filters: _.filters,
        options: _.options
      }))
    }

    if (!queryKey) {
      return []
    }

    return [{ filters: { queryKey }, options: undefined }]
  }

  const invalidateCache = (
    input: unknown,
    output: Exit.Exit<unknown, unknown>,
    serverKeys: ReadonlyArray<InvalidationKey>
  ) =>
    Effect.suspend(() => {
      const clientTargets = getClientInvalidationTargets(input, output)
      const serverTargets: ReadonlyArray<InvalidationTarget> = serverKeys.map((queryKey) => ({
        filters: { queryKey },
        options: undefined
      }))
      const allTargets: ReadonlyArray<InvalidationTarget> = [...clientTargets, ...serverTargets]

      if (!allTargets.length) return Effect.void

      // Group targets by refetchType + options so each group can be merged into a single
      // invalidateQueries call using a predicate, reducing N calls to 1 in the common case.
      type Group = {
        targets: Array<InvalidationTarget>
        refetchType: InvalidateQueryFilters["refetchType"]
        options: InvalidateOptions | undefined
      }
      const groups = new Map<string, Group>()
      for (const target of allTargets) {
        const key = `${target.filters?.refetchType ?? ""}|${target.options?.cancelRefetch ?? ""}|${
          target.options?.throwOnError?.toString() ?? ""
        }`
        const existing = groups.get(key)
        if (existing) {
          existing.targets.push(target)
        } else {
          groups.set(key, { targets: [target], refetchType: target.filters?.refetchType, options: target.options })
        }
      }

      return Effect
        .andThen(
          Effect.annotateCurrentSpan({ clientTargets, serverKeys }),
          Effect.forEach(
            groups.values(),
            ({ options, refetchType, targets }) =>
              invalidateQueriesFn(
                {
                  ...(refetchType !== undefined ? { refetchType } : {}),
                  predicate: (query) => targets.some((t) => t.filters ? matchQuery(t.filters, query) : true)
                },
                options
              ),
            { discard: true, concurrency: "inherit" }
          )
        )
        .pipe(
          Effect.tap(
            // hand over control back to the event loop so that state can be updated..
            // TODO: should we do this in general on any mutation, regardless of invalidation?
            Effect.sleep(0)
          ),
          Effect.withSpan("client.query.invalidation", {}, { captureStackTrace: false })
        )
    })

  return invalidateCache
}

export const invalidateQueries = (
  queryClient: QueryClient,
  self: { id: string; options?: ClientForOptions },
  options?: MutationOptionsBase
) => {
  const invalidateCache = buildInvalidateCache(queryClient, self, options?.queryInvalidation)

  const select = options?.select

  const handle = <A, E, R>(eff: Effect.Effect<A, E, R>, input?: unknown) =>
    Effect.gen(function*() {
      const keysRef = yield* Ref.make<ReadonlyArray<InvalidationKey>>([])
      const result = yield* eff.pipe(
        Effect.provideService(InvalidationKeysFromServer, makeInvalidationKeysService(keysRef)),
        Effect.onExit((exit) =>
          Effect.gen(function*() {
            const serverKeys = yield* Ref.get(keysRef)
            yield* invalidateCache(input, exit, serverKeys)
          })
        )
      )
      if (select) {
        return yield* select(result).pipe(
          Effect.onExit((exit) =>
            Effect.gen(function*() {
              const serverKeys = yield* Ref.get(keysRef)
              yield* invalidateCache(input, exit, serverKeys)
            })
          )
        )
      }
      return result
    })

  return handle
}

/**
 * A callable mutation result. When `I = void` the input argument may be omitted.
 */
export interface MutationFn<I, A, E, R, Id extends string> {
  <B = A, E2 = never, R2 = never>(
    input: I,
    options?: MutationOptionsBase<A, B, E2, R2>
  ): Effect.Effect<B, E | E2, R | R2>
  readonly id: Id
}

export const makeMutation = () => {
  /**
   * Pass a function that returns an Effect, e.g from a client action.
   * Executes query cache invalidation based on default rules or provided option.
   * When `I = void` the input argument may be omitted.
   */
  const useMutation = <I, E, A, R, Request extends Req, Id extends string>(
    self: RequestHandlerWithInput<I, A, E, R, Request, Id>
  ): MutationFn<I, A, E, R, Id> => {
    const queryClient = useQueryClient()
    const r = (i: I, options?: MutationOptionsBase) => invalidateQueries(queryClient, self, options)(self.handler(i), i)
    return Object.assign(r, { id: self.id }) as any
  }
  return useMutation
}

// calling hooks in the body
export const useMakeMutation = () => {
  const queryClient = useQueryClient()

  /**
   * Pass a function that returns an Effect, e.g from a client action.
   * Executes query cache invalidation based on default rules or provided option.
   * When `I = void` the input argument may be omitted.
   */
  const useMutation = <I, E, A, R, Request extends Req, Id extends string>(
    self: RequestHandlerWithInput<I, A, E, R, Request, Id>
  ): MutationFn<I, A, E, R, Id> => {
    const r = (i: I, options?: MutationOptionsBase) => invalidateQueries(queryClient, self, options)(self.handler(i), i)
    return Object.assign(r, { id: self.id }) as any
  }
  return useMutation
}

/**
 * Returns a stream-based mutation factory for use with `streamFn`.
 * The outer Effect sets up per-invocation invalidation scaffolding
 * and returns a stream that triggers query invalidation via `Stream.ensuring` when it completes.
 *
 * Use with `streamFn` / `Command.streamFn(id)(mutateHandler, ...combinators)` so that
 * the command manages its own reactive state internally.
 *
 * Must be called inside a Vue setup context (uses `useQueryClient` internally).
 */
export const makeStreamMutation2 = () => {
  const queryClient = useQueryClient()

  return (
    self: {
      id: string
      options?: ClientForOptions
      handler: (i: any) => Stream.Stream<any, any, any>
    },
    mergedInvalidation?: MutationOptionsBase["queryInvalidation"]
  ) => {
    const invCache = buildInvalidateCache(queryClient, self, mergedInvalidation)

    const makeInvocationEffect = (input: unknown, source: Stream.Stream<any, any, any>) =>
      Effect.gen(function*() {
        const keysRef = yield* Ref.make<ReadonlyArray<InvalidationKey>>([])
        const invKeys = makeInvalidationKeysService(keysRef, (key) => invCache(input, Exit.succeed(undefined), [key]))
        const lastRef = yield* Ref.make<any>(undefined)
        return source.pipe(
          Stream.provideService(InvalidationKeysFromServer, invKeys),
          Stream.tap((v) => Ref.set(lastRef, v)),
          Stream.ensuring(
            Effect.gen(function*() {
              const lastValue = yield* Ref.get(lastRef)
              const serverKeys = yield* Ref.get(keysRef)
              yield* invCache(input, Exit.succeed(lastValue), serverKeys)
            })
          )
        )
      })

    return (i: any) => Stream.unwrap(makeInvocationEffect(i, self.handler(i)))
  }
}

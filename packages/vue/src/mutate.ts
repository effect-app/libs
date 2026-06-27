/* eslint-disable @typescript-eslint/no-explicit-any */
import { DataDependencies, type InvalidationKey, InvalidationKeysFromServer, makeInvalidationKeysService, makeQueryKey, type Req } from "effect-app/client"
import type { ClientForOptions, RequestHandlerWithInput } from "effect-app/client/clientFor"
import type { InvalidateQueryInstruction } from "effect-app/client/makeClient"
import * as Effect from "effect-app/Effect"
import { tuple } from "effect-app/Function"
import * as Option from "effect-app/Option"
import { isReadonlyArrayNonEmpty } from "effect/Array"
import type * as Cause from "effect/Cause"
import * as Exit from "effect/Exit"
import * as Ref from "effect/Ref"
import * as Stream from "effect/Stream"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import type * as Reactivity from "effect/unstable/reactivity/Reactivity"
import { computed, type ComputedRef, shallowRef } from "vue"
import { invalidateAndAwait } from "./atomQuery.ts"
import { getDerivedInvalidationKeys } from "./dependencyMetadata.ts"

export type GetQueryKey = (h: { id: string; options?: ClientForOptions }) => string[]

/**
 * Default heuristic: invalidate the parent namespace of the action.
 * e.g. `$project/$configuration.get` -> `["$project"]`
 * e.g. `$project/$configuration/$something.get` -> `["$project","$configuration"]`
 */
export const defaultGetQueryKey: GetQueryKey = (h) => {
  const key = makeQueryKey(h)
  const ns = key.filter((_) => _.startsWith("$"))
  const k = ns.length ? ns.length > 1 ? ns.slice(0, ns.length - 1) : ns : undefined
  if (!k) throw new Error("empty query key for: " + h.id)
  return k
}

let activeGetQueryKey: GetQueryKey = defaultGetQueryKey

/**
 * Override the default query-key heuristic used by mutations for cache
 * invalidation. Call once at app bootstrap. Pass `undefined` to restore the
 * built-in default.
 *
 * @example
 * ```ts
 * // invalidate the full namespace of the action (no parent collapse)
 * setDefaultGetQueryKey((h) => {
 *   const key = makeQueryKey(h)
 *   const ns = key.filter((_) => _.startsWith("$"))
 *   if (!ns.length) throw new Error("empty query key for: " + h.id)
 *   return ns
 * })
 * ```
 */
export const setDefaultGetQueryKey = (fn: GetQueryKey | undefined) => {
  activeGetQueryKey = fn ?? defaultGetQueryKey
}

export const getQueryKey: GetQueryKey = (h) => activeGetQueryKey(h)

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

/**
 * An entry for `queryInvalidation`: a raw query key, an `{ id }` handler ref, or a
 * `{ filters }` shape. The atom engine acts on entries that carry a concrete query
 * key: raw arrays, handler refs, or `{ filters: { queryKey } }`. Predicate-only
 * filters have no exact-key reactivity equivalent and fail fast.
 */
export type QueryKeyInvalidationFilters = {
  readonly queryKey: ReadonlyArray<unknown>
}
export type InvalidationEntry = InvalidateQueryInstruction<QueryKeyInvalidationFilters>
export type QueryInvalidationEffect<R = never> = (
  keys: ReadonlyArray<ReadonlyArray<unknown>>
) => Effect.Effect<void, never, R>
export interface QueryInvalidator<R = never> {
  readonly invalidateAndAwait: QueryInvalidationEffect<R>
}

export const atomQueryInvalidator: QueryInvalidator<Reactivity.Reactivity> = {
  invalidateAndAwait
}

export const combineQueryInvalidators = <R>(
  ...invalidators: ReadonlyArray<QueryInvalidator<R>>
): QueryInvalidator<R> => ({
  invalidateAndAwait: (keys) =>
    Effect.forEach(
      invalidators,
      (invalidator) => invalidator.invalidateAndAwait(keys),
      { discard: true, concurrency: "inherit" }
    )
})

const isRecord = (value: unknown): value is { readonly [key: string]: unknown } =>
  typeof value === "object" && value !== null

const isQueryKey = (entry: InvalidationEntry): entry is ReadonlyArray<string> => Array.isArray(entry)

const queryKeyFromFilters = (
  entry: Exclude<InvalidationEntry, ReadonlyArray<string>>
): ReadonlyArray<unknown> | undefined => {
  if (!("filters" in entry)) return undefined
  const filters = entry.filters
  if (!isRecord(filters)) return undefined
  const queryKey = filters["queryKey"]
  return Array.isArray(queryKey) ? queryKey : undefined
}

export interface MutationOptionsBase<A = unknown, B = A, E2 = never, R2 = never> {
  /**
   * By default we invalidate one level of the query key, e.g $project/$configuration.get, we invalidate $project.
   * This can be overridden by providing a function that returns an array of filters and options,
   * or RPC handlers directly (their query keys are derived automatically).
   *
   * @example
   * ```ts
   * queryInvalidation: (queryKey) => [
   *   { filters: { queryKey } },
   *   GetMe,
   *   PackListIndex
   * ]
   * ```
   */
  queryInvalidation?: (
    defaultKey: string[],
    name: string,
    input?: unknown,
    output?: Exit.Exit<unknown, unknown>
  ) => InvalidationEntry[]
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

const buildInvalidateCache = <RInvalidator>(
  self: { id: string; options?: ClientForOptions },
  queryInvalidation: MutationOptionsBase["queryInvalidation"] | undefined,
  queryInvalidator: QueryInvalidator<RInvalidator>
) => {
  // Concrete reactivity keys to invalidate: a raw query key, one derived from an `{ id }`
  // entry, or a compatibility `{ filters: { queryKey } }` entry.
  // Predicate-only `{ filters }` entries have no exact-key reactivity equivalent and throw.
  const getClientInvalidationKeys = (
    input: unknown,
    output: Exit.Exit<unknown, unknown>
  ): ReadonlyArray<ReadonlyArray<unknown>> => {
    const queryKey = getQueryKey(self)

    if (queryInvalidation) {
      const keys: Array<ReadonlyArray<unknown>> = []
      for (const entry of queryInvalidation(queryKey, self.id, input, output)) {
        if (isQueryKey(entry)) {
          keys.push(entry)
          continue
        }
        if ("id" in entry) {
          keys.push(makeQueryKey(entry.options ? { id: entry.id, options: entry.options } : { id: entry.id }))
          continue
        }
        const filterQueryKey = queryKeyFromFilters(entry)
        if (filterQueryKey !== undefined) {
          keys.push(filterQueryKey)
          continue
        }
        throw new Error("Unsupported query invalidation filter: only filters.queryKey is supported")
      }
      return keys
    }

    // No manual `invalidatesQueries`: contribute nothing. Invalidation rides entirely on the
    // repository-derived write-dependencies (plus any server-provided keys) — there is no default
    // namespace invalidation of the command's own resource.
    return []
  }

  const invalidateCache = (
    input: unknown,
    output: Exit.Exit<unknown, unknown>,
    serverKeys: ReadonlyArray<InvalidationKey>,
    writeDependencies: DataDependencies.DataDependencies = DataDependencies.empty()
  ) =>
    Effect.suspend(() => {
      const clientKeys = getClientInvalidationKeys(input, output)
      // Derive extra reactivity keys from repository write-dependencies: every live query whose
      // recorded read-dependencies intersect this mutation's writes must be refreshed.
      const derivedKeys = getDerivedInvalidationKeys(writeDependencies)
      // Invalidate exact reactivity keys (= the prefixes query atoms register under). Each key
      // array is hashed structurally, matching the query-side registration.
      const keys: ReadonlyArray<ReadonlyArray<unknown>> = [...clientKeys, ...serverKeys, ...derivedKeys]

      if (!isReadonlyArrayNonEmpty(keys)) return Effect.void

      return Effect
        .andThen(
          Effect.annotateCurrentSpan({ clientKeys, serverKeys, writeDependencies }),
          // refetch + AWAIT every live query registered under these keys, so by the time the
          // mutation resolves the affected queries are fresh.
          queryInvalidator.invalidateAndAwait(keys)
        )
        .pipe(
          Effect.tap(Effect.sleep(0.1)), // allow for refs to update etc
          Effect.withSpan("client.query.invalidation", {}, { captureStackTrace: false })
        )
    })

  return invalidateCache
}

export const invalidateQueries = <RInvalidator>(
  self: { id: string; options?: ClientForOptions },
  options: MutationOptionsBase | undefined,
  queryInvalidator: QueryInvalidator<RInvalidator>
) => {
  const invalidateCache = buildInvalidateCache(self, options?.queryInvalidation, queryInvalidator)

  const select = options?.select

  const handle = <A, E, R>(eff: Effect.Effect<A, E, R>, input?: unknown) =>
    Effect.gen(function*() {
      const keysRef = yield* Ref.make<ReadonlyArray<InvalidationKey>>([])
      const readsRef = yield* Ref.make(DataDependencies.empty())
      const writesRef = yield* Ref.make(DataDependencies.empty())
      const dependencyRecorder = DataDependencies.makeDataDependencyRecorder(readsRef, writesRef)
      const result = yield* eff.pipe(
        Effect.provideService(InvalidationKeysFromServer, makeInvalidationKeysService(keysRef)),
        Effect.provideService(DataDependencies.DataDependencyRecorder, dependencyRecorder),
        Effect.onExit((exit) =>
          Effect.gen(function*() {
            const serverKeys = yield* Ref.get(keysRef)
            const writeDependencies = yield* Ref.get(writesRef)
            yield* invalidateCache(input, exit, serverKeys, writeDependencies)
          })
        )
      )
      if (select) {
        return yield* select(result).pipe(
          Effect.onExit((exit) =>
            Effect.gen(function*() {
              const serverKeys = yield* Ref.get(keysRef)
              const writeDependencies = yield* Ref.get(writesRef)
              yield* invalidateCache(input, exit, serverKeys, writeDependencies)
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

export const makeMutation = <RInvalidator>(queryInvalidator: QueryInvalidator<RInvalidator>) => {
  /**
   * Pass a function that returns an Effect, e.g from a client action.
   * Executes query cache invalidation based on default rules or provided option.
   * When `I = void` the input argument may be omitted.
   */
  const useMutation = <I, E, A, R, Request extends Req, Id extends string>(
    self: RequestHandlerWithInput<I, A, E, R, Request, Id>
  ): MutationFn<I, A, E, R, Id> => {
    const r = (i: I, options?: MutationOptionsBase) =>
      invalidateQueries(self, options, queryInvalidator)(self.handler(i), i)
    return Object.assign(r, { id: self.id }) as any
  }
  return useMutation
}

export const useMakeMutation = <RInvalidator>(queryInvalidator: QueryInvalidator<RInvalidator>) => {
  /**
   * Pass a function that returns an Effect, e.g from a client action.
   * Executes query cache invalidation based on default rules or provided option.
   * When `I = void` the input argument may be omitted.
   */
  const useMutation = <I, E, A, R, Request extends Req, Id extends string>(
    self: RequestHandlerWithInput<I, A, E, R, Request, Id>
  ): MutationFn<I, A, E, R, Id> => {
    const r = (i: I, options?: MutationOptionsBase) =>
      invalidateQueries(self, options, queryInvalidator)(self.handler(i), i)
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
 */
export const makeStreamMutation2 = <RInvalidator>(queryInvalidator: QueryInvalidator<RInvalidator>) => {
  return (
    self: {
      id: string
      options?: ClientForOptions
      handler: (i: any) => Stream.Stream<any, any, any>
    },
    mergedInvalidation?: MutationOptionsBase["queryInvalidation"]
  ) => {
    const invCache = buildInvalidateCache(self, mergedInvalidation, queryInvalidator)

    const makeInvocationEffect = (input: unknown, source: Stream.Stream<any, any, any>) =>
      Effect.gen(function*() {
        const keysRef = yield* Ref.make<ReadonlyArray<InvalidationKey>>([])
        const invKeys = makeInvalidationKeysService(
          keysRef,
          // Stream invalidation is sequenced by the injected query invalidator; this callback
          // returns void to keep the server-side invalidation service effect-free.
          (key) => invCache(input, Exit.succeed(undefined), [key]) as Effect.Effect<void>
        )
        const readsRef = yield* Ref.make(DataDependencies.empty())
        const writesRef = yield* Ref.make(DataDependencies.empty())
        const dependencyRecorder = DataDependencies.makeDataDependencyRecorder(readsRef, writesRef)
        const lastRef = yield* Ref.make<any>(undefined)
        return source.pipe(
          Stream.provideService(InvalidationKeysFromServer, invKeys),
          Stream.provideService(DataDependencies.DataDependencyRecorder, dependencyRecorder),
          Stream.tap((v) => Ref.set(lastRef, v)),
          Stream.ensuring(
            Effect.gen(function*() {
              const lastValue = yield* Ref.get(lastRef)
              const serverKeys = yield* Ref.get(keysRef)
              const writeDependencies = yield* Ref.get(writesRef)
              yield* invCache(input, Exit.succeed(lastValue), serverKeys, writeDependencies)
            })
          )
        )
      })

    return (i: any) => Stream.unwrap(makeInvocationEffect(i, self.handler(i)))
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
import { matchQuery } from "@tanstack/query-core"
import { type InvalidateOptions, type InvalidateQueryFilters, type QueryClient, useQueryClient } from "@tanstack/vue-query"
import { type Cause, Effect, type Exit, Option } from "effect-app"
import { type InvalidationKey, InvalidationKeysFromServer, makeInvalidationKeysService, makeQueryKey, type Req } from "effect-app/client"
import type { ClientForOptions, RequestHandler, RequestHandlerWithInput } from "effect-app/client/clientFor"
import { tuple } from "effect-app/Function"
import * as Ref from "effect/Ref"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import { computed, type ComputedRef, shallowRef } from "vue"

export const getQueryKey = (h: { id: string; options?: ClientForOptions }) => {
  const key = makeQueryKey(h)
  const ns = key.filter((_) => _.startsWith("$"))
  // we invalidate the parent namespace e.g $project/$configuration.get, we invalidate $project
  // for $project/$configuration/$something.get, we invalidate $project/$configuration
  const k = ns.length ? ns.length > 1 ? ns.slice(0, ns.length - 1) : ns : undefined
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

export interface MutationOptionsBase {
  /**
   * By default we invalidate one level of the query key, e.g $project/$configuration.get, we invalidate $project.
   * This can be overridden by providing a function that returns an array of filters and options.
   */
  queryInvalidation?: (defaultKey: string[], name: string, input?: unknown, output?: Exit.Exit<unknown, unknown>) => {
    filters?: InvalidateQueryFilters | undefined
    options?: InvalidateOptions | undefined
  }[]
}

/** @deprecated prefer more basic @see MutationOptionsBase and separate useMutation from Command.fn */
export interface MutationOptions<A, E, R, A2 = A, E2 = E, R2 = R, I = void> extends MutationOptionsBase {
  /**
   * Map the handler; cache invalidation is already done in this handler.
   * This is useful for e.g navigating, as you know caches have already updated.
   *
   * @deprecated use `Command.fn` instead of `useMutation*` with `mapHandler` option.
   */
  mapHandler?: (handler: Effect.Effect<A, E, R>, input: I) => Effect.Effect<A2, E2, R2>
}

export const asResult: {
  <A, E, R>(
    handler: Effect.Effect<A, E, R>
  ): readonly [ComputedRef<AsyncResult.AsyncResult<A, E>>, Effect.Effect<Exit.Exit<A, E>, never, R>]
  <Args extends readonly any[], A, E, R>(
    handler: (...args: Args) => Effect.Effect<A, E, R>
  ): readonly [ComputedRef<AsyncResult.AsyncResult<A, E>>, (...args: Args) => Effect.Effect<Exit.Exit<A, E>, never, R>]
} = <Args extends readonly any[], A, E, R>(
  handler: Effect.Effect<A, E, R> | ((...args: Args) => Effect.Effect<A, E, R>)
) => {
  const state = shallowRef<AsyncResult.AsyncResult<A, E>>(AsyncResult.initial())

  const act = Effect.isEffect(handler)
    ? Effect
      .sync(() => {
        state.value = AsyncResult.initial(true)
      })
      .pipe(
        Effect.andThen(Effect.suspend(() =>
          handler.pipe(
            Effect.exit,
            Effect.tap((exit) => Effect.sync(() => (state.value = AsyncResult.fromExit(exit))))
          )
        ))
      )
    : (...args: Args) =>
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

export const invalidateQueries = (
  queryClient: QueryClient,
  self: { id: string; options?: ClientForOptions },
  options?: MutationOptionsBase["queryInvalidation"]
) => {
  type InvalidationTarget = {
    readonly filters: InvalidateQueryFilters | undefined
    readonly options: InvalidateOptions | undefined
  }

  const invalidateQueries = (
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

    if (options) {
      return options(queryKey, self.id, input, output).map((_) => ({
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
              invalidateQueries(
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

  const handle = <A, E, R>(eff: Effect.Effect<A, E, R>, input?: unknown) =>
    Effect.gen(function*() {
      const keysRef = yield* Ref.make<ReadonlyArray<InvalidationKey>>([])
      return yield* eff.pipe(
        Effect.provideService(InvalidationKeysFromServer, makeInvalidationKeysService(keysRef)),
        Effect.onExit((exit) =>
          Effect.gen(function*() {
            const serverKeys = yield* Ref.get(keysRef)
            yield* invalidateCache(input, exit, serverKeys)
          })
        )
      )
    })

  return handle
}

export const makeMutation = () => {
  const useMutation: {
    /**
     * Pass a function that returns an Effect, e.g from a client action
     * Executes query cache invalidation based on default rules or provided option.
     */
    <I, E, A, R, Request extends Req, Id extends string>(
      self: RequestHandlerWithInput<I, A, E, R, Request, Id>,
      options?: MutationOptionsBase
    ): ((i: I) => Effect.Effect<A, E, R>) & { readonly id: Id }
    /**
     * Pass an Effect, e.g from a client action
     * Executes query cache invalidation based on default rules or provided option.
     */
    <E, A, R, Request extends Req, Id extends string>(
      self: RequestHandler<A, E, R, Request, Id>,
      options?: MutationOptionsBase
    ): Effect.Effect<A, E, R> & { readonly id: Id }
  } = <I, E, A, R, Request extends Req, Id extends string>(
    self: RequestHandlerWithInput<I, A, E, R, Request, Id> | RequestHandler<A, E, R, Request, Id>,
    options?: MutationOptionsBase
  ) => {
    const queryClient = useQueryClient()
    const handle = invalidateQueries(queryClient, self, options?.queryInvalidation)
    const handler = self.handler
    const r = Effect.isEffect(handler) ? handle(handler) : (i: I) => handle(handler(i), i)

    return Object.assign(r, { id: self.id }) as any
  }
  return useMutation
}

// calling hooks in the body
export const useMakeMutation = () => {
  const queryClient = useQueryClient()

  const useMutation: {
    /**
     * Pass a function that returns an Effect, e.g from a client action
     * Executes query cache invalidation based on default rules or provided option.
     */
    <I, E, A, R, Request extends Req, Id extends string>(
      self: RequestHandlerWithInput<I, A, E, R, Request, Id>,
      options?: MutationOptionsBase
    ): ((i: I) => Effect.Effect<A, E, R>) & { readonly id: Id }
    /**
     * Pass an Effect, e.g from a client action
     * Executes query cache invalidation based on default rules or provided option.
     */
    <E, A, R, Request extends Req, Id extends string>(
      self: RequestHandler<A, E, R, Request, Id>,
      options?: MutationOptionsBase
    ): Effect.Effect<A, E, R> & { readonly id: Id }
  } = <I, E, A, R, Request extends Req, Id extends string>(
    self: RequestHandlerWithInput<I, A, E, R, Request, Id> | RequestHandler<A, E, R, Request, Id>,
    options?: MutationOptionsBase
  ) => {
    const handle = invalidateQueries(queryClient, self, options?.queryInvalidation)
    const handler = self.handler
    const r = Effect.isEffect(handler) ? handle(handler) : (i: I) => handle(handler(i), i)

    return Object.assign(r, { id: self.id }) as any
  }
  return useMutation
}

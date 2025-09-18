/* eslint-disable @typescript-eslint/no-explicit-any */
import * as Result from "@effect-atom/atom/Result"
import { type InvalidateOptions, type InvalidateQueryFilters, type QueryClient, useQueryClient } from "@tanstack/vue-query"
import { type Cause, Effect, type Exit, Option } from "effect-app"
import { type Req } from "effect-app/client"
import type { ClientForOptions, RequestHandler, RequestHandlerWithInput } from "effect-app/client/clientFor"
import { tuple } from "effect-app/Function"
import { computed, type ComputedRef, shallowRef } from "vue"
import { makeQueryKey } from "./lib.js"

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
  mutationResult: Result.Result<A, E>
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
  const result = shallowRef(Result.initial() as Result.Result<A, E>)

  const execute = Effect
    .sync(() => {
      result.value = Result.waiting(result.value)
    })
    .pipe(
      Effect.andThen(self),
      Effect.exit,
      Effect.andThen(Result.fromExit),
      Effect.flatMap((r) => Effect.sync(() => result.value = r))
    )

  const latestSuccess = computed(() => Option.getOrUndefined(Result.value(result.value)))

  return tuple(result, latestSuccess, execute)
}

export interface MutationOptionsBase {
  /**
   * By default we invalidate one level of the query key, e.g $project/$configuration.get, we invalidate $project.
   * This can be overridden by providing a function that returns an array of filters and options.
   */
  queryInvalidation?: (defaultKey: string[], name: string) => {
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

// TODO: more efficient invalidation, including args etc
// return Effect.promise(() => queryClient.invalidateQueries({
//   predicate: (_) => nses.includes(_.queryKey.filter((_) => _.startsWith("$")).join("/"))
// }))
/*
            // const nses: string[] = []`
                // for (let i = 0; i < ns.length; i++) {
                //   nses.push(ns.slice(0, i + 1).join("/"))
                // }
                */

export const asResult: {
  <A, E, R>(
    handler: Effect.Effect<A, E, R>
  ): readonly [ComputedRef<Result.Result<A, E>>, Effect.Effect<Exit.Exit<A, E>, never, R>]
  <Args extends readonly any[], A, E, R>(
    handler: (...args: Args) => Effect.Effect<A, E, R>
  ): readonly [ComputedRef<Result.Result<A, E>>, (...args: Args) => Effect.Effect<Exit.Exit<A, E>, never, R>]
} = <Args extends readonly any[], A, E, R>(
  handler: Effect.Effect<A, E, R> | ((...args: Args) => Effect.Effect<A, E, R>)
) => {
  const state = shallowRef<Result.Result<A, E>>(Result.initial())

  const act = Effect.isEffect(handler)
    ? Effect
      .sync(() => {
        state.value = Result.initial(true)
      })
      .pipe(
        Effect.zipRight(Effect.suspend(() =>
          handler.pipe(
            Effect.exit,
            Effect.tap((exit) => Effect.sync(() => (state.value = Result.fromExit(exit))))
          )
        ))
      )
    : (...args: Args) =>
      Effect
        .sync(() => {
          state.value = Result.initial(true)
        })
        .pipe(
          Effect.zipRight(Effect.suspend(() =>
            handler(...args).pipe(
              Effect.exit,
              Effect.tap((exit) => Effect.sync(() => (state.value = Result.fromExit(exit))))
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

  const invalidateCache = Effect.suspend(() => {
    const queryKey = getQueryKey(self)

    if (options) {
      const opts = options(queryKey, self.id)
      if (!opts.length) {
        return Effect.void
      }
      return Effect
        .andThen(
          Effect.annotateCurrentSpan({ queryKey, opts }),
          Effect.forEach(opts, (_) => invalidateQueries(_.filters, _.options), { concurrency: "inherit" })
        )
        .pipe(Effect.withSpan("client.query.invalidation", { captureStackTrace: false }))
    }

    if (!queryKey) return Effect.void

    return Effect
      .andThen(
        Effect.annotateCurrentSpan({ queryKey }),
        invalidateQueries({ queryKey })
      )
      .pipe(
        Effect.tap(
          // hand over control back to the event loop so that state can be updated..
          // TODO: should we do this in general on any mutation, regardless of invalidation?
          Effect.sleep(0)
        ),
        Effect.withSpan("client.query.invalidation", { captureStackTrace: false })
      )
  })

  const handle = <A, E, R>(self: Effect.Effect<A, E, R>) =>
    Effect.tapBoth(self, { onFailure: () => invalidateCache, onSuccess: () => invalidateCache })

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
    const r = Effect.isEffect(handler) ? handle(handler) : (i: I) => handle(handler(i))

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
    const r = Effect.isEffect(handler) ? handle(handler) : (i: I) => handle(handler(i))

    return Object.assign(r, { id: self.id }) as any
  }
  return useMutation
}

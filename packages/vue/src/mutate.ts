/* eslint-disable @typescript-eslint/no-explicit-any */
import * as Result from "@effect-rx/rx/Result"
import type { InvalidateOptions, InvalidateQueryFilters } from "@tanstack/vue-query"
import { useQueryClient } from "@tanstack/vue-query"
import type { Cause } from "effect-app"
import { Effect, Option } from "effect-app"
import type { RequestHandler, RequestHandlerWithInput, TaggedRequestClassAny } from "effect-app/client/clientFor"
import { tuple } from "effect-app/Function"
import type { ComputedRef, Ref } from "vue"
import { computed, shallowRef } from "vue"
import { makeQueryKey, reportRuntimeError } from "./lib.js"

export const getQueryKey = (h: { name: string }) => {
  const key = makeQueryKey(h)
  const ns = key.filter((_) => _.startsWith("$"))
  // we invalidate the parent namespace e.g $project/$configuration.get, we invalidate $project
  // for $project/$configuration/$something.get, we invalidate $project/$configuration
  const k = ns.length ? ns.length > 1 ? ns.slice(0, ns.length - 1) : ns : undefined
  if (!k) throw new Error("empty query key for: " + h.name)
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
  readonly error: Cause<E> | undefined
}

export type WatchSource<T = any> = Ref<T> | ComputedRef<T> | (() => T)
export function make<A, E, R>(self: Effect<A, E, R>) {
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


export interface MutationOptions<A, E, R, A2 = A, E2 = E, R2 = R, I = void> {
  /**
   * Map the handler; cache invalidation is already done in this handler.
   * This is useful for e.g navigating, as you know caches have already updated.
   */
  mapHandler?: (handler: Effect<A, E, R>, input: I) => Effect<A2, E2, R2>
  /**
   * By default we invalidate one level of the query key, e.g $project/$configuration.get, we invalidate $project.
   * This can be overridden by providing a function that returns an array of filters and options.
   */
  queryInvalidation?: (defaultKey: string[], name: string) => {
    filters?: InvalidateQueryFilters | undefined
    options?: InvalidateOptions | undefined
  }[]
}

// TODO: more efficient invalidation, including args etc
// return Effect.promise(() => queryClient.invalidateQueries({
//   predicate: (_) => nses.includes(_.queryKey.filter((_) => _.startsWith("$")).join("/"))
// }))
/*
            // const nses: string[] = []
                // for (let i = 0; i < ns.length; i++) {
                //   nses.push(ns.slice(0, i + 1).join("/"))
                // }
                */

export const asResult = <Args extends readonly any[], A, E, R>(
  handler: (...args: Args) => Effect<A, E, R>
) => {
  const state = shallowRef<Result.Result<A, E>>(Result.initial())

  const act = (...args: Args) =>
    Effect
      .sync(() => {
        state.value = Result.initial(true)
      })
      .pipe(
        Effect.zipRight(Effect.suspend(() => handler(...args))),
        Effect.onExit((exit) => Effect.sync(() => (state.value = Result.fromExit(exit))))
      )

  return tuple(state, act)
}

export const makeMutation = () => {
  /**
   * Pass a function that returns an Effect, e.g from a client action, or an Effect
   * Returns a tuple with state ref and execution function which reports errors as Toast.
   */
  const useSafeMutation: {
    <I, E, A, R, Request extends TaggedRequestClassAny, A2 = A, E2 = E, R2 = R>(
      self: RequestHandlerWithInput<I, A, E, R, Request>,
      options?: MutationOptions<A, E, R, A2, E2, R2, I>
    ): readonly [
      Readonly<Ref<Result.Result<A2, E2>>>,
      (i: I) => Effect<A2, E2, R2>
    ]
    <E, A, R, Request extends TaggedRequestClassAny, A2 = A, E2 = E, R2 = R>(
      self: RequestHandler<A, E, R, Request>,
      options?: MutationOptions<A, E, R, A2, E2, R2>
    ): readonly [
      Readonly<Ref<Result.Result<A2, E2>>>,
      Effect<A2, E2, R2>
    ]
  } = <I, E, A, R, Request extends TaggedRequestClassAny, A2 = A, E2 = E, R2 = R>(
    self: RequestHandlerWithInput<I, A, E, R, Request> | RequestHandler<A, E, R, Request>,
    options?: MutationOptions<A, E, R, A2, E2, R2, I>
  ) => {
    const queryClient = useQueryClient()

    const invalidateQueries = (
      filters?: InvalidateQueryFilters,
      options?: InvalidateOptions
    ) => Effect.promise(() => queryClient.invalidateQueries(filters, options))

    const invalidateCache = Effect.suspend(() => {
      const queryKey = getQueryKey(self)

      if (options?.queryInvalidation) {
        const opts = options.queryInvalidation(queryKey, self.name)
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
        .pipe(Effect.withSpan("client.query.invalidation", { captureStackTrace: false }))
    })

    const mapHandler = options?.mapHandler ?? ((_) => _)

    const [state, handle_] = asResult((self: Effect<A, E, R>, i: I | void = void 0) => (mapHandler(
      Effect.tapBoth(self, { onFailure: () => invalidateCache, onSuccess: () => invalidateCache }),
      i as I
    ) as Effect<A2, E2, R2>))

    const handle = (self: Effect<A, E, R>, name: string, i: I | void = void 0) =>
      handle_(self, i).pipe(
        Effect.tapDefect(reportRuntimeError),
        Effect.withSpan(`mutation ${name}`, { captureStackTrace: false })
      )

    const handler = self.handler
    const r = tuple(
      state,
      Effect.isEffect(handler) ? handle(handler, self.name) : (i: I) => handle(handler(i), self.name, i)
    )

    return r as any
  }
  return useSafeMutation
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface MakeMutation2 extends ReturnType<typeof makeMutation> {}

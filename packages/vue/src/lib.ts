import { isHttpClientError } from "@effect/platform/HttpClientError"
import { type Pausable, useIntervalFn, type UseIntervalFnOptions } from "@vueuse/core"
import { Cause, type Effect, LogLevel, pipe } from "effect-app"
import type { ClientForOptions, RequestHandler, RequestHandlerWithInput, TaggedRequestClassAny } from "effect-app/client/clientFor"
import type { MaybeRefOrGetter } from "vue"
import { reportError } from "./errorReporter.js"

export * as Result from "@effect-atom/atom/Result"

const reportRuntimeError_ = reportError("Runtime")

const filters = ["TypeError: failed to fetch", "AbortError"].map((_) => _.toLowerCase())

const determineLevel = (cause: Cause.Cause<unknown>) => {
  const sq = Cause.squash(cause)
  if (!isHttpClientError(sq)) {
    return undefined
  }
  const causeStr = sq.cause?.toString().toLowerCase()
  switch (sq._tag) {
    case "RequestError":
      return sq.reason === "Transport" ? LogLevel.Info : undefined
    case "ResponseError":
      return sq.reason === "Decode" && filters.some((_) => causeStr?.includes(_)) ? LogLevel.Info : undefined
  }
}

export const reportRuntimeError = (cause: Cause.Cause<unknown>, extras?: Record<string, unknown>) =>
  reportRuntimeError_(cause, extras, determineLevel(cause))

// $Project/$Configuration.Index
// -> "$Project", "$Configuration", "Index"
export const makeQueryKey = ({ id, options }: { id: string; options?: ClientForOptions }) =>
  pipe(
    id.split("/"),
    (split) => split.filter((_) => !options || !options?.skipQueryKey?.includes(_)).map((_) => "$" + _)
  )
    .join(".")
    .split(".")

export function pauseWhileProcessing(
  iv: Pausable,
  pmf: () => Promise<unknown>
) {
  return Promise
    .resolve(iv.pause())
    .then(() => pmf())
    .finally(() => iv.resume())
}

export function useIntervalPauseWhileProcessing(
  pmf: () => Promise<unknown>,
  interval?: MaybeRefOrGetter<number>,
  options?: Omit<UseIntervalFnOptions, "immediateCallback">
) {
  const iv = useIntervalFn(
    () => pauseWhileProcessing(iv, pmf),
    interval,
    options ? { ...options, immediateCallback: false } : options
  )
  return {
    isActive: iv.isActive
  }
}

/**
 * Maps the handler before more processing is done like refresh caches.
 * use the `mapHandler` in options instead, as it will be executed *after* invalidating caches, instead of before.
 */
export const mapHandler: {
  <I, E, R, A, E2, A2, R2, Request extends TaggedRequestClassAny, Name extends string>(
    self: RequestHandlerWithInput<I, A, E, R, Request, Name>,
    map: (handler: (i: I) => Effect.Effect<A, E, R>) => (i: I) => Effect.Effect<A2, E2, R2>
  ): RequestHandlerWithInput<I, A2, E2, R2, Request, Name>
  <E, A, R, E2, A2, R2, Request extends TaggedRequestClassAny, Name extends string>(
    self: RequestHandler<A, E, R, Request, Name>,
    map: (handler: Effect.Effect<A, E, R>) => Effect.Effect<A2, E2, R2>
  ): RequestHandler<A2, E2, R2, Request, Name>
} = (self: any, map: any): any => ({
  ...self,
  handler: typeof self.handler === "function"
    ? (i: any) => map(self.handler as (i: any) => Effect.Effect<any, any, any>)(i)
    : map(self.handler)
})

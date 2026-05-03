import { type Pausable, useIntervalFn, type UseIntervalFnOptions } from "@vueuse/core"
import { Cause, type Effect } from "effect-app"
import type { Req } from "effect-app/client"
import type { RequestHandler, RequestHandlerWithInput } from "effect-app/client/clientFor"
import { isHttpClientError } from "effect/unstable/http/HttpClientError"
import { isProxy, isReactive, isRef, type MaybeRefOrGetter, toRaw } from "vue"
import { reportError } from "./errorReporter.js"

export * as AsyncResult from "effect/unstable/reactivity/AsyncResult"

const reportRuntimeError_ = reportError("Runtime")

const filters = ["TypeError: failed to fetch", "AbortError"].map((_) => _.toLowerCase())

const determineLevel = (cause: Cause.Cause<unknown>) => {
  const sq = Cause.squash(cause)
  if (!isHttpClientError(sq)) {
    return undefined
  }
  const causeStr = sq.reason.message?.toLowerCase()
  switch (sq.reason._tag) {
    case "TransportError":
      return "Info" as const
    case "DecodeError":
      return filters.some((_) => causeStr?.includes(_)) ? "Info" as const : undefined
    default:
      return undefined
  }
}

export const reportRuntimeError = (cause: Cause.Cause<unknown>, extras?: Record<string, unknown>) =>
  reportRuntimeError_(cause, extras, determineLevel(cause))

export { makeQueryKey } from "effect-app/client"

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
  <I, E, R, A, E2, A2, R2, Request extends Req, Name extends string>(
    self: RequestHandlerWithInput<I, A, E, R, Request, Name>,
    map: (handler: (i: I) => Effect.Effect<A, E, R>) => (i: I) => Effect.Effect<A2, E2, R2>
  ): RequestHandlerWithInput<I, A2, E2, R2, Request, Name>
  <E, A, R, E2, A2, R2, Request extends Req, Name extends string>(
    self: RequestHandler<A, E, R, Request, Name>,
    map: (handler: Effect.Effect<A, E, R>) => Effect.Effect<A2, E2, R2>
  ): RequestHandler<A2, E2, R2, Request, Name>
} = (self: any, map: any): any => ({
  ...self,
  handler: typeof self.handler === "function"
    ? (i: any) => map(self.handler as (i: any) => Effect.Effect<any, any, any>)(i)
    : map(self.handler)
})

export function deepToRaw<T>(sourceObj: T): T {
  const objectIterator = (input: any): any => {
    if (isRef(input)) {
      return objectIterator(input.value)
    }

    const rawInput = isReactive(input) || isProxy(input)
      ? toRaw(input)
      : input

    if (Array.isArray(rawInput)) {
      return rawInput.map((item) => objectIterator(item))
    }

    if (rawInput instanceof Map) {
      return new Map(
        Array.from(rawInput.entries(), ([key, value]) => [objectIterator(key), objectIterator(value)])
      )
    }

    if (rawInput instanceof Set) {
      return new Set(Array.from(rawInput.values(), (value) => objectIterator(value)))
    }

    if (rawInput instanceof Date) {
      return new Date(rawInput)
    }

    if (rawInput && typeof rawInput === "object") {
      return Object.keys(rawInput).reduce((acc, key) => {
        acc[key] = objectIterator(rawInput[key])
        return acc
      }, {} as Record<string, unknown>)
    }

    return rawInput
  }

  return objectIterator(sourceObj)
}

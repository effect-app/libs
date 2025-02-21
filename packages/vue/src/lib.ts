import { isHttpClientError } from "@effect/platform/HttpClientError"
import { type Pausable, useIntervalFn, type UseIntervalFnOptions } from "@vueuse/core"
import type { Runtime } from "effect-app"
import { Cause, Effect, pipe } from "effect-app"
import type { RequestHandler, RequestHandlerWithInput, TaggedRequestClassAny } from "effect-app/client/clientFor"
import type { MaybeRefOrGetter, ShallowRef } from "vue"
import { reportError, reportMessage } from "./errorReporter.js"

export * as Result from "@effect-rx/rx/Result"

const reportRuntimeError_ = reportError("Runtime")
export const reportRuntimeError = (cause: Cause<unknown>, extras?: Record<string, unknown>) =>
  Effect.gen(function*() {
    const sq = Cause.squash(cause)
    if (!isHttpClientError(sq)) {
      if (
        String(sq).includes(
          "@effect/rpc: handler must return an array of responses with the same length as the requests."
        )
      ) {
        yield* Effect.logWarning("RPC response error", cause)
        return
      }
      return yield* reportRuntimeError_(cause, extras)
    }
    if (sq._tag === "RequestError") {
      if (sq.reason === "Transport") {
        yield* reportMessage("Transport error", { cause })
        return
      }
    } else if (sq._tag === "ResponseError") {
      if (sq.reason === "Decode") {
        // we get this incase of Magento Proxy error :/
        // TODO: we should only skip this on Configurator/Magento...
        yield* reportMessage("Decode error", { cause })
        return
      }
    }
    return yield* reportRuntimeError_(cause, extras)
  })

// $Project/$Configuration.Index
// -> "$Project", "$Configuration", "Index"
export const makeQueryKey = ({ name }: { name: string }) =>
  pipe(name.split("/"), (split) => split.map((_) => "$" + _))
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

export const getRuntime = <R>(runtime: ShallowRef<Runtime.Runtime<R> | undefined>) => {
  if (!runtime.value) throw new Error("Effect runtime not set")
  return runtime.value
}

/**
 * Maps the handler before more processing is done like refresh caches.
 * use the `mapHandler` in options instead, as it will be executed *after* invalidating caches, instead of before.
 */
export const mapHandler: {
  <I, E, R, A, E2, A2, R2, Request extends TaggedRequestClassAny>(
    self: RequestHandlerWithInput<I, A, E, R, Request>,
    map: (handler: (i: I) => Effect<A, E, R>) => (i: I) => Effect<A2, E2, R2>
  ): RequestHandlerWithInput<I, A2, E2, R2, Request>
  <E, A, R, E2, A2, R2, Request extends TaggedRequestClassAny>(
    self: RequestHandler<A, E, R, Request>,
    map: (handler: Effect<A, E, R>) => Effect<A2, E2, R2>
  ): RequestHandler<A2, E2, R2, Request>
} = (self: any, map: any): any => ({
  ...self,
  handler: typeof self.handler === "function"
    ? (i: any) => map(self.handler as (i: any) => Effect<any, any, any>)(i)
    : map(self.handler)
})

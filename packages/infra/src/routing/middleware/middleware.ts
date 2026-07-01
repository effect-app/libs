/* eslint-disable @typescript-eslint/no-explicit-any */
import { ConfigureInterruptibilityMiddleware, DevMode, DevModeMiddleware, LoggerMiddleware, RequestCacheMiddleware } from "effect-app/middleware"
import { RpcContextMap, type RpcMiddleware } from "effect-app/rpc"
import { pretty } from "effect-app/utils"
import * as Array from "effect/Array"
import * as Cause from "effect/Cause"
import * as Config from "effect/Config"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import { type Rpc } from "effect/unstable/rpc"
import { logError, reportError } from "../../errorReporter.ts"
import { InfraLogger } from "../../logger.ts"
import { WithNsTransaction } from "../../Store/SQL.ts"

const logRequestError = logError("Request")
const reportRequestError = reportError("Request")

// Summarize an rpc payload for the `rpc.request.payload` span attribute.
// Scalars are kept (long strings snipped), nested objects are recursed into up
// to `PAYLOAD_MAX_DEPTH` so useful inputs (carrier, packageType, dimensions, ids,
// …) are captured. Arrays are sampled to the first `PAYLOAD_ARRAY_HEAD` elements
// (with a `…N more` marker when longer) so pack/pick item arrays — one entry per
// article, quantity folded into `amount` — are diagnosable without dumping the
// whole tail on every (high-frequency) SaveItems.
const PAYLOAD_MAX_DEPTH = 4
const PAYLOAD_ARRAY_HEAD = 20
const REDACTED_KEYS = new Set(["password", "secret", "token"])

const summarizePayloadValue = (key: string, value: unknown, depth: number): unknown => {
  if (REDACTED_KEYS.has(key)) return "<redacted>"
  if (typeof value === "string") return value.length > 256 ? value.substring(0, 253) + "..." : value
  if (typeof value === "number" || typeof value === "boolean") return value
  if (value === null || value === undefined) return `${value}`
  if (Array.isArray(value)) {
    if (depth >= PAYLOAD_MAX_DEPTH) return `Array[${value.length}]`
    const head = value.slice(0, PAYLOAD_ARRAY_HEAD).map((v) => summarizePayloadValue(key, v, depth + 1))
    return value.length > PAYLOAD_ARRAY_HEAD ? [...head, `…${value.length - PAYLOAD_ARRAY_HEAD} more`] : head
  }
  if (typeof value === "object") {
    return depth >= PAYLOAD_MAX_DEPTH
      ? `Object[${Object.keys(value).length}]`
      : Object.entries(value).reduce((prev, [k, v]) => {
        prev[k] = summarizePayloadValue(k, v, depth + 1)
        return prev
      }, {} as Record<string, unknown>)
  }
  return typeof value
}

const summarizePayload = (payload: unknown): unknown =>
  typeof payload === "object" && payload !== null
    ? Object.entries(payload).reduce((prev, [key, value]) => {
      prev[key] = summarizePayloadValue(key, value, 1)
      return prev
    }, {} as Record<string, unknown>)
    : payload

// TODO: do we need this as middleware or just as layer?
export const DevModeLive = Layer.effect(
  DevMode,
  Effect.gen(function*() {
    const env = yield* Config.string("env").pipe(Config.withDefault("local-dev"))
    return env !== "prod"
  })
)

export const RequestCacheMiddlewareLive = Layer.succeed(
  RequestCacheMiddleware,
  (effect) => effect
)

const isOptimisticConcurrencyException = (input: unknown) =>
  typeof input === "object" && input !== null && "_tag" in input && input._tag === "OptimisticConcurrencyException"

export const RequestType = Context.Reference<"command" | "query">(
  "@effect-app/infra/routing/RequestType",
  { defaultValue: () => "query" }
)

export const ConfigureInterruptibilityMiddlewareLive = Layer.effect(
  ConfigureInterruptibilityMiddleware,
  Effect.gen(function*() {
    return (effect, { rpc }) => {
      const requestType = Context.get(rpc.annotations, RequestType)
      const isCommand = requestType === "command"

      effect = isCommand
        ? Effect.retry(effect, { times: 1, while: isOptimisticConcurrencyException })
        : Effect.interruptible(effect)

      return effect
    }
  })
)

export const LoggerMiddlewareLive = Layer
  .effect(
    LoggerMiddleware,
    Effect.gen(function*() {
      const devMode = yield* DevMode
      return (effect, { headers, payload, rpc }) =>
        Effect
          .annotateCurrentSpan({
            "rpc.method": rpc._tag,
            "rpc.request.payload": summarizePayload(payload)
          })
          .pipe(
            Effect.andThen(effect),
            // TODO: support SchemaError if the error channel of the request allows it.. but who would want that?
            Effect.catch((_) => Schema.isSchemaError(_) ? Effect.die(_) : Effect.fail(_)),
            Effect.tapCause((cause) => Cause.hasFails(cause) ? logRequestError(cause) : Effect.void),
            Effect.tapCauseIf(Cause.hasDies, (cause) =>
              Effect
                .all([
                  reportRequestError(cause, {
                    action: rpc._tag
                  }),
                  InfraLogger
                    .logError("Finished request", cause)
                    .pipe(Effect.annotateLogs({
                      action: rpc._tag,
                      req: pretty(payload),
                      headers: pretty(headers)
                      // resHeaders: pretty(
                      //   Object
                      //     .entries(headers)
                      //     .reduce((prev, [key, value]) => {
                      //       prev[key] = value && typeof value === "string" ? snipString(value) : value
                      //       return prev
                      //     }, {} as Record<string, any>)
                      // )
                    }))
                ])),
            devMode ? (_) => _ : Effect.catchDefect(() => Effect.die("Internal Server Error"))
          )
    })
  )
  .pipe(Layer.provide(DevModeLive))

export const DevModeMiddlewareLive = Layer
  .effect(
    DevModeMiddleware,
    Effect.gen(function*() {
      const devMode = yield* DevMode
      return (effect) => Effect.provideService(effect, DevMode, devMode)
    })
  )
  .pipe(Layer.provide(DevModeLive))

export const DefaultGenericMiddlewaresLive = Layer.mergeAll(
  RequestCacheMiddlewareLive,
  ConfigureInterruptibilityMiddlewareLive,
  LoggerMiddlewareLive,
  DevModeMiddlewareLive
)

/**
 * Config entry for `RequestContextMap` that controls per-RPC transaction wrapping.
 * Defaults to `false` (no transaction). Set `requiresTransaction: true` on a route to enable.
 *
 * @example
 * ```ts
 * class RequestContextMap extends RpcContextMap.makeMap({
 *   requiresTransaction: requiresTransactionConfig,
 *   // ...
 * }) {}
 * ```
 */
export const requiresTransactionConfig = RpcContextMap.makeCustom()(Schema.Never, false)

/**
 * Creates the middleware Effect for SQL transaction wrapping.
 * Requires `WithNsTransaction` service.
 * Reads `requiresTransaction` from the RPC config; defaults to `false`.
 *
 * @example
 * ```ts
 * const SqlTransactionMiddlewareLive = Layer.effect(
 *   SqlTransactionMiddleware,
 *   makeSqlTransactionMiddleware(RequestContextMap)
 * )
 * ```
 */
export const makeSqlTransactionMiddleware = Effect.fnUntraced(function*(
  rcm: { getConfig: (rpc: Rpc.AnyWithProps) => { readonly requiresTransaction?: boolean } }
) {
  const withTx = yield* WithNsTransaction
  const mw: RpcMiddleware.RpcMiddlewareV4<never, never, never> = (effect, { rpc }) => {
    const { requiresTransaction } = rcm.getConfig(rpc)
    if (requiresTransaction !== true) return effect
    return withTx(effect)
  }
  return mw
})

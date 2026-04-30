/* eslint-disable @typescript-eslint/no-explicit-any */
import { Cause, Config, Effect, Layer, Option, Ref, Schema } from "effect"
import * as Array from "effect/Array"
import {
  ConfigureInterruptibilityMiddleware,
  DevMode,
  DevModeMiddleware,
  InvalidationMiddleware,
  LoggerMiddleware,
  RequestCacheMiddleware
} from "effect-app/middleware"
import { Invalidation, RpcContextMap, type RpcMiddleware } from "effect-app/rpc"
import { pretty } from "effect-app/utils"
import * as Context from "effect/Context"
import { appendPreResponseHandlerUnsafe } from "effect/unstable/http/HttpEffect"
import { HttpServerRequest } from "effect/unstable/http/HttpServerRequest"
import * as HttpServerResponse from "effect/unstable/http/HttpServerResponse"
import { type Rpc } from "effect/unstable/rpc"
import { logError, reportError } from "../../../errorReporter.js"
import { InfraLogger } from "../../../logger.js"
import { WithNsTransaction } from "../../../Store/SQL.js"

const logRequestError = logError("Request")
const reportRequestError = reportError("Request")

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
  "@effect-app/infra/api/routing/RequestType",
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
            "request.name": rpc._tag,
            "requestInput": typeof payload === "object" && payload !== null
              ? Object.entries(payload).reduce((prev, [key, value]: [string, unknown]) => {
                prev[key] = key === "password"
                  ? "<redacted>"
                  : typeof value === "string" || typeof value === "number" || typeof value === "boolean"
                  ? typeof value === "string" && value.length > 256
                    ? (value.substring(0, 253) + "...")
                    : value
                  : Array.isArray(value)
                  ? `Array[${value.length}]`
                  : value === null || value === undefined
                  ? `${value}`
                  : typeof value === "object" && value
                  ? `Object[${Object.keys(value).length}]`
                  : typeof value
                return prev
              }, {} as Record<string, string | number | boolean>)
              : payload
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

/**
 * RPC middleware that:
 * 1. Reads the `Invalidates` annotation and pre-populates `InvalidationSet` with static keys.
 * 2. Creates a request-scoped `InvalidationSet` backed by a `Ref` and provides it to the handler.
 * 3. After the handler resolves, collects accumulated keys and registers an HTTP pre-response
 *    handler (via `appendPreResponseHandlerUnsafe`) that writes them to the `x-invalidate`
 *    response header. This encoding only happens when the server is running over HTTP.
 */
export const InvalidationMiddlewareLive = Layer.succeed(
  InvalidationMiddleware,
  (effect, { rpc }) =>
    Effect.gen(function*() {
      const staticKeys = Context.get(rpc.annotations, Invalidation.Invalidates)
      const keysRef = yield* Ref.make<ReadonlyArray<Invalidation.InvalidationKey>>(staticKeys)
      const service = Invalidation.makeInvalidationSet(keysRef)

      const result = yield* Effect.provideService(effect, Invalidation.InvalidationSet, service)

      const keys = yield* Ref.get(keysRef)
      if (Array.isArrayNonEmpty(keys)) {
        const maybeRequest = yield* Effect.serviceOption(HttpServerRequest)
        if (Option.isSome(maybeRequest)) {
          appendPreResponseHandlerUnsafe(maybeRequest.value, (_req, res) => {
            try {
              return Effect.succeed(HttpServerResponse.setHeader(res, "x-invalidate", JSON.stringify(keys)))
            } catch {
              return Effect.succeed(res)
            }
          })
        }
      }

      return result
    })
)

export const DefaultGenericMiddlewaresLive = Layer.mergeAll(
  RequestCacheMiddlewareLive,
  ConfigureInterruptibilityMiddlewareLive,
  LoggerMiddlewareLive,
  DevModeMiddlewareLive,
  InvalidationMiddlewareLive
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

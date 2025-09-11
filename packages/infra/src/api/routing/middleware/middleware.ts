/* eslint-disable @typescript-eslint/no-explicit-any */
import { Cause, Config, Duration, Effect, Layer, ParseResult, Request, Schedule, type Schema } from "effect"
import { ConfigureInterruptibilityMiddleware, DevMode, DevModeMiddleware, LoggerMiddleware, RequestCacheMiddleware } from "effect-app/middleware"
import { pretty } from "effect-app/utils"
import { logError, reportError } from "../../../errorReporter.js"
import { InfraLogger } from "../../../logger.js"
import { determineMethod, isCommand } from "../utils.js"

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

export const RequestCacheLayers = Layer.mergeAll(
  Layer.setRequestCache(
    Request.makeCache({ capacity: 500, timeToLive: Duration.hours(8) })
  ),
  Layer.setRequestCaching(true),
  Layer.setRequestBatching(true)
)

export const RequestCacheMiddlewareLive = Layer.succeed(
  RequestCacheMiddleware,
  (effect) => effect.pipe(Effect.provide(RequestCacheLayers))
)

// retry just once on optimistic concurrency exceptions
const optimisticConcurrencySchedule = Schedule.once.pipe(
  Schedule.intersect(Schedule.recurWhile<any>((a) => a?._tag === "OptimisticConcurrencyException"))
)

export const ConfigureInterruptibilityMiddlewareLive = Layer.effect(
  ConfigureInterruptibilityMiddleware,
  Effect.gen(function*() {
    const cache = new Map()
    const getCached = (key: string, schema: Schema.Schema.Any) => {
      const existing = cache.get(key)
      if (existing) return existing
      const n = determineMethod(key, schema)
      cache.set(key, n)
      return n
    }
    return (effect, { rpc }) => {
      const method = getCached(rpc._tag, rpc.payloadSchema)

      effect = isCommand(method)
        ? Effect.retry(Effect.uninterruptible(effect), optimisticConcurrencySchedule)
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
            // can't use andThen due to some being a function and effect
            Effect.zipRight(effect),
            // TODO: support ParseResult if the error channel of the request allows it.. but who would want that?
            Effect.catchAll((_) => ParseResult.isParseError(_) ? Effect.die(_) : Effect.fail(_)),
            Effect.tapErrorCause((cause) => Cause.isFailure(cause) ? logRequestError(cause) : Effect.void),
            Effect.tapDefect((cause) =>
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
                ])
            ),
            devMode ? (_) => _ : Effect.catchAllDefect(() => Effect.die("Internal Server Error"))
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

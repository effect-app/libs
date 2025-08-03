/* eslint-disable @typescript-eslint/no-explicit-any */
import { Cause, Context, Duration, Effect, Layer, ParseResult, Request } from "effect-app"
import { pretty } from "effect-app/utils"
import { logError, reportError } from "../../../errorReporter.js"
import { InfraLogger } from "../../../logger.js"
import { Tag } from "../middleware.js"

const logRequestError = logError("Request")
const reportRequestError = reportError("Request")

export const RequestCacheLayers = Layer.mergeAll(
  Layer.setRequestCache(
    Request.makeCache({ capacity: 500, timeToLive: Duration.hours(8) })
  ),
  Layer.setRequestCaching(true),
  Layer.setRequestBatching(true)
)

export class DevMode extends Context.Reference<DevMode>()("DevMode", { defaultValue: () => false }) {}

export class RequestCacheMiddleware extends Tag<RequestCacheMiddleware>()("RequestCacheMiddleware", { wrap: true })({
  effect: Effect.succeed(({ next }) => next.pipe(Effect.provide(RequestCacheLayers)))
}) {
}

export class ConfigureInterruptibility
  extends Tag<ConfigureInterruptibility>()("ConfigureInterruptibility", { wrap: true })({
    effect: Effect.succeed(({ next }) =>
      next.pipe(
        // TODO: make this depend on query/command, and consider if middleware also should be affected. right now it's not.
        Effect.uninterruptible
      )
    )
  })
{
}

export class MiddlewareLogger extends Tag<MiddlewareLogger>()("MiddlewareLogger", { wrap: true })({
  effect: Effect.gen(function*() {
    const devMode = yield* DevMode
    return ({ headers, next, payload, rpc }) =>
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
          Effect.zipRight(next),
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
}) {
}

export const DefaultGenericMiddlewares = [
  RequestCacheMiddleware,
  ConfigureInterruptibility,
  MiddlewareLogger
] as const

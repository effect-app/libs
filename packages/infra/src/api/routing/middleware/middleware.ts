/* eslint-disable @typescript-eslint/no-explicit-any */
import { Cause, Context, Effect, ParseResult } from "effect-app"
import { HttpHeaders, HttpServerRequest } from "effect-app/http"
import { pretty } from "effect-app/utils"
import { logError, reportError } from "../../../errorReporter.js"
import { InfraLogger } from "../../../logger.js"
import { genericMiddleware, RequestCacheLayers } from "../../routing.js"

const logRequestError = logError("Request")
const reportRequestError = reportError("Request")

export class DevMode extends Context.Reference<DevMode>()("DevMode", { defaultValue: () => false }) {}

// Effect Rpc Middleware: Wrap
export class RequestCacheMiddleware extends Effect.Service<RequestCacheMiddleware>()("RequestCacheMiddleware", {
  effect: Effect.gen(function*() {
    return genericMiddleware(Effect.fnUntraced(function*(options) {
      return yield* options.next(options.payload, options.headers).pipe(Effect.provide(RequestCacheLayers))
    }))
  })
}) {}

// Effect Rpc Middleware: Wrap
export class ConfigureInterruptibility extends Effect.Service<ConfigureInterruptibility>()(
  "ConfigureInterruptibility",
  {
    effect: Effect.gen(function*() {
      return genericMiddleware(Effect.fnUntraced(function*(options) {
        return yield* options.next(options.payload, options.headers).pipe(
          // TODO: make this depend on query/command, and consider if middleware also should be affected. right now it's not.
          Effect.uninterruptible
        )
      }))
    })
  }
) {}

// No substitute; maybe move back to routing.ts, or customise Http Protocol Layer
export class CaptureHttpHeadersAsRpcHeaders
  extends Effect.Service<CaptureHttpHeadersAsRpcHeaders>()("CaptureHttpHeadersAsRpcHeaders", {
    effect: Effect.gen(function*() {
      return genericMiddleware(Effect.fnUntraced(function*(options) {
        // merge in the request headers
        // we should consider if we should merge them into rpc headers on the Protocol layer instead.
        const httpReq = yield* HttpServerRequest.HttpServerRequest
        const headers = HttpHeaders.merge(httpReq.headers, options.headers)
        return yield* options.next(options.payload, headers)
      }))
    })
  })
{}

// Effect Rpc Middleware: Wrap. But, we don't have access to `moduleName`
// we could consider adding it on the Rpc Request class somehow, which gets passed in.
// alternatively we could put it in Context or use a Reference like DevMode..
export class MiddlewareLogger extends Effect.Service<MiddlewareLogger>()("MiddlewareLogger", {
  effect: Effect.gen(function*() {
    return genericMiddleware(Effect.fnUntraced(function*({ headers, moduleName, next, payload }) {
      const devMode = yield* DevMode

      return yield* Effect
        .annotateCurrentSpan(
          "requestInput",
          typeof payload === "object" && payload !== null
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
        )
        .pipe(
          // can't use andThen due to some being a function and effect
          Effect.zipRight(next(payload, headers)),
          // TODO: support ParseResult if the error channel of the request allows it.. but who would want that?
          Effect.catchAll((_) => ParseResult.isParseError(_) ? Effect.die(_) : Effect.fail(_)),
          Effect.tapErrorCause((cause) => Cause.isFailure(cause) ? logRequestError(cause) : Effect.void),
          Effect.tapDefect((cause) =>
            Effect
              .all([
                reportRequestError(cause, {
                  action: `${moduleName}.${(payload as any)._tag}`
                }),
                InfraLogger
                  .logError("Finished request", cause)
                  .pipe(Effect.annotateLogs({
                    action: `${moduleName}.${(payload as any)._tag}`,
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
    }))
  })
}) {}

export const DefaultGenericMiddlewares = [
  RequestCacheMiddleware,
  ConfigureInterruptibility,
  CaptureHttpHeadersAsRpcHeaders,
  MiddlewareLogger
] as const

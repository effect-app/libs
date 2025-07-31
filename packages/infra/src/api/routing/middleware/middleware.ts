import { Cause, Context, Effect, ParseResult } from "effect-app"
import { HttpHeaders, type HttpRouter, HttpServerRequest } from "effect-app/http"
import { pretty } from "effect-app/utils"
import { logError, reportError } from "../../../errorReporter.js"
import { InfraLogger } from "../../../logger.js"

const logRequestError = logError("Request")
const reportRequestError = reportError("Request")

export class DevMode extends Context.Reference<DevMode>()("DevMode", { defaultValue: () => false }) {}

export class CaptureHttpHeadersAsRpcHeaders
  extends Effect.Service<CaptureHttpHeadersAsRpcHeaders>()("CaptureHttpHeadersAsRpcHeaders", {
    effect: Effect.gen(function*() {
      return <A, E>(
        handle: (input: any, headers: HttpHeaders.Headers) => Effect.Effect<A, E, HttpRouter.HttpRouter.Provided>,
        _moduleName: string
      ) =>
        Effect.fnUntraced(function*(input: any, rpcHeaders: HttpHeaders.Headers) {
          // merge in the request headers
          // we should consider if we should merge them into rpc headers on the Protocol layer instead.
          const httpReq = yield* HttpServerRequest.HttpServerRequest
          const headers = HttpHeaders.merge(httpReq.headers, rpcHeaders)
          return yield* handle(input, headers)
        })
    })
  })
{}

export class MiddlewareLogger extends Effect.Service<MiddlewareLogger>()("MiddlewareLogger", {
  effect: Effect.gen(function*() {
    return <A, E>(
      handle: (input: any, headers: HttpHeaders.Headers) => Effect.Effect<A, E, HttpRouter.HttpRouter.Provided>,
      moduleName: string
    ) =>
      Effect.fnUntraced(function*(input: any, rpcHeaders: HttpHeaders.Headers) {
        const devMode = yield* DevMode
        // merge in the request headers
        // we should consider if we should merge them into rpc headers on the Protocol layer instead.
        const httpReq = yield* HttpServerRequest.HttpServerRequest
        const headers = HttpHeaders.merge(httpReq.headers, rpcHeaders)

        return yield* Effect
          .annotateCurrentSpan(
            "requestInput",
            Object.entries(input).reduce((prev, [key, value]: [string, unknown]) => {
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
          )
          .pipe(
            // can't use andThen due to some being a function and effect
            Effect.zipRight(handle(input, headers)),
            // TODO: support ParseResult if the error channel of the request allows it.. but who would want that?
            Effect.catchAll((_) => ParseResult.isParseError(_) ? Effect.die(_) : Effect.fail(_)),
            Effect.tapErrorCause((cause) => Cause.isFailure(cause) ? logRequestError(cause) : Effect.void),
            Effect.tapDefect((cause) =>
              Effect
                .all([
                  reportRequestError(cause, {
                    action: `${moduleName}.${input._tag}`
                  }),
                  InfraLogger
                    .logError("Finished request", cause)
                    .pipe(Effect.annotateLogs({
                      action: `${moduleName}.${input._tag}`,
                      req: pretty(input),
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
  })
}) {}

export const DefaultGenericMiddlewares = [CaptureHttpHeadersAsRpcHeaders, MiddlewareLogger] as const

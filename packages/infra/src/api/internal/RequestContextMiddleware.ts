import { Effect } from "effect-app"
import { HttpMiddleware, HttpServerRequest, HttpServerResponse } from "effect-app/http"
import { NonEmptyString255 } from "effect-app/Schema"
import { Locale, RequestContext } from "../../RequestContext.js"
import { setupRequestContext } from "../setupRequest.js"

export const RequestContextMiddleware = (defaultLocale: Locale = "en") =>
  HttpMiddleware.make((app) =>
    Effect.gen(function*() {
      const req = yield* HttpServerRequest.HttpServerRequest

      const currentSpan = yield* Effect.currentSpan.pipe(Effect.orDie)
      const supported = Locale.literals
      const desiredLocale = req.headers["x-locale"]
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-explicit-any
      const locale = desiredLocale && supported.includes(desiredLocale as any)
        ? (desiredLocale as typeof supported[number])
        : defaultLocale

      const ns = req.headers["x-store-id"]
      const namespace = NonEmptyString255((ns && (Array.isArray(ns) ? ns[0] : ns)) || "primary")
      const deviceId = req.headers["x-fe-device-id"]

      const requestContext = RequestContext.make({
        span: {
          traceId: currentSpan.traceId,
          spanId: currentSpan.spanId,
          sampled: currentSpan.sampled
        },
        name: NonEmptyString255(req.originalUrl), // set more detailed elsewhere
        locale,
        namespace,
        sourceId: deviceId ? NonEmptyString255(deviceId) : undefined
      })
      const res = yield* setupRequestContext(app, requestContext)

      // TODO: how to set also on errors?
      return HttpServerResponse.setHeaders(res, {
        "Content-Language": requestContext.locale
      })
    })
  )

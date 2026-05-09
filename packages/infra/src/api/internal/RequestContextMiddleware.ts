import { Effect, Layer } from "effect-app"
import { HttpMiddleware, HttpServerRequest, HttpServerResponse } from "effect-app/http"
import { NonEmptyString255 } from "effect-app/Schema"
import { Locale, LocaleRef, RequestContext, spanAttributes } from "../../RequestContext.js"
import { ContextMapContainer } from "../../Store/ContextMapContainer.js"
import { storeId } from "../../Store/Memory.js"

export const isRpcRequest = (url: string, originalUrl: string) =>
  url.startsWith("/rpc/") || originalUrl.startsWith("/rpc/")

export const RequestContextMiddleware = (defaultLocale: Locale = "en") =>
  HttpMiddleware.make((app) =>
    Effect.gen(function*() {
      const req = yield* HttpServerRequest.HttpServerRequest
      const rpcRequest = isRpcRequest(req.url, req.originalUrl)

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
      yield* Effect.annotateCurrentSpan(spanAttributes(requestContext))
      const layer = Layer.mergeAll(
        ContextMapContainer.layer,
        Layer.succeed(LocaleRef, requestContext.locale),
        Layer.succeed(storeId, requestContext.namespace)
      )
      const res = yield* app.pipe(
        Effect.withLogSpan(rpcRequest ? "rpc.request" : requestContext.name),
        Effect.provide(layer, { local: true })
      )

      // TODO: how to set also on errors?
      return HttpServerResponse.setHeaders(res, {
        "Content-Language": requestContext.locale
      })
    })
  )

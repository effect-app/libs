/**
 * Mechanism for extendning behaviour of all handlers on the server.
 *
 * @since 1.0.0
 */
import * as crypto from "crypto"

import { NotLoggedInError } from "@effect-app/infra/errors"
import * as Middleware from "@effect/platform/HttpMiddleware"
import * as HttpServerRequest from "@effect/platform/HttpServerRequest"
import * as ServerResponse from "@effect/platform/HttpServerResponse"
import { Effect } from "effect-app"
import { HttpBody, HttpHeaders, HttpServerResponse } from "effect-app/http"
import { dropUndefined } from "effect-app/utils"
import * as Either from "effect/Either"
import * as FiberRef from "effect/FiberRef"
import { pipe } from "effect/Function"
import * as HashMap from "effect/HashMap"
import * as Metric from "effect/Metric"
import { InfraLogger } from "../../logger.js"
import type * as Middlewares from "../middlewares.js"

export const accessLog = (level: "Info" | "Warning" | "Debug" = "Info") =>
  Middleware.make((app) =>
    pipe(
      HttpServerRequest.HttpServerRequest,
      Effect.flatMap((request) => Effect[`log${level}`](`${request.method} ${request.url}`)),
      Effect.flatMap(() => app)
    )
  )

export const uuidLogAnnotation = (logAnnotationKey = "requestId") =>
  Middleware.make((app) =>
    pipe(
      Effect.sync(() => crypto.randomUUID()),
      Effect.flatMap((uuid) =>
        FiberRef.update(
          FiberRef.currentLogAnnotations,
          HashMap.set<string, unknown>(logAnnotationKey, uuid)
        )
      ),
      Effect.flatMap(() => app)
    )
  )

export const endpointCallsMetric = () => {
  const endpointCalledCounter = Metric.counter("server.endpoint_calls")

  return Middleware.make((app) =>
    Effect.gen(function*() {
      const request = yield* (HttpServerRequest.HttpServerRequest)

      yield* pipe(
        Metric.increment(endpointCalledCounter),
        Effect.tagMetrics("path", request.url)
      )

      return yield* app
    })
  )
}

export const errorLog = Middleware.make((app) =>
  Effect.gen(function*() {
    const request = yield* HttpServerRequest.HttpServerRequest

    const response = yield* app

    if (response.status >= 400 && response.status < 500) {
      yield* InfraLogger.logWarning(
        `${request.method.toUpperCase()} ${request.url} client error ${response.status}`
      )
    } else if (response.status >= 500) {
      yield* InfraLogger.logError(
        `${request.method.toUpperCase()} ${request.url} server error ${response.status}`
      )
    }

    return response
  })
)

const toServerResponse = (err: NotLoggedInError) =>
  HttpServerResponse.empty().pipe(
    HttpServerResponse.setStatus(401),
    HttpServerResponse.setBody(HttpBody.unsafeJson({ message: err.message }))
  )

export const basicAuth = <_, R>(
  checkCredentials: (
    credentials: Middlewares.BasicAuthCredentials
  ) => Effect<_, NotLoggedInError, R>,
  options?: Partial<{
    headerName: string
    skipPaths: readonly string[]
  }>
) =>
  Middleware.make((app) =>
    Effect.gen(function*() {
      const headerName = options?.headerName ?? "Authorization"
      const skippedPaths = options?.skipPaths ?? []
      const request = yield* HttpServerRequest.HttpServerRequest

      if (skippedPaths.includes(request.url)) {
        return yield* app
      }

      const authHeader = request.headers[headerName.toLowerCase()]

      if (authHeader === undefined) {
        return toServerResponse(
          new NotLoggedInError(
            `Expected header ${headerName}`
          )
        )
      }

      const authorizationParts = authHeader.split(" ")

      if (authorizationParts.length !== 2) {
        return toServerResponse(
          new NotLoggedInError(
            "Incorrect auhorization scheme. Expected \"Basic <credentials>\""
          )
        )
      }

      if (authorizationParts[0] !== "Basic") {
        return toServerResponse(
          new NotLoggedInError(
            `Incorrect auhorization type. Expected "Basic", got "${authorizationParts[0]}"`
          )
        )
      }

      const credentialsBuffer = Buffer.from(authorizationParts[1]!, "base64")
      const credentialsText = credentialsBuffer.toString("utf-8")
      const credentialsParts = credentialsText.split(":")

      if (credentialsParts.length !== 2) {
        return toServerResponse(
          new NotLoggedInError(
            "Incorrect basic auth credentials format. Expected base64 encoded \"<user>:<pass>\"."
          )
        )
      }

      const check = yield* Effect.either(checkCredentials({
        user: credentialsParts[0],
        password: credentialsParts[1]!
      }))

      if (Either.isLeft(check)) {
        return toServerResponse(check.left)
      }

      return yield* app
    })
  )

export const cors = (_options?: Partial<Middlewares.CorsOptions>) => {
  const DEFAULTS = {
    allowedOrigins: ["*"],
    allowedMethods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE"],
    allowedHeaders: [],
    exposedHeaders: [],
    credentials: false
  } as const

  const options = { ...DEFAULTS, ..._options }

  const isAllowedOrigin = (origin: string) => {
    return options.allowedOrigins.includes(origin)
  }

  const allowOrigin = (originHeader: string) => {
    if (options.allowedOrigins.includes("*")) {
      return { "Access-Control-Allow-Origin": "*" }
    }

    if (options.allowedOrigins.length === 0) {
      return { "Access-Control-Allow-Origin": "*" }
    }

    if (isAllowedOrigin(originHeader)) {
      return {
        "Access-Control-Allow-Origin": originHeader,
        Vary: "Origin"
      }
    }

    return undefined
  }

  const allowMethods = (() => {
    if (options.allowedMethods.length > 0) {
      return {
        "Access-Control-Allow-Methods": options.allowedMethods.join(", ")
      }
    }

    return undefined
  })()

  const allowCredentials = (() => {
    if (options.credentials) {
      return { "Access-Control-Allow-Credentials": "true" }
    }

    return undefined
  })()

  const allowHeaders = (accessControlRequestHeaders: string | undefined) => {
    if(!options.allowedOrigins) return undefined

    if (options.allowedHeaders.length === 0 && accessControlRequestHeaders) {
      return {
        Vary: "Access-Control-Request-Headers",
        "Access-Control-Allow-Headers": accessControlRequestHeaders
      }
    }

    if (options.allowedHeaders.length) {
      return {
        "Access-Control-Allow-Headers": options.allowedHeaders.join(",")
      }
    }

    return undefined
  }

  const exposeHeaders = (() => {
    if (options.exposedHeaders.length > 0) {
      return {
        "Access-Control-Expose-Headers": options.exposedHeaders.join(",")
      }
    }

    return undefined
  })()

  const maxAge = (() => {
    if (options.maxAge) {
      return { "Access-Control-Max-Age": options.maxAge.toString() }
    }

    return undefined
  })()

  return Middleware.make((app) =>
    Effect.gen(function*() {
      const request = yield* HttpServerRequest.HttpServerRequest

      const origin = request.headers["origin"]
      const accessControlRequestHeaders = request.headers["access-control-request-headers"]

      let corsHeaders = {
        ...allowOrigin(origin ?? ""),
        ...allowCredentials,
        ...exposeHeaders
      }

      if (request.method === "OPTIONS") {
        corsHeaders = {
          ...corsHeaders,
          ...allowMethods,
          ...allowHeaders(accessControlRequestHeaders),
          ...maxAge
        }

        return ServerResponse.empty({ status: 204, headers: HttpHeaders.fromInput(dropUndefined(corsHeaders)) })
      }

      const response = yield* app

      return response.pipe(ServerResponse.setHeaders(dropUndefined(corsHeaders)))
    })
  )
}

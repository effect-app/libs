import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import type * as Upstream from "effect/http/HttpMiddleware"
import { IpNetwork } from "effect/net"
import * as Option from "effect/Option"
import { expect, expectTypeOf, test } from "vitest"
import { HttpMiddleware, HttpRouter, HttpServerRequest, HttpServerResponse } from "../src/http.js"

class Svc extends Context.Service<Svc, {}>()("Svc") {}

const trustedProxies = [IpNetwork.fromStringUnsafe("10.0.0.0/8")]

const addressText = (request: HttpServerRequest.HttpServerRequest) =>
  Option.getOrElse(request.remoteAddress, () => "unknown")

test("xForwardedHeaders keeps the app error and HttpServerRequest", () => {
  const app = HttpServerRequest.HttpServerRequest.use((request) =>
    Effect.succeed(HttpServerResponse.text(addressText(request)))
  ).pipe(HttpMiddleware.xForwardedHeaders({ trustedProxies }))

  expectTypeOf(app).toEqualTypeOf<
    Effect.Effect<HttpServerResponse.HttpServerResponse, never, HttpServerRequest.HttpServerRequest>
  >()

  const rich: Effect.Effect<HttpServerResponse.HttpServerResponse, "Boom", HttpServerRequest.HttpServerRequest | Svc> =
    Effect.fail("Boom")
  const wrapped = rich.pipe(HttpMiddleware.xForwardedHeaders({ trustedProxies }))

  expectTypeOf(wrapped).toEqualTypeOf<
    Effect.Effect<HttpServerResponse.HttpServerResponse, "Boom", HttpServerRequest.HttpServerRequest | Svc>
  >()

  const layer = HttpRouter.middleware(HttpMiddleware.xForwardedHeaders({ trustedProxies }))
  const corsLayer = HttpRouter.middleware(HttpMiddleware.cors())
  expectTypeOf(layer).toEqualTypeOf(corsLayer)

  expectTypeOf<keyof typeof HttpMiddleware>().toEqualTypeOf<keyof typeof Upstream>()
})

test("xForwardedHeaders still applies a trusted proxy hop", async () => {
  const app = HttpServerRequest.HttpServerRequest.use((request) =>
    Effect.succeed(HttpServerResponse.text(addressText(request)))
  ).pipe(HttpMiddleware.xForwardedHeaders({ trustedProxies }))
  const request = HttpServerRequest.fromWeb(
    new Request("http://app.test/", { headers: { "x-forwarded-for": "6.6.6.6, 198.51.100.7" } })
  ).modify({ remoteAddress: Option.some("10.0.0.1") })
  const response = await Effect.runPromise(Effect.provideService(app, HttpServerRequest.HttpServerRequest, request))
  expect(await HttpServerResponse.toWeb(response).text()).toBe("198.51.100.7")
})

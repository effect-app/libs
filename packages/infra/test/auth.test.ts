import { describe, expect, it } from "@effect/vitest"
import { Effect } from "effect-app"
import { HttpHeaders } from "effect-app/http"
import { SignJWT } from "jose"
import { checkJWTI, InvalidRequestError, InvalidTokenError, UnauthorizedError } from "../src/api/internal/auth.js"

const issuer = "https://issuer.example.com/"
const audience = "effect-app"
const secret = "test-secret-test-secret-test-secret"

const makeToken = () =>
  new SignJWT({ scope: "read:all" })
    .setProtectedHeader({ alg: "HS256", typ: "at+jwt" })
    .setIssuer(issuer)
    .setAudience(audience)
    .setIssuedAt()
    .setExpirationTime("10m")
    .sign(new TextEncoder().encode(secret))

describe("checkJWTI", () => {
  it.effect(
    "validates a bearer token from headers",
    Effect.fnUntraced(function*() {
      const token = yield* Effect.promise(() => makeToken())

      yield* checkJWTI({
        audience,
        issuer,
        secret,
        strict: true,
        tokenSigningAlg: "HS256"
      })(HttpHeaders.fromRecordUnsafe({ authorization: `Bearer ${token}` }))
    })
  )

  it.effect(
    "fails on malformed authorization headers",
    Effect.fnUntraced(function*() {
      const error = yield* Effect.flip(
        checkJWTI({
          audience,
          issuer,
          secret,
          tokenSigningAlg: "HS256"
        })(HttpHeaders.fromRecordUnsafe({ authorization: "Basic abc" }))
      )

      expect(error).toBeInstanceOf(InvalidRequestError)
      expect(error.status).toBe(400)
    })
  )

  it.effect(
    "fails when the token is missing",
    Effect.fnUntraced(function*() {
      const error = yield* Effect.flip(
        checkJWTI({
          audience,
          issuer,
          secret,
          tokenSigningAlg: "HS256"
        })(HttpHeaders.empty)
      )

      expect(error).toBeInstanceOf(UnauthorizedError)
      expect(error.status).toBe(401)
    })
  )

  it.effect(
    "allows missing tokens when auth is optional",
    Effect.fnUntraced(function*() {
      yield* checkJWTI({
        audience,
        authRequired: false,
        issuer,
        secret,
        tokenSigningAlg: "HS256"
      })(HttpHeaders.empty)
    })
  )

  it.effect(
    "fails when the token signature is invalid",
    Effect.fnUntraced(function*() {
      const token = yield* Effect.promise(() => makeToken())

      const error = yield* Effect.flip(
        checkJWTI({
          audience,
          issuer,
          secret: "wrong-secret-wrong-secret-wrong-secret",
          tokenSigningAlg: "HS256"
        })(HttpHeaders.fromRecordUnsafe({ authorization: `Bearer ${token}` }))
      )

      expect(error).toBeInstanceOf(InvalidTokenError)
      expect(error.status).toBe(401)
    })
  )
})

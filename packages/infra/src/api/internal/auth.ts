/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable unused-imports/no-unused-vars */
import { Data, Effect } from "effect-app"
import { HttpHeaders, HttpMiddleware, HttpServerRequest, HttpServerResponse } from "effect-app/http"
import { auth, InsufficientScopeError, InvalidRequestError, InvalidTokenError, UnauthorizedError } from "express-oauth2-jwt-bearer"

// // Authorization middleware. When used, the Access Token must
// // exist and be verified against the Auth0 JSON Web Key Set.

// type Errors = InsufficientScopeError | InvalidRequestError | InvalidTokenError | UnauthorizedError
type Config = Parameters<typeof auth>[0]
export const checkJWTI = (config: Config) => {
  const mw = auth(config)
  return Effect.fnUntraced(function*(headers: HttpHeaders.Headers) {
    return yield* Effect.async<
      void,
      InsufficientScopeError | InvalidRequestError | InvalidTokenError | UnauthorizedError
    >(
      (cb) => {
        const next = (err?: unknown) => {
          if (!err) return cb(Effect.void)
          if (
            err instanceof InsufficientScopeError
            || err instanceof InvalidRequestError
            || err instanceof InvalidTokenError
            || err instanceof UnauthorizedError
          ) {
            return cb(Effect.fail(err))
          }
          return cb(Effect.die(err))
        }
        const r = { headers, query: {}, body: {}, is: () => false, method: "POST" } // is("urlencoded")
        try {
          mw(r as any, {} as any, next)
        } catch (e) {
          return cb(Effect.die(e))
        }
      }
    )
  })
}

export const checkJwt = (config: Config) => {
  const check = checkJWTI(config)
  return HttpMiddleware.make((app) =>
    Effect.gen(function*() {
      const req = yield* HttpServerRequest.HttpServerRequest
      const response = yield* check(req.headers).pipe(Effect.catchAll((e) =>
        Effect.succeed(
          HttpServerResponse.unsafeJson({ message: e.message }, {
            status: e.status,
            headers: HttpHeaders.fromInput(e.headers)
          })
        )
      ))
      if (response) {
        return response
      }
      return yield* app
    })
  )
}

export class JWTError extends Data.TaggedClass("JWTError")<{
  error:
    | InsufficientScopeError
    | InvalidRequestError
    | InvalidTokenError
    | UnauthorizedError
}> {}

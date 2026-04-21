import { Data, Effect, Option } from "effect-app"
import { HttpHeaders, HttpMiddleware, HttpServerRequest, HttpServerResponse } from "effect-app/http"
import { createRemoteJWKSet, jwtVerify } from "jose"

const getHeaders = (error: string, description: string, scopes?: ReadonlyArray<string>) => ({
  "WWW-Authenticate": `Bearer realm="api", error="${error}", error_description="${description.replace(/"/g, "'")}"${
    scopes ? `, scope="${scopes.join(" ")}"` : ""
  }`
})

export class UnauthorizedError extends Error {
  readonly status: number = 401
  readonly statusCode: number = 401
  headers = { "WWW-Authenticate": "Bearer realm=\"api\"" }

  constructor(message = "Unauthorized") {
    super(message)
    this.name = this.constructor.name
  }
}

export class InvalidRequestError extends UnauthorizedError {
  readonly code: string
  override readonly status = 400
  override readonly statusCode = 400

  constructor(message = "Invalid Request", useErrorCode = true) {
    super(message)
    this.code = useErrorCode ? "invalid_request" : ""
    if (useErrorCode) {
      this.headers = getHeaders(this.code, this.message)
    }
  }
}

export class InvalidTokenError extends UnauthorizedError {
  readonly code = "invalid_token"

  constructor(message = "Invalid Token") {
    super(message)
    this.headers = getHeaders(this.code, this.message)
  }
}

export class InsufficientScopeError extends UnauthorizedError {
  readonly code = "insufficient_scope"
  override readonly status = 403
  override readonly statusCode = 403

  constructor(scopes?: ReadonlyArray<string>, message = "Insufficient Scope") {
    super(message)
    this.headers = getHeaders(this.code, this.message, scopes)
  }
}

export interface JwtVerifierOptions {
  readonly audience?: string | Array<string> | ReadonlyArray<string>
  readonly clockTolerance?: number
  readonly issuer?: string
  readonly issuerBaseURL?: string
  readonly jwksUri?: string
  readonly maxTokenAge?: number
  readonly secret?: string
  readonly strict?: boolean
  readonly tokenSigningAlg?: string
}

export interface AuthOptions extends JwtVerifierOptions {
  readonly authRequired?: boolean
}

type Config = AuthOptions

type JwtError = InsufficientScopeError | InvalidRequestError | InvalidTokenError | UnauthorizedError

type ResolvedConfigBase = {
  readonly audience: string | Array<string> | undefined
  readonly clockTolerance: number
  readonly issuer: string | undefined
  readonly maxTokenAge: number | undefined
  readonly strict: boolean
  readonly tokenSigningAlg: string | undefined
}

type ResolvedConfig =
  & ResolvedConfigBase
  & (
    | {
      readonly key: ReturnType<typeof createRemoteJWKSet>
      readonly keyType: "jwks"
    }
    | {
      readonly key: Uint8Array
      readonly keyType: "secret"
    }
  )

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null

const getErrorMessage = (error: unknown) => error instanceof Error ? error.message : String(error)

const normalizeAudience = (audience: Config["audience"]): string | Array<string> | undefined =>
  Array.isArray(audience) ? Array.from(audience) : audience as string | undefined

const buildDiscoveryUrl = (issuerBaseURL: string) => {
  const url = new URL(issuerBaseURL)
  if (!url.pathname.includes("/.well-known/")) {
    url.pathname = url.pathname.endsWith("/")
      ? `${url.pathname}.well-known/openid-configuration`
      : `${url.pathname}/.well-known/openid-configuration`
  }
  url.search = ""
  url.hash = ""
  return url
}

const fetchDiscoveryDocumentPromise = async (issuerBaseURL: string) => {
  const response = await fetch(buildDiscoveryUrl(issuerBaseURL))
  if (!response.ok) {
    throw new Error(`Failed to fetch authorization server metadata: ${response.status}`)
  }
  const json = await response.json()
  if (!isRecord(json) || typeof json["issuer"] !== "string" || typeof json["jwks_uri"] !== "string") {
    throw new Error("Invalid authorization server metadata")
  }
  return { issuer: json["issuer"], jwksUri: json["jwks_uri"] }
}

const getAuthorizationToken = (headers: HttpHeaders.Headers, authRequired: boolean) => {
  const authorization = HttpHeaders.get(headers, "authorization")
  if (Option.isNone(authorization)) {
    return authRequired ? Effect.fail(new UnauthorizedError()) : Effect.succeed(Option.none<string>())
  }

  const [scheme, token] = authorization.value.split(" ")
  if (!scheme || !token || scheme.toLowerCase() !== "bearer") {
    return Effect.fail(new InvalidRequestError("", false))
  }

  return Effect.succeed(Option.some(token))
}

const makeResolveConfig = (config: Config) => {
  let cached: Promise<ResolvedConfig> | undefined

  return Effect.tryPromise({
    try: () => {
      if (!cached) {
        cached = (async (): Promise<ResolvedConfig> => {
          const discovery = config.issuerBaseURL
            ? await fetchDiscoveryDocumentPromise(config.issuerBaseURL)
            : undefined

          const issuer = config.issuer ?? discovery?.issuer
          const jwksUri = config.jwksUri ?? discovery?.jwksUri
          const secret = config.secret
          const base = {
            audience: normalizeAudience(config.audience),
            clockTolerance: config.clockTolerance ?? 5,
            issuer,
            maxTokenAge: config.maxTokenAge,
            strict: config.strict ?? false,
            tokenSigningAlg: config.tokenSigningAlg
          } satisfies ResolvedConfigBase

          if (!issuer && !secret) {
            throw new InvalidRequestError("JWT config requires 'issuer', 'issuerBaseURL', or 'secret'")
          }

          if (!secret) {
            if (!jwksUri) {
              throw new InvalidRequestError("JWT config requires 'jwksUri', 'issuerBaseURL', or 'secret'")
            }

            return {
              ...base,
              key: createRemoteJWKSet(new URL(jwksUri)),
              keyType: "jwks"
            }
          }

          return {
            ...base,
            key: new TextEncoder().encode(secret),
            keyType: "secret"
          }
        })()
      }

      return cached
    },
    catch: (error) =>
      error instanceof InvalidRequestError || error instanceof InvalidTokenError
        ? error
        : new InvalidTokenError(getErrorMessage(error))
  })
}

const verifyToken =
  (resolveConfig: Effect.Effect<ResolvedConfig, InvalidRequestError | InvalidTokenError>) => (token: string) =>
    resolveConfig.pipe(
      Effect.flatMap((config) => {
        const options = {
          clockTolerance: config.clockTolerance,
          ...(config.tokenSigningAlg ? { algorithms: [config.tokenSigningAlg] } : {}),
          ...(config.audience !== undefined ? { audience: config.audience } : {}),
          ...(config.issuer !== undefined ? { issuer: config.issuer } : {}),
          ...(config.maxTokenAge !== undefined ? { maxTokenAge: config.maxTokenAge } : {})
        }
        const verified = config.keyType === "jwks"
          ? Effect.tryPromise({
            try: () => jwtVerify(token, config.key, options).then(({ protectedHeader }) => ({ protectedHeader })),
            catch: (error) => new InvalidTokenError(getErrorMessage(error))
          })
          : Effect.tryPromise({
            try: () => jwtVerify(token, config.key, options).then(({ protectedHeader }) => ({ protectedHeader })),
            catch: (error) => new InvalidTokenError(getErrorMessage(error))
          })

        return verified.pipe(
          Effect.flatMap(({ protectedHeader }) => {
            const typ = protectedHeader.typ?.toLowerCase().replace(/^application\//, "")
            return config.strict && typ !== "at+jwt"
              ? Effect.fail(new InvalidTokenError("Unexpected 'typ' value"))
              : Effect.void
          })
        )
      })
    )

export const checkJWTI = (config: Config) => {
  const resolveConfig = makeResolveConfig(config)
  const verify = verifyToken(resolveConfig)

  return Effect.fnUntraced(function*(headers: HttpHeaders.Headers) {
    const token = yield* getAuthorizationToken(headers, config.authRequired !== false)
    if (Option.isNone(token)) {
      return
    }

    yield* verify(token.value)
  })
}

export const checkJwt = (config: Config) => {
  const check = checkJWTI(config)
  return HttpMiddleware.make((app) =>
    Effect.gen(function*() {
      const req = yield* HttpServerRequest.HttpServerRequest
      const response = yield* check(req.headers).pipe(
        Effect.catch((error: JwtError) =>
          HttpServerResponse.json({ message: error.message }, {
            status: error.status,
            headers: HttpHeaders.fromInput(error.headers)
          })
        )
      )

      if (response) {
        return response
      }

      return yield* app
    })
  )
}

export class JWTError extends Data.TaggedClass("JWTError")<{
  error: JwtError
}> {}

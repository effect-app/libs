import { TaggedError } from "effect-app/Schema"
import { makeFiberFailure } from "effect/Runtime"
import { Cause, S } from "../lib.js"

export const tryToJson = (error: { toJSON(): unknown; toString(): string }) => {
  try {
    return error.toJSON()
  } catch {
    try {
      return error.toString()
    } catch (err) {
      try {
        return `Failed to convert error: ${err}`
      } catch {
        return `Failed to convert error: unknown failure`
      }
    }
  }
}

// eslint-disable-next-line unused-imports/no-unused-vars
// @ts-expect-error type not used
export class NotFoundError<ItemType = string> extends TaggedError<NotFoundError<ItemType>>()("NotFoundError", {
  type: S.String,
  id: S.Unknown
}) {
  override get message() {
    return `Didn't find ${this.type}#${JSON.stringify(this.id)}`
  }
}

const messageFallback = (messageOrObject?: string | { message: string }) =>
  typeof messageOrObject === "object" ? messageOrObject : { message: messageOrObject ?? "" }

export class InvalidStateError extends TaggedError<InvalidStateError>()("InvalidStateError", {
  message: S.String
}) {
  constructor(messageOrObject: string | { message: string }, disableValidation?: boolean) {
    super(typeof messageOrObject === "object" ? messageOrObject : { message: messageOrObject }, disableValidation)
  }
}

export class ServiceUnavailableError extends TaggedError<ServiceUnavailableError>()("ServiceUnavailableError", {
  message: S.String
}) {
  constructor(messageOrObject: string | { message: string }, disableValidation?: boolean) {
    super(typeof messageOrObject === "object" ? messageOrObject : { message: messageOrObject }, disableValidation)
  }
}

export class ValidationError extends TaggedError<ValidationError>()("ValidationError", {
  errors: S.Array(S.Unknown)
}) {
  override get message() {
    return `Validation failed: ${this.errors.map((e) => JSON.stringify(e, undefined, 2)).join(",\n")}`
  }
}

export class NotLoggedInError extends TaggedError<NotLoggedInError>()("NotLoggedInError", {
  message: S.String
}) {
  constructor(messageOrObject?: string | { message: string }, disableValidation?: boolean) {
    super(messageFallback(messageOrObject), disableValidation)
  }
}

/**
 * The user carries a valid Userprofile, but there is a problem with the login none the less.
 */
export class LoginError extends TaggedError<LoginError>()("NotLoggedInError", {
  message: S.String
}) {
  constructor(messageOrObject?: string | { message: string }, disableValidation?: boolean) {
    super(messageFallback(messageOrObject), disableValidation)
  }
}

export class UnauthorizedError extends TaggedError<UnauthorizedError>()("UnauthorizedError", {
  message: S.String
}) {
  constructor(messageOrObject?: string | { message: string }, disableValidation?: boolean) {
    super(messageFallback(messageOrObject), disableValidation)
  }
}

type OptimisticConcurrencyDetails = {
  readonly type: string
  readonly id: string
  readonly current?: string | undefined
  readonly found?: string | undefined
}

export class OptimisticConcurrencyException extends TaggedError<OptimisticConcurrencyException>()(
  "OptimisticConcurrencyException",
  { message: S.String }
) {
  readonly details?: OptimisticConcurrencyDetails
  constructor(
    args: OptimisticConcurrencyDetails | { message: string },
    disableValidation?: boolean
  ) {
    super("message" in args ? args : { message: `Existing ${args.type} ${args.id} record changed` }, disableValidation)
    if (!("message" in args)) {
      this.details = args
    }
  }
}

const MutationOnlyErrors = [
  InvalidStateError,
  OptimisticConcurrencyException
] as const

const GeneralErrors = [
  NotFoundError,
  NotLoggedInError,
  LoginError,
  UnauthorizedError,
  ValidationError,
  ServiceUnavailableError
] as const

export const SupportedErrors = S.Union(
  ...MutationOnlyErrors,
  ...GeneralErrors
)
// .pipe(named("SupportedErrors"))
// .pipe(withDefaultMake)
export type SupportedErrors = S.Schema.Type<typeof SupportedErrors>

// ideal?
// export const QueryErrors = union({ ...GeneralErrors })
//   .pipe(named("QueryErrors"))
//   .pipe(withDefaultMake)
// export type QueryErrors = Schema.Type<typeof QueryErrors>
// export const MutationErrors = union({ ...GeneralErrors, ...GeneralErrors })
//   .pipe(named("MutationErrors"))
//   .pipe(withDefaultMake)

// export type MutationErrors = Schema.Type<typeof MutationErrors>

export const MutationErrors = SupportedErrors
export const QueryErrors = SupportedErrors
export type MutationErrors = S.Schema.Type<typeof MutationErrors>
export type QueryErrors = S.Schema.Type<typeof QueryErrors>

export const ErrorReported = Symbol.for("effect-app/error-reported")
export const isErrorReported = (e: unknown): boolean =>
  typeof e === "object" && e !== null && ErrorReported in e ? !!e[ErrorReported] : false

export class CauseException<E> extends Error {
  constructor(readonly originalCause: Cause<E>, readonly _tag: string) {
    const limit = Error.stackTraceLimit
    Error.stackTraceLimit = 0
    super()
    Error.stackTraceLimit = limit
    const ff = makeFiberFailure(originalCause)
    this.name = ff.name
    this.message = ff.message
    if (ff.stack) {
      this.stack = ff.stack
    }
  }
  toJSON() {
    return {
      _tag: this._tag,
      name: this.name,
      message: this.message
    }
  }

  [Symbol.for("nodejs.util.inspect.custom")]() {
    return this.toJSON()
  }
  override toString() {
    return `[${this._tag}] ` + Cause.pretty(this.originalCause, { renderErrorCause: true })
  }

  [ErrorReported] = false
}

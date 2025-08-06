/** @effect-diagnostics overriddenSchemaConstructor:skip-file */
import { TaggedError } from "effect-app/Schema"
import { makeFiberFailure } from "effect/Runtime"
import { Cause, S } from "../internal/lib.js"

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
  constructor(
    props: S.Struct.Constructor<typeof NotFoundError.fields> & { cause?: unknown },
    disableValidation?: boolean
  ) {
    super(props, disableValidation)
  }
  override get message() {
    return `Didn't find ${this.type}#${JSON.stringify(this.id)}`
  }
}

const messageFallback = (messageOrObject?: string | { message: string }) =>
  typeof messageOrObject === "object" ? messageOrObject : { message: messageOrObject ?? "" }

export class InvalidStateError extends TaggedError<InvalidStateError>()("InvalidStateError", {
  message: S.String
}) {
  constructor(messageOrObject: string | { message: string; cause?: unknown }, disableValidation?: boolean) {
    super(typeof messageOrObject === "object" ? messageOrObject : { message: messageOrObject }, disableValidation)
  }
}

export class ServiceUnavailableError extends TaggedError<ServiceUnavailableError>()("ServiceUnavailableError", {
  message: S.String
}) {
  constructor(messageOrObject: string | { message: string; cause?: unknown }, disableValidation?: boolean) {
    super(typeof messageOrObject === "object" ? messageOrObject : { message: messageOrObject }, disableValidation)
  }
}

export class ValidationError extends TaggedError<ValidationError>()("ValidationError", {
  errors: S.Array(S.Unknown)
}) {
  constructor(
    props: S.Struct.Constructor<typeof ValidationError.fields> & { cause?: unknown },
    disableValidation?: boolean
  ) {
    super(props, disableValidation)
  }
  override get message() {
    return `Validation failed: ${this.errors.map((e) => JSON.stringify(e, undefined, 2)).join(",\n")}`
  }
}

export class NotLoggedInError extends TaggedError<NotLoggedInError>()("NotLoggedInError", {
  message: S.String
}) {
  constructor(messageOrObject?: string | { message: string; cause?: unknown }, disableValidation?: boolean) {
    super(messageFallback(messageOrObject), disableValidation)
  }
}

/**
 * The user carries a valid Userprofile, but there is a problem with the login none the less.
 */
export class LoginError extends TaggedError<LoginError>()("NotLoggedInError", {
  message: S.String
}) {
  constructor(messageOrObject?: string | { message: string; cause?: unknown }, disableValidation?: boolean) {
    super(messageFallback(messageOrObject), disableValidation)
  }
}

export class UnauthorizedError extends TaggedError<UnauthorizedError>()("UnauthorizedError", {
  message: S.String
}) {
  constructor(messageOrObject?: string | { message: string; cause?: unknown }, disableValidation?: boolean) {
    super(messageFallback(messageOrObject), disableValidation)
  }
}

type OptimisticConcurrencyDetails = {
  readonly type: string
  readonly id: string
  readonly code: number
  readonly current?: string | undefined
  readonly found?: string | undefined
}

export class OptimisticConcurrencyException extends TaggedError<OptimisticConcurrencyException>()(
  "OptimisticConcurrencyException",
  { message: S.String }
) {
  readonly details?: OptimisticConcurrencyDetails
  readonly raw?: unknown
  constructor(
    args:
      | OptimisticConcurrencyDetails
      | (S.Struct.Constructor<typeof OptimisticConcurrencyException.fields> & { cause?: unknown; raw?: unknown }),
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

export const ErrorSilenced = Symbol.for("effect-app/error-silenced")
export const isErrorSilenced = (e: unknown): boolean =>
  typeof e === "object" && e !== null && ErrorSilenced in e ? !!e[ErrorSilenced] : false
export const silenceError = (e: Record<PropertyKey, any>) => {
  e[ErrorSilenced] = true
}

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
  toReport() {
    return {
      _tag: this._tag,
      name: this.name,
      message: this.message
    }
  }

  toJSON() {
    return {
      _tag: this._tag,
      name: this.name,
      message: this.message,
      originalCause: this.originalCause
    }
  }

  [Symbol.for("nodejs.util.inspect.custom")]() {
    return this.toJSON()
  }
  override toString() {
    return `[${this._tag}] ` + Cause.pretty(this.originalCause, { renderErrorCause: true })
  }
}

export const tryToReport = (error: { toReport(): unknown; toString(): string }) => {
  try {
    return error.toReport()
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

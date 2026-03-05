import * as Sentry from "@sentry/node"
import { Cause, Effect, type LogLevel } from "effect-app"
import { dropUndefined, LogLevelToSentry } from "effect-app/utils"
import { getRC } from "./api/setupRequest.js"
import { CauseException, tryToJson, tryToReport } from "./errors.js"
import { InfraLogger } from "./logger.js"

const tryCauseException = <E>(cause: Cause.Cause<E>, name: string): CauseException<E> => {
  try {
    return new CauseException(cause, name)
  } catch {
    return new CauseException(Cause.die(new Error("Failed to create CauseException")), name)
  }
}

export function reportError(
  name: string
) {
  return (
    cause: Cause.Cause<unknown>,
    extras?: Record<string, unknown>,
    level: LogLevel.Severity = "Error"
  ) =>
    Effect
      .gen(function*() {
        if (Cause.hasInterruptsOnly(cause)) {
          yield* InfraLogger.logDebug("Interrupted").pipe(Effect.annotateLogs("extras", JSON.stringify(extras ?? {})))
          return
        }
        const error = tryCauseException(cause, name)

        yield* reportSentry(error, extras, LogLevelToSentry(level))
        yield* InfraLogger
          .logWithLevel(level, "Reporting error", cause)
          .pipe(
            Effect.annotateLogs(dropUndefined({
              extras,
              error: tryToReport(error),
              cause: tryToJson(cause),
              __error_name__: name
            }))
          )
          .pipe(
            Effect.catchCause((cause) => InfraLogger.logWarning("Failed to log error", cause)),
            Effect.catchCause(() => InfraLogger.logFatal("Failed to log error cause"))
          )

        return error
      })
      .pipe(
        Effect.tapCause((cause) =>
          InfraLogger.logError("Failed to report error", cause).pipe(
            Effect.tapCause(() => InfraLogger.logFatal("Failed to log error cause"))
          )
        )
      )
}

function reportSentry(
  error: CauseException<unknown>,
  extras: Record<string, unknown> | undefined,
  level: Sentry.SeverityLevel = "error"
) {
  return getRC.pipe(Effect.map((context) => {
    const scope = new Sentry.Scope()
    scope.setLevel(level)
    if (context) scope.setContext("context", { ...context })
    if (extras) scope.setContext("extras", extras)
    scope.setContext("error", { data: tryToReport(error) })
    scope.setContext("cause", { data: tryToJson(error.originalCause) })
    Sentry.captureException(error, scope)
  }))
}

export function logError<E>(
  name: string
) {
  return (cause: Cause.Cause<E>, extras?: Record<string, unknown>) =>
    Effect
      .gen(function*() {
        if (Cause.hasInterruptsOnly(cause)) {
          yield* InfraLogger.logDebug("Interrupted").pipe(Effect.annotateLogs(dropUndefined({ extras })))
          return
        }
        yield* InfraLogger
          .logWarning("Logging error", cause)
          .pipe(
            Effect.annotateLogs(dropUndefined({
              extras,
              cause: tryToJson(cause),
              __error_name__: name
            }))
          )
      })
      .pipe(
        Effect.tapCause(() => InfraLogger.logFatal("Failed to log error cause"))
      )
}

export function reportMessage(message: string, extras?: Record<string, unknown>) {
  return Effect.gen(function*() {
    const context = yield* getRC
    const scope = new Sentry.Scope()
    if (context) scope.setContext("context", { ...context })
    if (extras) scope.setContext("extras", extras)
    Sentry.captureMessage(message, scope)

    console.warn(message, extras)
  })
}

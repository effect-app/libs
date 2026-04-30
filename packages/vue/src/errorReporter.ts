/* eslint-disable @typescript-eslint/no-explicit-any */
import * as Sentry from "@sentry/browser"
import { Cause, Effect, ErrorReporter, type LogLevel } from "effect-app"
import { tryToJson } from "effect-app/client/errors"
import { dropUndefined, LogLevelToSentry } from "effect-app/utils"

/**
 * An `ErrorReporter` that forwards failures to Sentry (browser).
 *
 * Register it via `ErrorReporter.layer([makeSentryReporter])` in your runtime layer.
 * Interrupt-skipping and per-error `ignore`/`severity`/`attributes` annotations
 * are handled automatically by `ErrorReporter.make`.
 */
export const makeSentryReporter = ErrorReporter.make(({ cause, error, severity, attributes }) => {
  const scope = new Sentry.Scope()
  scope.setLevel(LogLevelToSentry(severity))
  if (Object.keys(attributes).length > 0) {
    scope.setContext("attributes", attributes as Record<string, unknown>)
  }
  scope.setContext("cause", { pretty: Cause.pretty(cause) })
  Sentry.captureException(error, scope)
})

export function reportError(name: string) {
  return Effect.fnUntraced(
    function*(
      cause: Cause.Cause<unknown>,
      extras?: Record<string, unknown>,
      level: LogLevel.Severity = "Error"
    ) {
      if (Cause.hasInterruptsOnly(cause)) {
        yield* Effect.logDebug("Interrupted").pipe(Effect.annotateLogs("extras", JSON.stringify(extras ?? {})))
        return
      }

      yield* ErrorReporter.report(cause)
      yield* Effect
        .logWithLevel(level)("Reporting error", cause)
        .pipe(
          Effect.annotateLogs(dropUndefined({
            extras,
            cause: tryToJson(cause),
            __error_name__: name
          })),
          Effect.catchCause((cause) => Effect.logWarning("Failed to log error", cause)),
          Effect.catchCause(() => Effect.logFatal("Failed to log error cause"))
        )
    },
    (effect) =>
      Effect.tapCause(effect, (cause) =>
        Effect.logError("Failed to report error", cause).pipe(
          Effect.tapCause(() => Effect.logFatal("Failed to log error cause"))
        ))
  )
}

export function logError<E>(name: string) {
  return Effect.fnUntraced(
    function*(cause: Cause.Cause<E>, extras?: Record<string, unknown>) {
      if (Cause.hasInterruptsOnly(cause)) {
        yield* Effect.logDebug("Interrupted").pipe(Effect.annotateLogs(dropUndefined({ extras })))
        return
      }
      yield* Effect
        .logWarning("Logging error", cause)
        .pipe(Effect.annotateLogs(dropUndefined({
          extras,
          cause: tryToJson(cause),
          __error_name__: name
        })))
    },
    (effect) =>
      Effect.tapCause(effect, (cause) =>
        Effect.logError("Failed to log error", cause).pipe(
          Effect.tapCause(() => Effect.logFatal("Failed to log error cause"))
        ))
  )
}

export function captureException(error: unknown, extras?: Record<string, unknown>) {
  const scope = new Sentry.Scope()
  if (extras) scope.setContext("extras", extras)
  Sentry.captureException(error, extras)
  console.error(error, extras)
}

export const reportMessage = Effect.fnUntraced(function*(message: string, extras?: Record<string, unknown>) {
  const scope = new Sentry.Scope()
  if (extras) scope.setContext("extras", extras)
  Sentry.captureMessage(message, scope)

  console.warn(message, extras)
})

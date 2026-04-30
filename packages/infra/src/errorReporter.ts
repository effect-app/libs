import * as Sentry from "@sentry/node"
import { Cause, Effect, ErrorReporter, type LogLevel } from "effect-app"
import { dropUndefined, LogLevelToSentry } from "effect-app/utils"
import { LocaleRef } from "./RequestContext.js"
import { storeId } from "./Store/Memory.js"
import { tryToJson } from "./errors.js"
import { InfraLogger } from "./logger.js"

/**
 * An `ErrorReporter` that forwards failures to Sentry (Node.js).
 *
 * Register it via `ErrorReporter.layer([makeSentryReporter])` in your runtime layer.
 * Interrupt-skipping and per-error `ignore`/`severity`/`attributes` annotations
 * are handled automatically by `ErrorReporter.make`.
 */
export const makeSentryReporter = ErrorReporter.make(({ attributes, cause, error, fiber, severity }) => {
  const scope = new Sentry.Scope()
  scope.setLevel(LogLevelToSentry(severity))
  const locale = fiber.getRef(LocaleRef)
  const namespace = fiber.getRef(storeId)
  scope.setContext("context", { locale, namespace })
  if (Object.keys(attributes).length > 0) {
    scope.setContext("attributes", attributes)
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
        yield* InfraLogger.logDebug("Interrupted").pipe(Effect.annotateLogs("extras", JSON.stringify(extras ?? {})))
        return
      }

      yield* ErrorReporter.report(cause)
      yield* InfraLogger
        .logWithLevel(level, "Reporting error", cause)
        .pipe(
          Effect.annotateLogs(dropUndefined({
            extras,
            cause: tryToJson(cause),
            __error_name__: name
          })),
          Effect.catchCause((cause) => InfraLogger.logWarning("Failed to log error", cause)),
          Effect.catchCause(() => InfraLogger.logFatal("Failed to log error cause"))
        )
    },
    (effect) =>
      Effect.tapCause(effect, (cause) =>
        InfraLogger.logError("Failed to report error", cause).pipe(
          Effect.tapCause(() => InfraLogger.logFatal("Failed to log error cause"))
        ))
  )
}

export function logError<E>(name: string) {
  return Effect.fnUntraced(
    function*(cause: Cause.Cause<E>, extras?: Record<string, unknown>) {
      if (Cause.hasInterruptsOnly(cause)) {
        yield* InfraLogger.logDebug("Interrupted").pipe(Effect.annotateLogs(dropUndefined({ extras })))
        return
      }
      yield* InfraLogger
        .logWarning("Logging error", cause)
        .pipe(Effect.annotateLogs(dropUndefined({
          extras,
          cause: tryToJson(cause),
          __error_name__: name
        })))
    },
    (effect) => Effect.tapCause(effect, () => InfraLogger.logFatal("Failed to log error cause"))
  )
}

export const reportMessage = Effect.fnUntraced(function*(message: string, extras?: Record<string, unknown>) {
  const locale = yield* LocaleRef
  const namespace = yield* storeId
  const scope = new Sentry.Scope()
  scope.setContext("context", { locale, namespace })
  if (extras) scope.setContext("extras", extras)
  Sentry.captureMessage(message, scope)

  console.warn(message, extras)
})

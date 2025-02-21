/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
import * as Sentry from "@sentry/browser"
import { Cause, Effect } from "effect-app"
import { CauseException, ErrorReported, tryToJson, tryToReport } from "effect-app/client/errors"
import { dropUndefined } from "effect-app/utils"

export const tryCauseException = <E>(cause: Cause<E>, name: string): CauseException<E> => {
  try {
    return new CauseException(cause, name)
  } catch {
    return new CauseException(Cause.die(new Error("Failed to create CauseException")), name)
  }
}

export function reportError(
  name: string
) {
  return (cause: Cause.Cause<unknown>, extras?: Record<string, unknown>): Effect.Effect<unknown, never, never> =>
    Effect
      .gen(function*() {
        if (Cause.isInterruptedOnly(cause)) {
          yield* Effect.logDebug("Interrupted").pipe(Effect.annotateLogs("extras", JSON.stringify(extras ?? {})))
          return Cause.squash(cause)
        }

        const error = tryCauseException(cause, name)
        yield* reportSentry(error, extras)
        yield* Effect
          .logError("Reporting error", cause)
          .pipe(
            Effect.annotateLogs(dropUndefined({
              extras,
              error: tryToReport(error),
              cause: tryToJson(cause),
              __error_name__: name
            })),
            Effect.catchAllCause((cause) => Effect.logWarning("Failed to log error", cause)),
            Effect.catchAllCause(() => Effect.logFatal("Failed to log error cause"))
          )

        error[ErrorReported] = true
        return error
      })
      .pipe(
        Effect.tapErrorCause((cause) =>
          Effect.logError("Failed to report error", cause).pipe(
            Effect.tapErrorCause(() => Effect.logFatal("Failed to log error cause"))
          )
        )
      )
}

function reportSentry(
  error: CauseException<unknown>,
  extras: Record<string, unknown> | undefined
) {
  return Effect.sync(() => {
    const scope = new Sentry.Scope()
    if (extras) scope.setContext("extras", extras)
    scope.setContext("error", tryToReport(error) as any)
    scope.setContext("cause", tryToJson(error.originalCause) as any)
    Sentry.captureException(error, scope)
  })
}

export function logError<E>(
  name: string
) {
  return (cause: Cause.Cause<E>, extras?: Record<string, unknown>) =>
    Effect
      .gen(function*() {
        if (Cause.isInterruptedOnly(cause)) {
          yield* Effect.logDebug("Interrupted").pipe(Effect.annotateLogs(dropUndefined({ extras })))
          return
        }
        yield* Effect
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
        Effect.tapErrorCause((cause) =>
          Effect.logError("Failed to log error", cause).pipe(
            Effect.tapErrorCause(() => Effect.logFatal("Failed to log error cause"))
          )
        )
      )
}

export function captureException(error: unknown, extras?: Record<string, unknown>) {
  const scope = new Sentry.Scope()
  if (extras) scope.setContext("extras", extras)
  Sentry.captureException(error, extras)
  console.error(error, extras)
}

export function reportMessage(message: string, extras?: Record<string, unknown>) {
  return Effect.gen(function*() {
    const scope = new Sentry.Scope()
    if (extras) scope.setContext("extras", extras)
    Sentry.captureMessage(message, scope)

    console.warn(message, extras)
  })
}

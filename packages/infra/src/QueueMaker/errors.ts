import { reportError } from "@effect-app/infra/errorReporter"
import { Cause, Effect, Exit } from "effect-app"

const reportQueueError_ = reportError("Queue")

export const reportQueueError = <E>(cause: Cause.Cause<E>, extras?: Record<string, unknown>) =>
  reportQueueError_(cause, extras)

export function reportNonInterruptedFailure(context?: Record<string, unknown>) {
  const report = reportNonInterruptedFailureCause(context)
  return <A, E, R>(inp: Effect.Effect<A, E, R>): Effect.Effect<Exit.Exit<A, E>, never, R> =>
    inp.pipe(
      Effect.onExit(
        Exit.match({
          onFailure: report,
          onSuccess: () => Effect.void
        })
      ),
      Effect.exit
    )
}

export function reportNonInterruptedFailureCause(context?: Record<string, unknown>) {
  return <E>(cause: Cause.Cause<E>): Effect.Effect<void> => {
    if (Cause.isInterruptedOnly(cause)) {
      return Effect.failCause(cause as Cause.Cause<never>)
    }
    return reportQueueError(cause, context)
  }
}

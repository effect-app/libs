import { reportError } from "@effect-app/infra/errorReporter"
import { CauseException } from "@effect-app/infra/errors"

export class MessageException<E> extends CauseException<E> {
  constructor(cause: Cause<E>) {
    super(cause, "Message")
  }
}

export class FatalQueueException<E> extends CauseException<E> {
  constructor(cause: Cause<E>) {
    super(cause, "FatalQueue")
  }
}

const reportQueueError_ = reportError((cause) => new MessageException(cause))

export const reportQueueError = <E>(cause: Cause<E>, extras?: Record<string, unknown> | undefined) =>
  reportQueueError_(cause, extras)

/**
 * Forks the effect into a new fiber attached to the global scope. Because the
 * new fiber is attached to the global scope, when the fiber executing the
 * returned effect terminates, the forked fiber will continue running.
 *
 * Reports errors.
 *
 * @tsplus getter effect/io/Effect forkDaemonReportQueue
 */
export function forkDaemonReportQueue<R, E, A>(self: Effect<R, E, A>) {
  return self.tapErrorCause(reportNonInterruptedFailureCause({})).fork.daemonChildren
}

export const reportFatalQueueError = reportError(
  (cause) => new FatalQueueException(cause)
)

export function reportNonInterruptedFailure(context?: Record<string, unknown>) {
  const report = reportNonInterruptedFailureCause(context)
  return <R, E, A>(inp: Effect<R, E, A>): Effect<R, never, Exit<E, A>> =>
    inp
      .exit
      .flatMap((result) =>
        result.match(
          { onFailure: (cause) => report(cause).map(() => result), onSuccess: () => Effect(result) }
        )
      )
}

export function reportNonInterruptedFailureCause(context?: Record<string, unknown>) {
  return <E>(cause: Cause<E>): Effect<never, never, void> => {
    if (cause.isInterrupted()) {
      return (cause as Cause<never>).failCause
    }
    return reportQueueError(cause, context)
  }
}

import { Cause, Effect } from "effect-app"
import { logError, reportError } from "../errorReporter.js"

// const onExitReportError = (name: string, unknownOnly?: boolean) => {
//   const report = reportError(name)
//   const log = logError(name)
//   return <A, E, R>(self: Effect.Effect<A, E, R>) =>
//     Effect.onExit(self, (exit) =>
//       Exit.isFailure(exit)
//         ? unknownOnly
//           ? Cause.hasInterruptsOnly(exit.cause) || Cause.isDie(exit.cause)
//             ? report(exit.cause)
//             : log(exit.cause)
//           : report(exit.cause)
//         : Effect.void)
// }
const tapErrorCause = (name: string, unknownOnly?: boolean) => {
  const report = reportError(name)
  const log = logError(name)
  return <A, E, R>(self: Effect.Effect<A, E, R>) =>
    Effect.tapCause(self, (cause) =>
      unknownOnly
        ? Cause.hasFails(cause)
          ? log(cause)
          : report(cause)
        : report(cause))
}
export const reportRequestError = tapErrorCause("request")
export const reportUnknownRequestError = tapErrorCause("request", true)

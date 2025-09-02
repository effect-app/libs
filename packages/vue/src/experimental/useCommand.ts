/* eslint-disable @typescript-eslint/no-explicit-any */
import { asResult, type MakeIntlReturn, reportRuntimeError } from "@effect-app/vue"
import { reportMessage } from "@effect-app/vue/errorReporter"
import { Cause, Context, Effect, flow, Match, Option, Runtime, S } from "effect-app"
import { SupportedErrors } from "effect-app/client"
import { OperationFailure, OperationSuccess } from "effect-app/Operations"
import type { YieldWrap } from "effect/Utils"
import { computed } from "vue"
import { type makeUseConfirm } from "./useConfirm.js"
import { type makeUseWithToast } from "./useWithToast.js"

export const DefaultIntl = {
  de: {
    "handle.confirmation": "{action} bestätigen?",
    "handle.waiting": "{action} wird ausgeführt...",
    "handle.success": "{action} erfolgreich",
    "handle.with_errors": "{action} fehlgeschlagen",
    "handle.with_warnings": "{action} erfolgreich, mit Warnungen",
    "handle.error_response":
      "Die Anfrage war nicht erfolgreich:\n{error}\nWir wurden benachrichtigt und werden das Problem in Kürze beheben.",
    "handle.response_error": "Die Antwort konnte nicht verarbeitet werden:\n{error}",
    "handle.request_error": "Die Anfrage konnte nicht gesendet werden:\n{error}",
    "handle.unexpected_error": "Unerwarteter Fehler:\n{error}"
  },
  en: {
    "handle.confirmation": "Confirm {action}?",
    "handle.waiting": "{action} executing...",
    "handle.success": "{action} Success",
    "handle.with_errors": "{action} Failed",
    "handle.with_warnings": "{action}, with warnings",
    "handle.error_response":
      "There was an error in processing the response:\n{error}\nWe have been notified and will fix the problem shortly.",
    "handle.request_error": "There was an error in the request:\n{error}",
    "handle.response_error": "The request was not successful:\n{error}",
    "handle.unexpected_error": "Unexpected Error:\n{error}"
  }
}

export class CommandContext extends Context.Tag("CommandContext")<
  CommandContext,
  { action: string }
>() {}

export const makeUseCommand = <Locale extends string, R>(
  // NOTE: underscores to not collide with auto exports in nuxt apps
  _useIntl: MakeIntlReturn<Locale>["useIntl"],
  _useConfirm: ReturnType<typeof makeUseConfirm>,
  _useWithToast: ReturnType<typeof makeUseWithToast>,
  runtime: Runtime.Runtime<R>
) =>
() => {
  const withToast = _useWithToast()
  const { intl } = _useIntl()
  const { confirmOrInterrupt } = _useConfirm()

  const runFork = Runtime.runFork(runtime)

  return {
    /** Version of confirmOrInterrupt that automatically includes the action name in the default messages */
    confirmOrInterrupt: Effect.fnUntraced(function*(
      message: string | undefined = undefined
    ) {
      const context = yield* CommandContext
      yield* confirmOrInterrupt(
        message
          ?? intl.value.formatMessage(
            { id: "handle.confirmation" },
            { action: context.action }
          )
      )
    }),
    /** Version of withDefaultToast that automatically includes the action name in the default messages and uses intl */
    withDefaultToast: <A, E>(
      self: Effect.Effect<A, E, CommandContext>,
      errorRenderer?: (e: E) => string | undefined // undefined falls back to default?
    ) =>
      Effect.gen(function*() {
        const { action } = yield* CommandContext

        const defaultWarnMessage = intl.value.formatMessage(
          { id: "handle.with_warnings" },
          { action }
        )
        const defaultErrorMessage = intl.value.formatMessage(
          { id: "handle.with_errors" },
          { action }
        )
        function renderError(e: E): string {
          if (errorRenderer) {
            const m = errorRenderer(e)
            if (m) {
              return m
            }
          }
          if (!S.is(SupportedErrors)(e) && !S.ParseResult.isParseError(e)) {
            if (typeof e === "object" && e !== null) {
              if ("message" in e) {
                return `${e.message}`
              }
              if ("_tag" in e) {
                return `${e._tag}`
              }
            }
            return ""
          }
          const e2: SupportedErrors | S.ParseResult.ParseError = e
          return Match.value(e2).pipe(
            Match.tags({
              ParseError: (e) => {
                console.warn(e.toString())
                return intl.value.formatMessage({ id: "validation.failed" })
              }
            }),
            Match.orElse((e) => `${e.message ?? e._tag ?? e}`)
          )
        }

        return yield* self.pipe(
          withToast({
            onWaiting: intl.value.formatMessage(
              { id: "handle.waiting" },
              { action }
            ),
            onSuccess: (a) =>
              intl.value.formatMessage({ id: "handle.success" }, { action })
              + (S.is(OperationSuccess)(a) && a.message ? "\n" + a.message : ""),
            onFailure: Option.match({
              onNone: () =>
                intl.value.formatMessage(
                  { id: "handle.unexpected_error" },
                  {
                    action,
                    error: "-" // TODO consider again Cause.pretty(cause), // will be reported to Sentry/Otel anyway..
                  }
                ),
              onSome: (e) =>
                S.is(OperationFailure)(e)
                  ? {
                    level: "warn",
                    message: defaultWarnMessage + e.message ? "\n" + e.message : ""
                  }
                  : `${defaultErrorMessage}:\n` + renderError(e)
            })
          })
        )
      }),
    /**
     * Define a Command
     * @param actionName The internal name of the action. will be used as Span. will be used to lookup user facing name via intl. `action.${actionName}`
     * @returns A function that can be called to execute the mutation, like directly in a `@click` handler. Error reporting is built-in.
     * the Effects **only** have access to the `CommandContext` service, which contains the user-facing action name.
     * The function also has the following properties:
     * - action: The user-facing name of the action, as defined in the intl messages. Can be used e.g as Button label.
     * - result: The Result of the mutation
     * - waiting: Whether the mutation is currently in progress. (shorthand for .result.waiting). Can be used e.g as Button loading/disabled state.
     * Reporting status to the user is recommended to use the `withDefaultToast` helper, or render the .result inline
     */
    fn: (actionName: string) =>
    // TODO constrain/type combinators
    <
      Eff extends YieldWrap<Effect.Effect<any, any, CommandContext | R>>,
      AEff,
      Args extends Array<any>,
      $WrappedEffectError = Eff extends YieldWrap<
        Effect.Effect<infer _, infer E, infer __>
      > ? E
        : never
    >(
      fn: (...args: Args) => Generator<Eff, AEff, CommandContext | R>,
      // TODO: combinators can freely take A, E, R and change it to whatever they want, as long as the end result Requires not more than CommandContext | R
      ...combinators: ((
        e: Effect.Effect<AEff, $WrappedEffectError, CommandContext>
      ) => Effect.Effect<AEff, $WrappedEffectError, CommandContext | R>)[]
    ) => {
      const action = intl.value.formatMessage({
        id: `action.${actionName}`,
        defaultMessage: actionName
      })
      const context = { action }

      const errorReporter = <A, E, R>(self: Effect.Effect<A, E, R>) =>
        self.pipe(
          Effect.tapErrorCause(
            Effect.fnUntraced(function*(cause) {
              if (Cause.isInterruptedOnly(cause)) {
                console.info(`Interrupted while trying to ${actionName}`)
                return
              }

              const fail = Cause.failureOption(cause)
              if (Option.isSome(fail)) {
                // if (fail.value._tag === "SuppressErrors") {
                //   console.info(
                //     `Suppressed error trying to ${action}`,
                //     fail.value,
                //   )
                //   return
                // }
                const message = `Failure trying to ${actionName}`
                yield* reportMessage(message, {
                  action: actionName,
                  error: fail.value
                })
                return
              }

              const extra = {
                action,
                message: `Unexpected Error trying to ${actionName}`
              }
              yield* reportRuntimeError(cause, extra)
            })
          )
        )

      // TODO: override span stack set by Effect.fn as it points here instead of to the caller of Command.fn.
      // perhaps copying Effect.fn implementation is better than using it?
      const handler = Effect.fn(actionName)(
        fn,
        ...(combinators as [any]),
        // all must be within the Effect.fn to fit within the Span
        Effect.provideService(CommandContext, context) as any, /* TODO */
        ((_: any) => Effect.annotateCurrentSpan({ action }).pipe(Effect.zipRight(_))) as any, /* TODO */
        errorReporter as any /* TODO */
      ) as (...args: Args) => Effect.Effect<AEff, $WrappedEffectError, R>

      const [result, mut] = asResult(handler)

      return computed(() =>
        Object.assign(
          flow(
            mut,
            runFork
            // (_) => {}
          ), /* make sure always create a new one, or the state won't properly propagate */
          {
            action,
            result,
            waiting: result.value.waiting
          }
        )
      )
    }
  }
}

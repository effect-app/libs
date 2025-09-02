/* eslint-disable @typescript-eslint/no-explicit-any */
import { asResult, type MakeIntlReturn, reportRuntimeError } from "@effect-app/vue"
import { reportMessage } from "@effect-app/vue/errorReporter"
import { type Result } from "@effect-atom/atom/Result"
import { Cause, Context, Effect, type Exit, flow, Match, Option, Runtime, S } from "effect-app"
import { SupportedErrors } from "effect-app/client"
import { OperationFailure, OperationSuccess } from "effect-app/Operations"
import { type RuntimeFiber } from "effect/Fiber"
import { type YieldWrap } from "effect/Utils"
import { computed, type ComputedRef } from "vue"
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
    "handle.unexpected_error2": "{action} unerwarteter Fehler, probieren sie es in kurze nochmals."
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
    "handle.unexpected_error2": "{action} unexpected error, please try again shortly."
  }
}

export class CommandContext extends Context.Tag("CommandContext")<
  CommandContext,
  { action: string }
>() {}

export const makeUseCommand = <Locale extends string, RT>(
  // NOTE: underscores to not collide with auto exports in nuxt apps
  _useIntl: MakeIntlReturn<Locale>["useIntl"],
  _useConfirm: ReturnType<typeof makeUseConfirm>,
  _useWithToast: ReturnType<typeof makeUseWithToast>,
  runtime: Runtime.Runtime<RT>
) =>
() => {
  const withToast = _useWithToast()
  const { intl } = _useIntl()
  const { confirmOrInterrupt } = _useConfirm()

  const runFork = Runtime.runFork(runtime)

  type CommandOut<Args extends Array<any>, A, E> = ComputedRef<
    ((...a: Args) => RuntimeFiber<Exit.Exit<A, E>, never>) & {
      action: string
      result: Result<A, E>
      waiting: boolean
    }
  >

  type CommandOutHelper<Args extends Array<any>, Eff extends Effect.Effect<any, any, any>> = CommandOut<
    Args,
    Effect.Effect.Success<Eff>,
    Effect.Effect.Error<Eff>
  >

  const makeCommand = (actionName: string) =>
  <Args extends ReadonlyArray<any>, A, E, R extends RT | CommandContext>(
    handler: (...args: Args) => Effect.Effect<A, E, R>
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

    const theHandler = flow(
      handler,
      // all must be within the Effect.fn to fit within the Span
      Effect.provideService(CommandContext, context),
      (_) => Effect.annotateCurrentSpan({ action }).pipe(Effect.zipRight(_)),
      errorReporter,
      Effect.withSpan(actionName)
    )

    const [result, mut] = asResult(theHandler)

    return computed(() =>
      Object.assign(
        flow(
          mut,
          runFork
          // (_) => {}
        ), /* make sure always create a new one, or the state won't properly propagate */
        {
          action,
          result: result.value,
          waiting: result.value.waiting
        }
      )
    )
  }

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
                  { id: "handle.unexpected_error2" },
                  {
                    action,
                    error: "" // TODO consider again Cause.pretty(cause), // will be reported to Sentry/Otel anyway.. and we shouldn't bother users with error dumps?
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
    fn: (actionName: string): {
      <Eff extends YieldWrap<Effect.Effect<any, any, RT | CommandContext>>, AEff, Args extends Array<any>>(
        body: (...args: Args) => Generator<Eff, AEff, never>
      ): CommandOut<
        Args,
        AEff,
        [Eff] extends [never] ? never
          : [Eff] extends [YieldWrap<Effect.Effect<infer _A, infer E, infer _R>>] ? E
          : never
      >
      <
        Eff extends YieldWrap<Effect.Effect<any, any, any>>,
        AEff,
        Args extends Array<any>,
        A extends Effect.Effect<any, any, RT | CommandContext>
      >(
        body: (...args: Args) => Generator<Eff, AEff, never>,
        a: (
          _: Effect.Effect<
            AEff,
            [Eff] extends [never] ? never
              : [Eff] extends [YieldWrap<Effect.Effect<infer _A, infer E, infer _R>>] ? E
              : never,
            [Eff] extends [never] ? never
              : [Eff] extends [YieldWrap<Effect.Effect<infer _A, infer _E, infer R>>] ? R
              : never
          > /* TODO ,
          ...args: NoInfer<Args> */
        ) => A
      ): CommandOutHelper<Args, A>
      <
        Eff extends YieldWrap<Effect.Effect<any, any, any>>,
        AEff,
        Args extends Array<any>,
        A,
        B extends Effect.Effect<any, any, RT | CommandContext>
      >(
        body: (...args: Args) => Generator<Eff, AEff, never>,
        a: (
          _: Effect.Effect<
            AEff,
            [Eff] extends [never] ? never
              : [Eff] extends [YieldWrap<Effect.Effect<infer _A, infer E, infer _R>>] ? E
              : never,
            [Eff] extends [never] ? never
              : [Eff] extends [YieldWrap<Effect.Effect<infer _A, infer _E, infer R>>] ? R
              : never
          > /* TODO ,
          ...args: NoInfer<Args> */
        ) => A,
        b: (_: A /* TODO , ...args: NoInfer<Args> */) => B
      ): CommandOutHelper<Args, B>
      <
        Eff extends YieldWrap<Effect.Effect<any, any, any>>,
        AEff,
        Args extends Array<any>,
        A,
        B,
        C extends Effect.Effect<any, any, RT | CommandContext>
      >(
        body: (...args: Args) => Generator<Eff, AEff, never>,
        a: (
          _: Effect.Effect<
            AEff,
            [Eff] extends [never] ? never
              : [Eff] extends [YieldWrap<Effect.Effect<infer _A, infer E, infer _R>>] ? E
              : never,
            [Eff] extends [never] ? never
              : [Eff] extends [YieldWrap<Effect.Effect<infer _A, infer _E, infer R>>] ? R
              : never
          > /* TODO ,
          ...args: NoInfer<Args> */
        ) => A,
        b: (_: A /* TODO , ...args: NoInfer<Args> */) => B,
        c: (_: B /* TODO , ...args: NoInfer<Args> */) => C
      ): CommandOutHelper<Args, C>
      <
        Eff extends YieldWrap<Effect.Effect<any, any, any>>,
        AEff,
        Args extends Array<any>,
        A,
        B,
        C,
        D extends Effect.Effect<any, any, RT | CommandContext>
      >(
        body: (...args: Args) => Generator<Eff, AEff, never>,
        a: (
          _: Effect.Effect<
            AEff,
            [Eff] extends [never] ? never
              : [Eff] extends [YieldWrap<Effect.Effect<infer _A, infer E, infer _R>>] ? E
              : never,
            [Eff] extends [never] ? never
              : [Eff] extends [YieldWrap<Effect.Effect<infer _A, infer _E, infer R>>] ? R
              : never
          > /* TODO ,
          ...args: NoInfer<Args> */
        ) => A,
        b: (_: A /* TODO , ...args: NoInfer<Args> */) => B,
        c: (_: B /* TODO , ...args: NoInfer<Args> */) => C,
        d: (_: C /* TODO , ...args: NoInfer<Args> */) => D
      ): CommandOutHelper<Args, D>
      <
        Eff extends YieldWrap<Effect.Effect<any, any, any>>,
        AEff,
        Args extends Array<any>,
        A,
        B,
        C,
        D,
        E extends Effect.Effect<any, any, RT | CommandContext>
      >(
        body: (...args: Args) => Generator<Eff, AEff, never>,
        a: (
          _: Effect.Effect<
            AEff,
            [Eff] extends [never] ? never
              : [Eff] extends [YieldWrap<Effect.Effect<infer _A, infer E, infer _R>>] ? E
              : never,
            [Eff] extends [never] ? never
              : [Eff] extends [YieldWrap<Effect.Effect<infer _A, infer _E, infer R>>] ? R
              : never
          > /* TODO ,
          ...args: NoInfer<Args> */
        ) => A,
        b: (_: A /* TODO , ...args: NoInfer<Args> */) => B,
        c: (_: B /* TODO , ...args: NoInfer<Args> */) => C,
        d: (_: C /* TODO , ...args: NoInfer<Args> */) => D,
        e: (_: D /* TODO , ...args: NoInfer<Args> */) => E
      ): CommandOutHelper<Args, E>
      <
        Eff extends YieldWrap<Effect.Effect<any, any, any>>,
        AEff,
        Args extends Array<any>,
        A,
        B,
        C,
        D,
        E,
        F extends Effect.Effect<any, any, RT | CommandContext>
      >(
        body: (...args: Args) => Generator<Eff, AEff, never>,
        a: (
          _: Effect.Effect<
            AEff,
            [Eff] extends [never] ? never
              : [Eff] extends [YieldWrap<Effect.Effect<infer _A, infer E, infer _R>>] ? E
              : never,
            [Eff] extends [never] ? never
              : [Eff] extends [YieldWrap<Effect.Effect<infer _A, infer _E, infer R>>] ? R
              : never
          > /* TODO ,
          ...args: NoInfer<Args> */
        ) => A,
        b: (_: A /* TODO , ...args: NoInfer<Args> */) => B,
        c: (_: B /* TODO , ...args: NoInfer<Args> */) => C,
        d: (_: C /* TODO , ...args: NoInfer<Args> */) => D,
        e: (_: D /* TODO , ...args: NoInfer<Args> */) => E,
        f: (_: E /* TODO , ...args: NoInfer<Args> */) => F
      ): CommandOutHelper<Args, F>
      <
        Eff extends YieldWrap<Effect.Effect<any, any, any>>,
        AEff,
        Args extends Array<any>,
        A,
        B,
        C,
        D,
        E,
        F,
        G extends Effect.Effect<any, any, RT | CommandContext>
      >(
        body: (...args: Args) => Generator<Eff, AEff, never>,
        a: (
          _: Effect.Effect<
            AEff,
            [Eff] extends [never] ? never
              : [Eff] extends [YieldWrap<Effect.Effect<infer _A, infer E, infer _R>>] ? E
              : never,
            [Eff] extends [never] ? never
              : [Eff] extends [YieldWrap<Effect.Effect<infer _A, infer _E, infer R>>] ? R
              : never
          > /* TODO ,
          ...args: NoInfer<Args> */
        ) => A,
        b: (_: A /* TODO , ...args: NoInfer<Args> */) => B,
        c: (_: B /* TODO , ...args: NoInfer<Args> */) => C,
        d: (_: C /* TODO , ...args: NoInfer<Args> */) => D,
        e: (_: D /* TODO , ...args: NoInfer<Args> */) => E,
        f: (_: E /* TODO , ...args: NoInfer<Args> */) => F,
        g: (_: F /* TODO , ...args: NoInfer<Args> */) => G
      ): CommandOutHelper<Args, G>
      <
        Eff extends YieldWrap<Effect.Effect<any, any, any>>,
        AEff,
        Args extends Array<any>,
        A,
        B,
        C,
        D,
        E,
        F,
        G,
        H extends Effect.Effect<any, any, RT | CommandContext>
      >(
        body: (...args: Args) => Generator<Eff, AEff, never>,
        a: (
          _: Effect.Effect<
            AEff,
            [Eff] extends [never] ? never
              : [Eff] extends [YieldWrap<Effect.Effect<infer _A, infer E, infer _R>>] ? E
              : never,
            [Eff] extends [never] ? never
              : [Eff] extends [YieldWrap<Effect.Effect<infer _A, infer _E, infer R>>] ? R
              : never
          > /* TODO ,
          ...args: NoInfer<Args> */
        ) => A,
        b: (_: A /* TODO , ...args: NoInfer<Args> */) => B,
        c: (_: B /* TODO , ...args: NoInfer<Args> */) => C,
        d: (_: C /* TODO , ...args: NoInfer<Args> */) => D,
        e: (_: D /* TODO , ...args: NoInfer<Args> */) => E,
        f: (_: E /* TODO , ...args: NoInfer<Args> */) => F,
        g: (_: F /* TODO , ...args: NoInfer<Args> */) => G,
        h: (_: G /* TODO , ...args: NoInfer<Args> */) => H
      ): CommandOutHelper<Args, H>
      <
        Eff extends YieldWrap<Effect.Effect<any, any, any>>,
        AEff,
        Args extends Array<any>,
        A,
        B,
        C,
        D,
        E,
        F,
        G,
        H,
        I extends Effect.Effect<any, any, RT | CommandContext>
      >(
        body: (...args: Args) => Generator<Eff, AEff, never>,
        a: (
          _: Effect.Effect<
            AEff,
            [Eff] extends [never] ? never
              : [Eff] extends [YieldWrap<Effect.Effect<infer _A, infer E, infer _R>>] ? E
              : never,
            [Eff] extends [never] ? never
              : [Eff] extends [YieldWrap<Effect.Effect<infer _A, infer _E, infer R>>] ? R
              : never
          > /* TODO ,
          ...args: NoInfer<Args> */
        ) => A,
        b: (_: A /* TODO , ...args: NoInfer<Args> */) => B,
        c: (_: B /* TODO , ...args: NoInfer<Args> */) => C,
        d: (_: C /* TODO , ...args: NoInfer<Args> */) => D,
        e: (_: D /* TODO , ...args: NoInfer<Args> */) => E,
        f: (_: E /* TODO , ...args: NoInfer<Args> */) => F,
        g: (_: F /* TODO , ...args: NoInfer<Args> */) => G,
        h: (_: G /* TODO , ...args: NoInfer<Args> */) => H,
        i: (_: H /* TODO , ...args: NoInfer<Args> */) => I
      ): CommandOutHelper<Args, I>
    } =>
    // TODO constrain/type combinators
    (
      fn: any,
      // TODO: combinators can freely take A, E, R and change it to whatever they want, as long as the end result Requires not more than CommandContext | R
      ...combinators: any[]
    ): any => {
      return makeCommand(actionName)(Effect.fnUntraced(fn, ...combinators as [any]) as any)
    },

    alt: makeCommand
  }
}

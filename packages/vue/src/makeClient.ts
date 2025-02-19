/* eslint-disable @typescript-eslint/no-explicit-any */
import type { Result } from "@effect-rx/rx/Result"
import * as Sentry from "@sentry/browser"
import { Cause, Effect, Exit, Match, Option, Runtime, S, Struct } from "effect-app"
import type { RequestHandler, RequestHandlerWithInput, TaggedRequestClassAny } from "effect-app/client/clientFor"
import { type SupportedErrors } from "effect-app/client/errors"
import { constant, pipe, tuple } from "effect-app/Function"
import type { OperationFailure } from "effect-app/Operations"
import { OperationSuccess } from "effect-app/Operations"
import type { Schema } from "effect-app/Schema"
import { dropUndefinedT } from "effect-app/utils"
import type { ComputedRef, Ref, ShallowRef } from "vue"
import { computed, ref, watch } from "vue"
import { tryCauseException } from "./errorReporter.js"
import { buildFieldInfoFromFieldsRoot } from "./form.js"
import { getRuntime } from "./lib.js"
import type { MakeIntlReturn } from "./makeIntl.js"
import { makeMutation, mutationResultToVue } from "./mutate.js"
import type { MutationOptions, Res } from "./mutate.js"
import { makeQuery } from "./query.js"

/**
 * Use this after handling an error yourself, still continueing on the Error track, but the error will not be reported.
 */
export class SuppressErrors extends Cause.YieldableError {
  readonly _tag = "SuppressErrors"
}

export type ResponseErrors = S.ParseResult.ParseError | SupportedErrors | SuppressErrors | OperationFailure

export interface Opts<
  A,
  E,
  R,
  I = void,
  A2 = A,
  E2 = E,
  R2 = R,
  ESuccess = never,
  RSuccess = never,
  EError = never,
  RError = never,
  EDefect = never,
  RDefect = never
> extends MutationOptions<A, E, R, A2, E2, R2, I> {
  /** set to `undefined` to use default message */
  successMessage?: ((a: A2, i: I) => Effect<string | undefined, ESuccess, RSuccess>) | undefined
  /** set to `undefined` to use default message */
  failMessage?: ((e: E2, i: I) => Effect<string | undefined, EError, RError>) | undefined
  /** set to `undefined` to use default message */
  defectMessage?: ((e: Cause.Cause<E2>, i: I) => Effect<string | undefined, EDefect, RDefect>) | undefined
}

export interface LowOpts<
  A,
  E,
  I = void,
  ESuccess = never,
  RSuccess = never,
  EError = never,
  RError = never,
  EDefect = never,
  RDefect = never
> {
  onSuccess: (a: A, i: I) => Effect<void, ESuccess, RSuccess>
  onFail: (e: E, i: I) => Effect<void, EError, RError>
  onDefect: (e: Cause.Cause<E>, i: I) => Effect<void, EDefect, RDefect>
}

export interface LowOptsOptional<
  A,
  E,
  R,
  I = void,
  A2 = A,
  E2 = E,
  R2 = R,
  ESuccess = never,
  RSuccess = never,
  EError = never,
  RError = never,
  EDefect = never,
  RDefect = never
> extends MutationOptions<A, E, R, A2, E2, R2, I> {
  onSuccess?: (a: A, i: I) => Effect<void, ESuccess, RSuccess>
  onFail?: (e: E, i: I) => Effect<void, EError, RError>
  onDefect?: (e: Cause.Cause<E>, i: I) => Effect<void, EDefect, RDefect>
}

type WithAction<A> = A & {
  action: string
}

// computed() takes a getter function and returns a readonly reactive ref
// object for the returned value from the getter.

type Resp<I, A, E, R, V = ComputedRef<Res<A, E>>> = readonly [
  V,
  WithAction<(I: I) => Effect<Exit<A, E>, never, R>>
]

type ActResp<A, E, R, V = ComputedRef<Res<A, E>>> = readonly [
  V,
  WithAction<Effect<Exit<A, E>, never, R>>
]

export const suppressToast = constant(Effect.succeed(undefined))

export function handleRequest<
  E extends ResponseErrors,
  A,
  R,
  I = void,
  ESuccess = never,
  RSuccess = never,
  EError = never,
  RError = never,
  EDefect = never,
  RDefect = never
>(
  f: Effect<A, E, R> | ((i: I) => Effect<A, E, R>),
  action: string,
  options: {
    onSuccess: (a: A, i: I) => Effect<void, ESuccess, RSuccess>
    onFail: (e: E, i: I) => Effect<void, EError, RError>
    onDefect: (e: Cause.Cause<E>, i: I) => Effect<void, EDefect, RDefect>
  }
) {
  const handleEffect = (i: any) => (self: Effect<A, E, R>) =>
    self.pipe(
      Effect.exit,
      Effect.tap(
        Exit.matchEffect({
          onSuccess: (r) => options.onSuccess(r, i),
          onFailure: (cause) =>
            Effect.gen(function*() {
              if (Cause.isInterruptedOnly(cause)) {
                console.info(`Interrupted while trying to ${action}`)
                return
              }

              const fail = Cause.failureOption(cause)
              if (Option.isSome(fail)) {
                if (fail.value._tag === "SuppressErrors") {
                  console.info(`Suppressed error trying to ${action}`, fail.value)
                  return
                }
                const message = `Failure trying to ${action}`
                console.warn(message, fail.value)
                Sentry.captureMessage(message, { extra: { action, error: fail.value } })
                yield* options.onFail(fail.value, i)
                return
              }

              const extra = {
                action,
                message: `Unexpected Error trying to ${action}`
              }
              console.error(extra.message, cause)
              Sentry.captureException(tryCauseException(cause, "defect"), { extra })

              yield* options.onDefect(cause, i)
            })
        })
      ),
      Effect.tapErrorCause((cause) =>
        Effect.sync(() => {
          const extra = {
            action,
            message: `Unexpected Error trying to handle errors for ${action}`
          }
          Sentry.captureException(tryCauseException(cause, "unhandled"), { extra })
          console.error(Cause.pretty(cause), extra)
        })
      )
    )
  return Object.assign(
    Effect.isEffect(f)
      ? pipe(
        f,
        handleEffect(void 0)
      )
      : (i: I) =>
        pipe(
          f(i),
          handleEffect(i)
        ),
    { action }
  )
}

export const makeClient = <Locale extends string, R>(
  useIntl: MakeIntlReturn<Locale>["useIntl"],
  useToast: () => {
    error: (message: string) => void
    warning: (message: string) => void
    success: (message: string) => void
  },
  runtime: ShallowRef<Runtime.Runtime<R> | undefined>,
  messages: Record<string, string | undefined> = {}
) => {
  // making sure names do not collide with auto exports in nuxt apps, please do not rename..
  const _useSafeMutation = makeMutation()
  const _useSafeQuery = makeQuery(runtime)
  const _useHandleRequestWithToast = () => {
    const toast = useToast()
    const { intl } = useIntl()

    return handleRequestWithToast
    /**
     * Pass a function that returns a Promise.
     * Returns an execution function which reports errors as Toast.
     */
    function handleRequestWithToast<
      A,
      E extends ResponseErrors,
      R,
      I = void,
      A2 = A,
      E2 extends ResponseErrors = E,
      R2 = R,
      ESuccess = never,
      RSuccess = never,
      EError = never,
      RError = never,
      EDefect = never,
      RDefect = never
    >(
      f: Effect<A2, E2, R2> | ((i: I) => Effect<A2, E2, R2>),
      action: string,
      options: Opts<A, E, R, I, A2, E2, R2, ESuccess, RSuccess, EError, RError, EDefect, RDefect> = {}
    ) {
      const actionMessage = messages[action] ?? action
      const defaultWarnMessage = intl.value.formatMessage(
        { id: "handle.with_warnings" },
        { action: actionMessage }
      )
      const defaultSuccessMessage = intl.value.formatMessage(
        { id: "handle.success" },
        { action: actionMessage }
      )
      const defaultErrorMessage = intl.value.formatMessage(
        { id: "handle.with_errors" },
        { action: actionMessage }
      )

      return handleRequest<E2, A2, R2, any, ESuccess, RSuccess, EError, RError, EDefect, RDefect>(f, action, {
        onSuccess: (a, i) =>
          Effect.gen(function*() {
            const message = options.successMessage ? yield* options.successMessage(a, i) : defaultSuccessMessage
              + (S.is(OperationSuccess)(a) && a.message
                ? "\n" + a.message
                : "")
            if (message) {
              toast.success(message)
            }
          }),
        onFail: (e, i) =>
          Effect.gen(function*() {
            if (!options.failMessage && e._tag === "OperationFailure") {
              toast.warning(
                defaultWarnMessage + e.message
                  ? "\n" + e.message
                  : ""
              )
              return
            }

            const message = options.failMessage
              ? yield* options.failMessage(e, i)
              : `${defaultErrorMessage}:\n` + renderError(e)
            if (message) {
              toast.error(message)
            }
          }),
        onDefect: (cause, i) =>
          Effect.gen(function*() {
            const message = options.defectMessage
              ? yield* options.defectMessage(cause, i)
              : intl.value.formatMessage(
                { id: "handle.unexpected_error" },
                {
                  action: actionMessage,
                  error: Cause.pretty(cause)
                }
              )
            if (message) {
              toast.error(message)
            }
          })
      })
    }

    function renderError(e: ResponseErrors): string {
      return Match.value(e).pipe(
        Match.tags({
          // HttpErrorRequest: e =>
          //   intl.value.formatMessage(
          //     { id: "handle.request_error" },
          //     { error: `${e.error}` },
          //   ),
          // HttpErrorResponse: e =>
          //   e.response.status >= 500 ||
          //   e.response.body._tag !== "Some" ||
          //   !e.response.body.value
          //     ? intl.value.formatMessage(
          //         { id: "handle.error_response" },
          //         {
          //           error: `${
          //             e.response.body._tag === "Some" && e.response.body.value
          //               ? parseError(e.response.body.value)
          //               : "Unknown"
          //           } (${e.response.status})`,
          //         },
          //       )
          //     : intl.value.formatMessage(
          //         { id: "handle.unexpected_error" },
          //         {
          //           error:
          //             JSON.stringify(e.response.body, undefined, 2) +
          //             "( " +
          //             e.response.status +
          //             ")",
          //         },
          //       ),
          // ResponseError: e =>
          //   intl.value.formatMessage(
          //     { id: "handle.response_error" },
          //     { error: `${e.error}` },
          //   ),
          ParseError: (e) => {
            console.warn(e.toString())
            return intl.value.formatMessage({ id: "validation.failed" })
          }
        }),
        Match.orElse((e) =>
          intl.value.formatMessage(
            { id: "handle.unexpected_error" },
            {
              error: `${e.message ?? e._tag ?? e}`
            }
          )
        )
      )
    }
  }

  /**
   * Pass a function that returns an Effect, e.g from a client action, give it a name.
   * Returns a tuple with raw Result and execution function which reports success and errors as Toast.
   */
  const _useAndHandleMutationResult: {
    <
      I,
      E extends ResponseErrors,
      A,
      R,
      Request extends TaggedRequestClassAny,
      A2 = A,
      E2 extends ResponseErrors = E,
      R2 = R,
      ESuccess = never,
      RSuccess = never,
      EError = never,
      RError = never,
      EDefect = never,
      RDefect = never
    >(
      self: RequestHandlerWithInput<I, A, E, R, Request>,
      action: string,
      options?: Opts<A, E, R, I, A2, E2, R2, ESuccess, RSuccess, EError, RError, EDefect, RDefect>
    ): Resp<I, A2, E2, R2, Readonly<Ref<Result<A2, E2>, Result<A2, E2>>>>
    <
      E extends ResponseErrors,
      A,
      R,
      Request extends TaggedRequestClassAny,
      A2 = A,
      E2 extends ResponseErrors = E,
      R2 = R,
      ESuccess = never,
      RSuccess = never,
      EError = never,
      RError = never,
      EDefect = never,
      RDefect = never
    >(
      self: RequestHandler<A, E, R, Request>,
      action: string,
      options?: Opts<A, E, R, void, A2, E2, R2, ESuccess, RSuccess, EError, RError, EDefect, RDefect>
    ): ActResp<A2, E2, R2, Readonly<Ref<Result<A2, E2>, Result<A2, E2>>>>
  } = (
    self: any,
    action: any,
    options?: Opts<any, any, any, any, any, any, any, any, any, any, any, any, any>
  ): any => {
    const handleRequestWithToast = _useHandleRequestWithToast()
    const [a, b] = _useSafeMutation({
      ...self,
      handler: Effect.isEffect(self.handler)
        ? (pipe(
          Effect.annotateCurrentSpan({ action }),
          Effect.andThen(self.handler)
        ) as any)
        : (...args: any[]) =>
          pipe(
            Effect.annotateCurrentSpan({ action }),
            Effect.andThen(self.handler(...args))
          )
    }, options ? dropUndefinedT(options) : undefined)

    return tuple(
      a,
      handleRequestWithToast(b as any, action, options)
    )
  }

  /**
   * Pass a function that returns an Effect, e.g from a client action, give it a name.
   * Returns a tuple with state ref and execution function which reports success and errors as Toast.
   */
  const _useAndHandleMutation: {
    <
      I,
      E extends ResponseErrors,
      A,
      R,
      Request extends TaggedRequestClassAny,
      A2 = A,
      E2 extends ResponseErrors = E,
      R2 = R,
      ESuccess = never,
      RSuccess = never,
      EError = never,
      RError = never,
      EDefect = never,
      RDefect = never
    >(
      self: RequestHandlerWithInput<I, A, E, R, Request>,
      action: string,
      options?: Opts<A, E, R, I, A2, E2, R2, ESuccess, RSuccess, EError, RError, EDefect, RDefect>
    ): Resp<I, A2, E2, R2>
    <
      E extends ResponseErrors,
      A,
      R,
      Request extends TaggedRequestClassAny,
      A2 = A,
      E2 extends ResponseErrors = E,
      R2 = R,
      ESuccess = never,
      RSuccess = never,
      EError = never,
      RError = never,
      EDefect = never,
      RDefect = never
    >(
      self: RequestHandler<A, E, R, Request>,
      action: string,
      options?: Opts<A, E, R, void, A2, E2, R2, ESuccess, RSuccess, EError, RError, EDefect, RDefect>
    ): ActResp<A2, E2, R2>
  } = (
    self: any,
    action: any,
    options?: Opts<any, any, any, any, any, any, any, any, any, any, any, any, any>
  ): any => {
    const [a, b] = _useAndHandleMutationResult(self, action, options)

    return tuple(
      computed(() => mutationResultToVue(a.value)),
      b
    )
  }

  /**
   * The same as @see useAndHandleMutation, but does not display any toasts by default.
   * Messages for success, error and defect toasts can be provided in the Options.
   */
  const _useAndHandleMutationSilently: {
    <
      I,
      E extends ResponseErrors,
      A,
      R,
      Request extends TaggedRequestClassAny,
      A2 = A,
      E2 extends ResponseErrors = E,
      R2 = R,
      ESuccess = never,
      RSuccess = never,
      EError = never,
      RError = never,
      EDefect = never,
      RDefect = never
    >(
      self: RequestHandlerWithInput<I, A, E, R, Request>,
      action: string,
      options?: Opts<A, E, R, I, A2, E2, R2, ESuccess, RSuccess, EError, RError, EDefect, RDefect>
    ): Resp<I, A2, E2, R>
    <
      E extends ResponseErrors,
      A,
      R,
      Request extends TaggedRequestClassAny,
      A2 = A,
      E2 extends ResponseErrors = E,
      R2 = R,
      ESuccess = never,
      RSuccess = never,
      EError = never,
      RError = never,
      EDefect = never,
      RDefect = never
    >(
      self: RequestHandler<A, E, R, Request>,
      action: string,
      options?: Opts<A, E, R, void, A2, E2, R2, ESuccess, RSuccess, EError, RError, EDefect, RDefect>
    ): ActResp<void, never, R>
  } = _makeUseAndHandleMutation({
    successMessage: suppressToast,
    failMessage: suppressToast,
    defectMessage: suppressToast
  }) as any

  /**
   * The same as @see useAndHandleMutation, but does not act on success, error or defect by default.
   * Actions for success, error and defect can be provided in the Options.
   */
  const _useAndHandleMutationCustom: {
    <
      I,
      E extends ResponseErrors,
      A,
      R,
      Request extends TaggedRequestClassAny,
      A2 = A,
      E2 extends ResponseErrors = E,
      R2 = R,
      ESuccess = never,
      RSuccess = never,
      EError = never,
      RError = never,
      EDefect = never,
      RDefect = never
    >(
      self: RequestHandlerWithInput<I, A, E, R, Request>,
      action: string,
      options?: LowOptsOptional<A, E, R, I, A2, E2, R2, ESuccess, RSuccess, EError, RError, EDefect, RDefect>
    ): Resp<I, A2, E2, R2>
    <
      E extends ResponseErrors,
      A,
      R,
      Request extends TaggedRequestClassAny,
      A2 = A,
      E2 extends ResponseErrors = E,
      R2 = R,
      ESuccess = never,
      RSuccess = never,
      EError = never,
      RError = never,
      EDefect = never,
      RDefect = never
    >(
      self: RequestHandler<A, E, R, Request>,
      action: string,
      options?: LowOptsOptional<A, E, R, void, A2, E2, R2, ESuccess, RSuccess, EError, RError, EDefect, RDefect>
    ): ActResp<A2, E2, R2>
  } = (self: any, action: string, options: any) => {
    const [a, b] = _useSafeMutation({
      ...self,
      handler: Effect.isEffect(self.handler)
        ? (pipe(
          Effect.annotateCurrentSpan({ action }),
          Effect.andThen(self.handler)
        ) as any)
        : (...args: any[]) =>
          pipe(
            Effect.annotateCurrentSpan({ action }),
            Effect.andThen(self.handler(...args))
          )
    }, options ? dropUndefinedT(options) : undefined)

    return tuple(
      computed(() => mutationResultToVue(a.value)),
      handleRequest(b as any, action, {
        onSuccess: suppressToast,
        onDefect: suppressToast,
        onFail: suppressToast,
        ...options
      })
    ) as any
  }

  function _makeUseAndHandleMutation(
    defaultOptions?: Opts<any, any, any, any, any, any, any, any, any>
  ) {
    return ((self: any, action: any, options: any) => {
      return _useAndHandleMutation(
        self,
        action,
        { ...defaultOptions, ...options }
      )
    }) as unknown as {
      <
        I,
        E extends ResponseErrors,
        A,
        R,
        Request extends TaggedRequestClassAny,
        A2 = A,
        E2 extends ResponseErrors = E,
        R2 = R,
        ESuccess = never,
        RSuccess = never,
        EError = never,
        RError = never,
        EDefect = never,
        RDefect = never
      >(
        self: RequestHandlerWithInput<I, A, E, R, Request>,
        action: string,
        options?: Opts<A, E, R, I, A2, E2, R2, ESuccess, RSuccess, EError, RError, EDefect, RDefect>
      ): Resp<I, A2, E2, R2>
      <
        E extends ResponseErrors,
        A,
        Request extends TaggedRequestClassAny,
        A2 = A,
        E2 extends ResponseErrors = E,
        R2 = R,
        ESuccess = never,
        RSuccess = never,
        EError = never,
        RError = never,
        EDefect = never,
        RDefect = never
      >(
        self: RequestHandler<A, E, R, Request>,
        action: string,
        options?: Opts<A, E, R, void, A2, E2, R2, ESuccess, RSuccess, EError, RError, EDefect, RDefect>
      ): ActResp<A2, E2, R2>
    }
  }

  const _useSafeMutationWithState = <I, E, A, Request extends TaggedRequestClassAny>(
    self: RequestHandlerWithInput<I, A, E, R, Request>
  ) => {
    const [a, b] = _useSafeMutation(self)

    return tuple(
      computed(() => mutationResultToVue(a.value)),
      b
    )
  }

  const _buildFormFromSchema = <
    From extends Record<PropertyKey, any>,
    To extends Record<PropertyKey, any>,
    C extends Record<PropertyKey, any>,
    OnSubmitA
  >(
    s:
      & Schema<
        To,
        From,
        R
      >
      & { new(c: C): any; extend: any; fields: S.Struct.Fields },
    state: Ref<Omit<From, "_tag">>,
    onSubmit: (a: To) => Effect<OnSubmitA, never, R>
  ) => {
    const fields = buildFieldInfoFromFieldsRoot(s).fields
    const schema = S.Struct(Struct.omit(s.fields, "_tag")) as any
    const parse = S.decodeUnknown<any, any, R>(schema)
    const isDirty = ref(false)
    const isValid = ref(true)
    const isLoading = ref(false)
    const runPromise = Runtime.runPromise(getRuntime(runtime))

    const submit1 =
      (onSubmit: (a: To) => Effect<OnSubmitA, never, R>) => async <T extends Promise<{ valid: boolean }>>(e: T) => {
        isLoading.value = true
        try {
          const r = await e
          if (!r.valid) return
          return await runPromise(onSubmit(new s(await runPromise(parse(state.value)))))
        } finally {
          isLoading.value = false
        }
      }
    const submit = submit1(onSubmit)

    watch(
      state,
      (v) => {
        // TODO: do better
        isDirty.value = JSON.stringify(v) !== JSON.stringify(state.value)
      },
      { deep: true }
    )

    const submitFromState = Effect.gen(function*() {
      return yield* onSubmit(yield* parse(state.value))
    })

    return {
      fields,
      /** optimized for Vuetify v-form submit callback */
      submit,
      /** optimized for Native form submit callback or general use */
      submitFromState,
      isDirty,
      isValid,
      isLoading
    }
  }

  return {
    useSafeMutationWithState: _useSafeMutationWithState,
    useAndHandleMutation: _useAndHandleMutation,
    useAndHandleMutationResult: _useAndHandleMutationResult,
    useAndHandleMutationSilently: _useAndHandleMutationSilently,
    useAndHandleMutationCustom: _useAndHandleMutationCustom,
    makeUseAndHandleMutation: _makeUseAndHandleMutation,
    useHandleRequestWithToast: _useHandleRequestWithToast,
    buildFormFromSchema: _buildFormFromSchema,
    useSafeQuery: _useSafeQuery,
    useSafeMutation: _useSafeMutation
  }
}

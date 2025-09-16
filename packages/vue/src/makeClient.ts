/* eslint-disable @typescript-eslint/no-explicit-any */
import * as Result from "@effect-atom/atom/Result"
import { type InitialDataFunction, type InvalidateOptions, type InvalidateQueryFilters, isCancelledError, type QueryObserverResult, type RefetchOptions, type UseQueryReturnType } from "@tanstack/vue-query"
import { camelCase } from "change-case"
import { Cause, Effect, Exit, type ManagedRuntime, Match, Option, Runtime, S, Struct } from "effect-app"
import { type ApiClientFactory } from "effect-app/client"
import type { RequestHandler, RequestHandlers, RequestHandlerWithInput, Requests, TaggedRequestClassAny } from "effect-app/client/clientFor"
import { ErrorSilenced, type SupportedErrors } from "effect-app/client/errors"
import { constant, identity, pipe, tuple } from "effect-app/Function"
import { type OperationFailure, OperationSuccess } from "effect-app/Operations"
import { type Schema } from "effect-app/Schema"
import { dropUndefinedT } from "effect-app/utils"
import { type RuntimeFiber } from "effect/Fiber"
import { computed, type ComputedRef, onBeforeUnmount, type Ref, ref, watch, type WatchSource } from "vue"
import { reportMessage } from "./errorReporter.js"
import { type Commander, CommanderStatic } from "./experimental/commander.js"
import { I18n } from "./experimental/intl.js"
import { type CommanderResolved, makeUseCommand } from "./experimental/makeUseCommand.js"
import { Toast } from "./experimental/toast.js"
import { buildFieldInfoFromFieldsRoot } from "./form.js"
import { reportRuntimeError } from "./lib.js"
import { asResult, makeMutation, type MutationOptions, type MutationOptionsBase, mutationResultToVue, type Res, useMakeMutation } from "./mutate.js"
import { type CustomDefinedInitialQueryOptions, type CustomUndefinedInitialQueryOptions, type KnownFiberFailure, makeQuery } from "./query.js"

const mapHandler = <A, E, R, I = void, A2 = A, E2 = E, R2 = R>(
  handler: Effect.Effect<A, E, R> | ((i: I) => Effect.Effect<A, E, R>),
  map: (self: Effect.Effect<A, E, R>, i: I) => Effect.Effect<A2, E2, R2>
) => Effect.isEffect(handler) ? map(handler, undefined as any) : (i: I) => map(handler(i), i)

export interface MutationExtensions<RT, Id extends string, I extends any[], A, E, R> {
  /** @see Command.wrap */
  wrap: Commander.CommanderWrap<RT, Id, Id, undefined, I, A, E, R>
  /** @see Command.fn */
  fn: Commander.CommanderFn<RT, Id, Id, undefined>
}

/** my other doc */
export interface MutationExtWithInput<
  RT,
  Id extends string,
  I extends any[],
  A,
  E,
  R
> extends Commander.CommandContextLocal<Id, Id>, MutationExtensions<RT, Id, I, A, E, R> {
  /**
   * Call the endpoint with input
   */
  (i: I): Effect.Effect<A, E, R>
}

/** my other doc */
export interface MutationExt<
  RT,
  Id extends string,
  A,
  E,
  R
> extends
  Commander.CommandContextLocal<Id, Id>,
  Commander.CommanderWrap<RT, Id, Id, undefined, [], A, E, R>,
  MutationExtensions<RT, Id, [], A, E, R>,
  Effect.Effect<A, E, R>
{
}

export type MutationWithExtensions<RT, Req> =
  & (Req extends RequestHandlerWithInput<infer _I, infer _A, infer _E, infer _R, infer _Request, infer Id>
    ? Commander.CommandContextLocal<Id, Id>
    : Req extends RequestHandler<infer _A, infer _E, infer _R, infer _Request, infer Id>
      ? Commander.CommandContextLocal<Id, Id>
    : never)
  & (Req extends RequestHandlerWithInput<infer I, infer A, infer E, infer R, infer _Request, infer Id>
    ? MutationExtWithInput<RT, Id, [I], A, E, R>
    : Req extends RequestHandler<infer A, infer E, infer R, infer _Request, infer Id>
      ? MutationExtWithInput<RT, Id, [], A, E, R>
    : never)

/**
 * Use this after handling an error yourself, still continueing on the Error track, but the error will not be reported.
 */
export class SuppressErrors extends Cause.YieldableError {
  readonly _tag = "SuppressErrors"
  readonly [ErrorSilenced] = true
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
  successMessage?: ((a: A2, i: I) => Effect.Effect<string | undefined, ESuccess, RSuccess>) | undefined
  /** set to `undefined` to use default message */
  failMessage?: ((e: E2, i: I) => Effect.Effect<string | undefined, EError, RError>) | undefined
  /** set to `undefined` to use default message */
  defectMessage?: ((e: Cause.Cause<E2>, i: I) => Effect.Effect<string | undefined, EDefect, RDefect>) | undefined
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
  onSuccess: (a: A, i: I) => Effect.Effect<void, ESuccess, RSuccess>
  onFail: (e: E, i: I) => Effect.Effect<void, EError, RError>
  onDefect: (e: Cause.Cause<E>, i: I) => Effect.Effect<void, EDefect, RDefect>
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
  onSuccess?: (a: A, i: I) => Effect.Effect<void, ESuccess, RSuccess>
  onFail?: (e: E, i: I) => Effect.Effect<void, EError, RError>
  onDefect?: (e: Cause.Cause<E>, i: I) => Effect.Effect<void, EDefect, RDefect>
}

type WithAction<A> = A & {
  action: string
}

// computed() takes a getter function and returns a readonly reactive ref
// object for the returned value from the getter.

type Resp<I, A, E, R, V = ComputedRef<Res<A, E>>> = readonly [
  V,
  WithAction<(I: I) => Effect.Effect<Exit.Exit<A, E>, never, R>>
]

type ActResp<A, E, R, V = ComputedRef<Res<A, E>>> = readonly [
  V,
  WithAction<Effect.Effect<Exit.Exit<A, E>, never, R>>
]

export const suppressToast = constant(Effect.succeed(undefined))

/** handles errors as specified and reports defects */
function handleRequest<
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
  f: Effect.Effect<Exit.Exit<A, E>, never, R> | ((i: I) => Effect.Effect<Exit.Exit<A, E>, never, R>),
  id: string,
  action: string,
  options: {
    onSuccess: (a: A, i: I) => Effect.Effect<void, ESuccess, RSuccess>
    onFail: (e: E, i: I) => Effect.Effect<void, EError, RError>
    onDefect: (e: Cause.Cause<E>, i: I) => Effect.Effect<void, EDefect, RDefect>
  }
) {
  const handleEffect = (i: any) => (self: Effect.Effect<Exit.Exit<A, E>, never, R>) =>
    self.pipe(
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
                yield* reportMessage(message, { action, error: fail.value })
                yield* options.onFail(fail.value, i)
                return
              }

              const extra = {
                action,
                message: `Unexpected Error trying to ${action}`
              }
              yield* reportRuntimeError(cause, extra)

              yield* options.onDefect(cause, i)
            })
        })
      ),
      Effect.withSpan(`mutation ${id}`, { captureStackTrace: false })
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

const _useMutation = makeMutation()

/**
 * Pass an Effect or a function that returns an Effect, e.g from a client action
 * Executes query cache invalidation based on default rules or provided option.
 * adds a span with the mutation id
 */
export const useMutation: typeof _useMutation = <
  I,
  E,
  A,
  R,
  Request extends TaggedRequestClassAny,
  Name extends string
>(
  self: RequestHandlerWithInput<I, A, E, R, Request, Name> | RequestHandler<A, E, R, Request, Name>,
  options?: MutationOptionsBase
) =>
  Object.assign(
    mapHandler(
      _useMutation(self as any, options),
      Effect.withSpan(`mutation ${self.id}`, { captureStackTrace: false })
    ) as any,
    { id: self.id }
  )

/**
 * Pass an Effect or a function that returns an Effect, e.g from a client action
 * Executes query cache invalidation based on default rules or provided option.
 * adds a span with the mutation id
 */
export const useMutationInt = (): typeof _useMutation => {
  const _useMutation = useMakeMutation()
  return <
    I,
    E,
    A,
    R,
    Request extends TaggedRequestClassAny,
    Name extends string
  >(
    self: RequestHandlerWithInput<I, A, E, R, Request, Name> | RequestHandler<A, E, R, Request, Name>,
    options?: MutationOptionsBase
  ) =>
    Object.assign(
      mapHandler(
        _useMutation(self as any, options),
        Effect.withSpan(`mutation ${self.id}`, { captureStackTrace: false })
      ) as any,
      { id: self.id }
    )
}

export class LegacyMutationImpl<RT> {
  constructor(
    private readonly getRuntime: () => Runtime.Runtime<RT>,
    private readonly toast: Toast,
    private readonly intl: I18n
  ) {}

  /**
   * Effect results are converted to Exit, so errors are ignored by default.
   * you should use the result ref to render errors!
   * @deprecated use `Command.fn` and friends instead
   */
  readonly useSafeMutation: {
    /**
     * Effect results are converted to Exit, so errors are ignored by default.
     * you should use the result ref to render errors!
     * @deprecated use `Command.fn` and friends instead
     */
    <I, E, A, R, Request extends TaggedRequestClassAny, Name extends string, A2 = A, E2 = E, R2 = R>(
      self: RequestHandlerWithInput<I, A, E, R, Request, Name>,
      options?: MutationOptions<A, E, R, A2, E2, R2, I>
    ): readonly [
      ComputedRef<Result.Result<A2, E2>>,
      (i: I) => Effect.Effect<Exit.Exit<A2, E2>, never, R2>
    ]
    /**
     * Effect results are converted to Exit, so errors are ignored by default.
     * you should use the result ref to render errors!
     * @deprecated use `Command.fn` and friends instead
     */
    <E, A, R, Request extends TaggedRequestClassAny, Name extends string, A2 = A, E2 = E, R2 = R>(
      self: RequestHandler<A, E, R, Request, Name>,
      options?: MutationOptions<A, E, R, A2, E2, R2>
    ): readonly [
      ComputedRef<Result.Result<A2, E2>>,
      Effect.Effect<Exit.Exit<A2, E2>, never, R2>
    ]
  } = <I, E, A, R, Request extends TaggedRequestClassAny, Name extends string, A2 = A, E2 = E, R2 = R>(
    self: RequestHandlerWithInput<I, A, E, R, Request, Name> | RequestHandler<A, E, R, Request, Name>,
    options?: MutationOptions<A, E, R, A2, E2, R2, I>
  ) => {
    const unsafe = _useMutation(self as any, options)

    type MH = NonNullable<NonNullable<typeof options>["mapHandler"]>
    const mh = options?.mapHandler ?? identity as MH

    const [a, b] = asResult(mapHandler(mapHandler(unsafe as any, mh), Effect.tapDefect(reportRuntimeError)) as any)
    return [
      a,
      mapHandler(
        b,
        Effect.withSpan(`mutation ${self.id}`, { captureStackTrace: false })
      )
    ] as const as any
  }

  /** handles errors as toasts and reports defects
   * @deprecated use `Command.fn` and friends instead
   */
  readonly useHandleRequestWithToast = () => {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const self = this
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
      f: Effect.Effect<Exit.Exit<A2, E2>, never, R2> | ((i: I) => Effect.Effect<Exit.Exit<A2, E2>, never, R2>),
      id: string,
      action: string,
      options: Opts<A, E, R, I, A2, E2, R2, ESuccess, RSuccess, EError, RError, EDefect, RDefect> = {}
    ) {
      const actionMessage = self.intl.formatMessage({ id: `action.${action}`, defaultMessage: action })
      const defaultWarnMessage = self.intl.formatMessage(
        { id: "handle.with_warnings" },
        { action: actionMessage }
      )
      const defaultSuccessMessage = self.intl.formatMessage(
        { id: "handle.success" },
        { action: actionMessage }
      )
      const defaultErrorMessage = self.intl.formatMessage(
        { id: "handle.with_errors" },
        { action: actionMessage }
      )

      return handleRequest<E2, A2, R2, any, ESuccess, RSuccess, EError, RError, EDefect, RDefect>(f, id, action, {
        onSuccess: Effect.fnUntraced(function*(a, i) {
          const message = options.successMessage ? yield* options.successMessage(a, i) : defaultSuccessMessage
            + (S.is(OperationSuccess)(a) && a.message
              ? "\n" + a.message
              : "")
          if (message) {
            yield* self.toast.success(message)
          }
        }),
        onFail: Effect.fnUntraced(function*(e, i) {
          if (!options.failMessage && e._tag === "OperationFailure") {
            yield* self.toast.warning(
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
            yield* self.toast.error(message)
          }
        }),
        onDefect: Effect.fnUntraced(function*(cause, i) {
          const message = options.defectMessage
            ? yield* options.defectMessage(cause, i)
            : self.intl.formatMessage(
              { id: "handle.unexpected_error" },
              {
                action: actionMessage,
                error: Cause.pretty(cause)
              }
            )
          if (message) {
            yield* self.toast.error(message)
          }
        })
      })
    }

    function renderError(e: ResponseErrors): string {
      return Match.value(e).pipe(
        Match.tags({
          // HttpErrorRequest: e =>
          //   this.intl.value.formatMessage(
          //     { id: "handle.request_error" },
          //     { error: `${e.error}` },
          //   ),
          // HttpErrorResponse: e =>
          //   e.response.status >= 500 ||
          //   e.response.body._tag !== "Some" ||
          //   !e.response.body.value
          //     ? this.intl.value.formatMessage(
          //         { id: "handle.error_response" },
          //         {
          //           error: `${
          //             e.response.body._tag === "Some" && e.response.body.value
          //               ? parseError(e.response.body.value)
          //               : "Unknown"
          //           } (${e.response.status})`,
          //         },
          //       )
          //     : this.intl.value.formatMessage(
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
          //   this.intl.value.formatMessage(
          //     { id: "handle.response_error" },
          //     { error: `${e.error}` },
          //   ),
          ParseError: (e) => {
            console.warn(e.toString())
            return self.intl.formatMessage({ id: "validation.failed" })
          }
        }),
        Match.orElse((e) => `${e.message ?? e._tag ?? e}`)
      )
    }
  }

  /**
   * Pass a function that returns an Effect, e.g from a client action, give it a name.
   * Returns a tuple with raw Result and execution function which reports success and errors as Toast.
   * @deprecated use `Command.fn` and friends instead
   */
  readonly useAndHandleMutationResult: {
    /**
     * Pass a function that returns an Effect, e.g from a client action, give it a name.
     * Returns a tuple with raw Result and execution function which reports success and errors as Toast.
     * @deprecated use `Command.fn` and friends instead
     */
    <
      I,
      E extends ResponseErrors,
      A,
      R,
      Request extends TaggedRequestClassAny,
      Name extends string,
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
      self: RequestHandlerWithInput<I, A, E, R, Request, Name>,
      action: string,
      options?: Opts<A, E, R, I, A2, E2, R2, ESuccess, RSuccess, EError, RError, EDefect, RDefect>
    ): Resp<I, A2, E2, R2, ComputedRef<Result.Result<A2, E2>>>
    /**
     * Pass a function that returns an Effect, e.g from a client action, give it a name.
     * Returns a tuple with raw Result and execution function which reports success and errors as Toast.
     * @deprecated use `Command.fn` and friends instead
     */
    <
      E extends ResponseErrors,
      A,
      R,
      Request extends TaggedRequestClassAny,
      Name extends string,
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
      self: RequestHandler<A, E, R, Request, Name>,
      action: string,
      options?: Opts<A, E, R, void, A2, E2, R2, ESuccess, RSuccess, EError, RError, EDefect, RDefect>
    ): ActResp<A2, E2, R2, ComputedRef<Result.Result<A2, E2>>>
  } = <E extends ResponseErrors, A, R, Request extends TaggedRequestClassAny, Name extends string, I>(
    self: RequestHandlerWithInput<I, A, E, R, Request, Name> | RequestHandler<A, E, R, Request, Name>,
    action: any,
    options?: Opts<any, any, any, any, any, any, any, any, any, any, any, any, any>
  ): any => {
    const handleRequestWithToast = this.useHandleRequestWithToast()
    const handler = self.handler
    const unsafe = _useMutation({
      ...self,
      handler: Effect.isEffect(handler)
        ? (pipe(
          Effect.annotateCurrentSpan({ action }),
          Effect.zipRight(handler)
        ) as any)
        : (...args: [any]) =>
          pipe(
            Effect.annotateCurrentSpan({ action }),
            Effect.zipRight(handler(...args))
          )
    }, options ? dropUndefinedT(options) : undefined)

    type MH = NonNullable<NonNullable<typeof options>["mapHandler"]>
    const mh = options?.mapHandler ?? identity as MH

    // Effect.tapDefect(reportRuntimeError) handled in toast handler,
    const [a, b] = asResult(mapHandler(unsafe, mh) as any)

    return tuple(
      a,
      handleRequestWithToast(b as any, self.id, action, options)
    )
  }
  //

  /**
   * Pass a function that returns an Effect, e.g from a client action, give it a name.
   * Returns a tuple with state ref and execution function which reports success and errors as Toast.
   *
   * @deprecated use `Command.fn` and friends instead
   */
  readonly useAndHandleMutation: {
    /**
     * Pass a function that returns an Effect, e.g from a client action, give it a name.
     * Returns a tuple with state ref and execution function which reports success and errors as Toast.
     *
     * @deprecated use `Command.fn` and friends instead
     */
    <
      I,
      E extends ResponseErrors,
      A,
      R,
      Request extends TaggedRequestClassAny,
      Name extends string,
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
      self: RequestHandlerWithInput<I, A, E, R, Request, Name>,
      action: string,
      options?: Opts<A, E, R, I, A2, E2, R2, ESuccess, RSuccess, EError, RError, EDefect, RDefect>
    ): Resp<I, A2, E2, R2>
    /**
     * Pass a function that returns an Effect, e.g from a client action, give it a name.
     * Returns a tuple with state ref and execution function which reports success and errors as Toast.
     *
     * @deprecated use `Command.fn` and friends instead
     */
    <
      E extends ResponseErrors,
      A,
      R,
      Request extends TaggedRequestClassAny,
      Name extends string,
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
      self: RequestHandler<A, E, R, Request, Name>,
      action: string,
      options?: Opts<A, E, R, void, A2, E2, R2, ESuccess, RSuccess, EError, RError, EDefect, RDefect>
    ): ActResp<A2, E2, R2>
  } = (
    self: any,
    action: any,
    options?: Opts<any, any, any, any, any, any, any, any, any, any, any, any, any>
  ): any => {
    const [a, b] = this.useAndHandleMutationResult(self, action, options)

    return tuple(
      computed(() => mutationResultToVue(a.value)),
      b
    )
  }

  /** @deprecated use `Command.fn` and friends instead */
  readonly makeUseAndHandleMutation = (
    defaultOptions?: Opts<any, any, any, any, any, any, any, any, any>
  ) =>
    ((self: any, action: any, options: any) => {
      return this.useAndHandleMutation(
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
        Name extends string,
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
        self: RequestHandlerWithInput<I, A, E, R, Request, Name>,
        action: string,
        options?: Opts<A, E, R, I, A2, E2, R2, ESuccess, RSuccess, EError, RError, EDefect, RDefect>
      ): Resp<I, A2, E2, R2>
      <
        E extends ResponseErrors,
        A,
        R,
        Request extends TaggedRequestClassAny,
        Name extends string,
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
        self: RequestHandler<A, E, R, Request, Name>,
        action: string,
        options?: Opts<A, E, R, void, A2, E2, R2, ESuccess, RSuccess, EError, RError, EDefect, RDefect>
      ): ActResp<A2, E2, R2>
    }

  /**
   * The same as @see useAndHandleMutation, but does not display any toasts by default.
   * Messages for success, error and defect toasts can be provided in the Options.
   * @deprecated use `Command.fn` and friends instead
   */
  readonly useAndHandleMutationSilently: {
    /**
     * The same as @see useAndHandleMutation, but does not display any toasts by default.
     * Messages for success, error and defect toasts can be provided in the Options.
     * @deprecated use `Command.fn` and friends instead
     */
    <
      I,
      E extends ResponseErrors,
      A,
      R,
      Request extends TaggedRequestClassAny,
      Name extends string,
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
      self: RequestHandlerWithInput<I, A, E, R, Request, Name>,
      action: string,
      options?: Opts<A, E, R, I, A2, E2, R2, ESuccess, RSuccess, EError, RError, EDefect, RDefect>
    ): Resp<I, A2, E2, R>
    /**
     * The same as @see useAndHandleMutation, but does not display any toasts by default.
     * Messages for success, error and defect toasts can be provided in the Options.
     * @deprecated use `Command.fn` and friends instead
     */
    <
      E extends ResponseErrors,
      A,
      R,
      Request extends TaggedRequestClassAny,
      Name extends string,
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
      self: RequestHandler<A, E, R, Request, Name>,
      action: string,
      options?: Opts<A, E, R, void, A2, E2, R2, ESuccess, RSuccess, EError, RError, EDefect, RDefect>
    ): ActResp<void, never, R>
  } = this.makeUseAndHandleMutation({
    successMessage: suppressToast,
    failMessage: suppressToast,
    defectMessage: suppressToast
  }) as any

  /**
   * The same as @see useAndHandleMutation, but does not act on success, error or defect by default.
   * Actions for success, error and defect can be provided in the Options.
   * @deprecated use `Command.fn` and friends instead
   */
  readonly useAndHandleMutationCustom: {
    /**
     * The same as @see useAndHandleMutation, but does not act on success, error or defect by default.
     * Actions for success, error and defect can be provided in the Options.
     * @deprecated use `Command.fn` and friends instead
     */
    <
      I,
      E extends ResponseErrors,
      A,
      R,
      Request extends TaggedRequestClassAny,
      Name extends string,
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
      self: RequestHandlerWithInput<I, A, E, R, Request, Name>,
      action: string,
      options?: LowOptsOptional<A, E, R, I, A2, E2, R2, ESuccess, RSuccess, EError, RError, EDefect, RDefect>
    ): Resp<I, A2, E2, R2>
    /**
     * The same as @see useAndHandleMutation, but does not act on success, error or defect by default.
     * Actions for success, error and defect can be provided in the Options.
     * @deprecated use `Command.fn` and friends instead
     */
    <
      E extends ResponseErrors,
      A,
      R,
      Request extends TaggedRequestClassAny,
      Name extends string,
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
      self: RequestHandler<A, E, R, Request, Name>,
      action: string,
      options?: LowOptsOptional<A, E, R, void, A2, E2, R2, ESuccess, RSuccess, EError, RError, EDefect, RDefect>
    ): ActResp<A2, E2, R2>
  } = (self: any, action: string, options: any) => {
    const unsafe = _useMutation({
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

    type MH = NonNullable<NonNullable<typeof options>["mapHandler"]>
    const mh = options?.mapHandler ?? identity as MH

    const [a, b] = asResult(mapHandler(mapHandler(unsafe as any, mh), Effect.tapDefect(reportRuntimeError)) as any)

    return tuple(
      computed(() => mutationResultToVue(a.value)),
      handleRequest(b as any, self.id, action, {
        onSuccess: suppressToast,
        onDefect: suppressToast,
        onFail: suppressToast,
        ...options
      })
    ) as any
  }

  /**
   * Effect results are converted to Exit, so errors are ignored by default.
   * you should use the result ref to render errors!
   * @deprecated use `Command.fn` and friends instead
   */
  readonly useSafeMutationWithState: {
    /**
     * Effect results are converted to Exit, so errors are ignored by default.
     * you should use the result ref to render errors!
     * @deprecated use `Command.fn` and friends instead
     */
    <I, E, A, R, Request extends TaggedRequestClassAny, Name extends string, A2 = A, E2 = E, R2 = R>(
      self: RequestHandlerWithInput<I, A, E, R, Request, Name>,
      options?: MutationOptions<A, E, R, A2, E2, R2, I>
    ): readonly [
      ComputedRef<Res<A, E>>,
      (i: I) => Effect.Effect<Exit.Exit<A2, E2>, never, R2>
    ]
    /**
     * Effect results are converted to Exit, so errors are ignored by default.
     * you should use the result ref to render errors!
     * @deprecated use `Command.fn` and friends instead
     */
    <E, A, R, Request extends TaggedRequestClassAny, Name extends string, A2 = A, E2 = E, R2 = R>(
      self: RequestHandler<A, E, R, Request, Name>,
      options?: MutationOptions<A, E, R, A2, E2, R2>
    ): readonly [
      ComputedRef<Res<A, E>>,
      Effect.Effect<Exit.Exit<A2, E2>, never, R2>
    ]
  } = <I, E, A, R, Request extends TaggedRequestClassAny, Name extends string, A2 = A, E2 = E, R2 = R>(
    self: RequestHandlerWithInput<I, A, E, R, Request, Name> | RequestHandler<A, E, R, Request, Name>,
    options?: MutationOptions<A, E, R, A2, E2, R2, I>
  ) => {
    const [a, b] = this.useSafeMutation(self as any, options)

    return tuple(
      computed(() => mutationResultToVue(a.value)),
      b
    ) as any
  }

  /** @deprecated use OmegaForm */
  readonly buildFormFromSchema = <
    From extends Record<PropertyKey, any>,
    To extends Record<PropertyKey, any>,
    C extends Record<PropertyKey, any>,
    OnSubmitA
  >(
    s:
      & Schema<
        To,
        From,
        RT
      >
      & { new(c: C): any; extend: any; fields: S.Struct.Fields },
    state: Ref<Omit<From, "_tag">>,
    onSubmit: (a: To) => Effect.Effect<OnSubmitA, never, RT>
  ) => {
    const fields = buildFieldInfoFromFieldsRoot(s).fields
    const schema = S.Struct(Struct.omit(s.fields, "_tag")) as any
    const parse = S.decodeUnknown<any, any, RT>(schema)
    const isDirty = ref(false)
    const isValid = ref(true)
    const isLoading = ref(false)
    const runPromise = Runtime.runPromise(this.getRuntime())

    const submit1 =
      (onSubmit: (a: To) => Effect.Effect<OnSubmitA, never, RT>) =>
      async <T extends Promise<{ valid: boolean }>>(e: T) => {
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

    const submitFromStatePromise = () => runPromise(submitFromState)

    return {
      fields,
      /** optimized for Vuetify v-form submit callback */
      submit,
      /** optimized for Native form submit callback or general use */
      submitFromState,
      submitFromStatePromise,
      isDirty,
      isValid,
      isLoading
    }
  }
}

// @effect-diagnostics-next-line missingEffectServiceDependency:off
export class LegacyMutation extends Effect.Service<LegacyMutation>()("LegacyMutation", {
  effect: Effect.gen(function*() {
    const intl = yield* I18n
    const toast = yield* Toast

    return <R>(getRuntime: () => Runtime.Runtime<R>) => new LegacyMutationImpl(getRuntime, toast, intl)
  })
}) {}

export type ClientFrom<M extends Requests> = RequestHandlers<never, never, Omit<M, "meta">, M["meta"]["moduleName"]>

export class QueryImpl<R> {
  constructor(readonly getRuntime: () => Runtime.Runtime<R>) {
    this.useQuery = makeQuery(this.getRuntime)
  }
  /**
   * Effect results are passed to the caller, including errors.
   * @deprecated use client helpers instead (.query())
   */
  // TODO
  readonly useQuery: ReturnType<typeof makeQuery<R>>

  /**
   * The difference with useQuery is that this function will return a Promise you can await in the Setup,
   * which ensures that either there always is a latest value, or an error occurs on load.
   * So that Suspense and error boundaries can be used.
   * @deprecated use client helpers instead (.suspense())
   */
  readonly useSuspenseQuery: {
    <
      E,
      A,
      Request extends TaggedRequestClassAny,
      Name extends string
    >(
      self: RequestHandler<A, E, R, Request, Name>
    ): {
      <TData = A>(options?: CustomUndefinedInitialQueryOptions<A, E, TData>): Promise<
        readonly [
          ComputedRef<Result.Result<TData, E>>,
          ComputedRef<TData>,
          (
            options?: RefetchOptions
          ) => Effect.Effect<QueryObserverResult<TData, KnownFiberFailure<E>>>,
          UseQueryReturnType<any, any>
        ]
      >
      <TData = A>(
        options?: CustomDefinedInitialQueryOptions<A, E, TData> & {
          initialData: TData | InitialDataFunction<TData>
        }
      ): Promise<
        readonly [
          ComputedRef<Result.Result<TData, E>>,
          ComputedRef<TData>,
          (
            options?: RefetchOptions
          ) => Effect.Effect<QueryObserverResult<TData, KnownFiberFailure<E>>>,
          UseQueryReturnType<any, any>
        ]
      >
    }
    <
      Arg,
      E,
      A,
      Request extends TaggedRequestClassAny,
      Name extends string
    >(
      self: RequestHandlerWithInput<Arg, A, E, R, Request, Name>
    ): {
      <TData = A>(
        arg: Arg | WatchSource<Arg>,
        options?: CustomDefinedInitialQueryOptions<A, E, TData>
      ): Promise<
        readonly [
          ComputedRef<Result.Result<TData, E>>,
          ComputedRef<TData>,
          (
            options?: RefetchOptions
          ) => Effect.Effect<QueryObserverResult<TData, KnownFiberFailure<E>>>,
          UseQueryReturnType<any, any>
        ]
      >
      <TData = A>(arg: Arg | WatchSource<Arg>, options?: CustomUndefinedInitialQueryOptions<A, E, TData>): Promise<
        readonly [
          ComputedRef<Result.Result<TData, E>>,
          ComputedRef<TData>,
          (
            options?: RefetchOptions
          ) => Effect.Effect<QueryObserverResult<TData, KnownFiberFailure<E>>>,
          UseQueryReturnType<any, any>
        ]
      >
    }
  } = <Arg, E, A, Request extends TaggedRequestClassAny, Name extends string>(
    self: RequestHandlerWithInput<Arg, A, E, R, Request, Name> | RequestHandler<A, E, R, Request, Name>
  ) => {
    const runPromise = Runtime.runPromise(this.getRuntime())
    const q = this.useQuery(self as any) as any
    return (argOrOptions?: any, options?: any) => {
      const [resultRef, latestRef, fetch, uqrt] = q(argOrOptions, { ...options, suspense: true } // experimental_prefetchInRender: true }
      )

      const isMounted = ref(true)
      onBeforeUnmount(() => {
        isMounted.value = false
      })

      // @effect-diagnostics effect/missingEffectError:off
      const eff = Effect.gen(function*() {
        // we want to throw on error so that we can catch cancelled error and skip handling it
        // what's the difference with just calling `fetch` ?
        // we will receive a CancelledError which we will have to ignore in our ErrorBoundary, otherwise the user ends up on an error page even if the user e.g cancelled a navigation
        const r = yield* Effect.tryPromise(() => uqrt.suspense()).pipe(
          Effect.catchTag("UnknownException", (err) =>
            Runtime.isFiberFailure(err.error)
              ? Effect.failCause(err.error[Runtime.FiberFailureCauseId])
              : isCancelledError(err.error)
              ? Effect.interrupt
              : Effect.die(err.error))
        )
        if (!isMounted.value) {
          return yield* Effect.interrupt
        }
        const result = resultRef.value
        if (Result.isInitial(result)) {
          console.error("Internal Error: Promise should be resolved already", {
            self,
            argOrOptions,
            options,
            r,
            resultRef
          })
          return yield* Effect.die(
            "Internal Error: Promise should be resolved already"
          )
        }
        if (Result.isFailure(result)) {
          return yield* Exit.failCause(result.cause)
        }

        return [resultRef, latestRef, fetch, uqrt] as const
      })

      return runPromise(eff)
    }
  }
}

// somehow mrt.runtimeEffect doesnt work sync, but this workaround works fine? not sure why though as the layers are generally only sync
const managedRuntimeRt = <A, E>(mrt: ManagedRuntime.ManagedRuntime<A, E>) => mrt.runSync(Effect.runtime<A>())

type Base = I18n | Toast
export const makeClient = <RT>(
  // global, but only accessible after startup has completed
  getBaseMrt: () => ManagedRuntime.ManagedRuntime<RT | ApiClientFactory | Commander | LegacyMutation | Base, never>,
  clientFor_: ReturnType<typeof ApiClientFactory["makeFor"]>
) => {
  type R = RT | ApiClientFactory | Commander | LegacyMutation | Base
  const getRt = Effect.runtime<R>()
  const getBaseRt = () => managedRuntimeRt(getBaseMrt())
  const makeCommand = makeUseCommand<R>()
  const makeMutation = Effect.gen(function*() {
    const mut = yield* LegacyMutation

    return mut(() => getBaseMrt().runSync(getRt))
  })
  let cmd: Effect.Effect.Success<typeof makeCommand>
  const useCommand = () => cmd ??= getBaseMrt().runSync(makeCommand)
  let mut: Effect.Effect.Success<typeof makeMutation>
  const getMutation = () => mut ??= getBaseMrt().runSync(makeMutation)

  let m: ReturnType<typeof useMutationInt>
  const useMutation = () => m ??= useMutationInt()

  const keys = [
    "useSafeMutationWithState",
    "useAndHandleMutation",
    "useAndHandleMutationResult",
    "useAndHandleMutationSilently",
    "useAndHandleMutationCustom",
    "makeUseAndHandleMutation",
    "useHandleRequestWithToast",
    "buildFormFromSchema",
    "useSafeMutation"
  ] as const satisfies readonly (keyof ReturnType<typeof getMutation>)[]
  type mut = Pick<LegacyMutationImpl<R>, typeof keys[number]>

  const mutations = keys.reduce(
    (prev, cur) => {
      ;(prev as any)[cur] = ((...args: [any]) => {
        return (getMutation() as any)[cur](...args)
      }) as any
      return prev
    },
    {} as Pick<LegacyMutationImpl<R>, typeof keys[number]>
  )

  const query = new QueryImpl(getBaseRt)
  const useQuery = query.useQuery
  const useSuspenseQuery = query.useSuspenseQuery

  const mapQuery = <M extends Requests>(
    client: ClientFrom<M>
  ) => {
    const queries = Struct.keys(client).reduce(
      (acc, key) => {
        ;(acc as any)[camelCase(key) + "Query"] = Object.assign(useQuery(client[key] as any), {
          id: client[key].id
        })
        ;(acc as any)[camelCase(key) + "SuspenseQuery"] = Object.assign(useSuspenseQuery(client[key] as any), {
          id: client[key].id
        })
        return acc
      },
      {} as
        & {
          [Key in keyof typeof client as `${ToCamel<string & Key>}Query`]: typeof client[Key] extends
            RequestHandlerWithInput<infer I, infer A, infer E, infer _R, infer Request, infer Id>
            ? ReturnType<typeof useQuery<I, E, A, Request, Id>> & { id: Id }
            : typeof client[Key] extends RequestHandler<infer A, infer E, infer _R, infer Request, infer Id>
              ? ReturnType<typeof useQuery<E, A, Request, Id>> & { id: Id }
            : never
        }
        // todo: or suspense as an Option?
        & {
          [Key in keyof typeof client as `${ToCamel<string & Key>}SuspenseQuery`]: typeof client[Key] extends
            RequestHandlerWithInput<infer I, infer A, infer E, infer _R, infer Request, infer Id>
            ? ReturnType<typeof useSuspenseQuery<I, E, A, Request, Id>> & { id: Id }
            : typeof client[Key] extends RequestHandler<infer A, infer E, infer _R, infer Request, infer Id>
              ? ReturnType<typeof useSuspenseQuery<E, A, Request, Id>> & { id: Id }
            : never
        }
    )
    return queries
  }

  const mapMutation = <M extends Requests>(
    client: ClientFrom<M>
  ) => {
    const Command = useCommand()
    const mutation = useMutation()
    const mutations = Struct.keys(client).reduce(
      (acc, key) => {
        const mut = mutation(client[key] as any)
        const fn = Command.fn(client[key].id)
        const wrap = Command.wrap(mut)
        ;(acc as any)[camelCase(key) + "Mutation"] = Object.assign(
          mut,
          { wrap, fn },
          wrap
        )
        return acc
      },
      {} as {
        [Key in keyof typeof client as `${ToCamel<string & Key>}Mutation`]: MutationWithExtensions<
          RT,
          typeof client[Key]
        >
      }
    )
    return mutations
  }

  // make available .query, .suspense and .mutate for each operation
  // and a .helpers with all mutations and queries
  const mapClient = <M extends Requests>(
    queryInvalidation?: (client: ClientFrom<M>) => QueryInvalidation<M>
  ) =>
  (
    client: ClientFrom<M>
  ) => {
    const Command = useCommand()
    const mutation = useMutation()
    const invalidation = queryInvalidation?.(client)
    const extended = Struct.keys(client).reduce(
      (acc, key) => {
        const fn = Command.fn(client[key].id)
        const awesome = {
          ...client[key],
          ...fn,
          query: useQuery(client[key] as any),
          suspense: useSuspenseQuery(client[key] as any)
        }
        const mutate = mutation(
          client[key] as any,
          invalidation?.[key] ? { queryInvalidation: invalidation[key] } : undefined
        )
        ;(acc as any)[key] = Object.assign(mutate, { wrap: Command.wrap({ mutate, id: awesome.id }), fn }, awesome, fn)
        return acc
      },
      {} as {
        [Key in keyof typeof client]:
          & MutationWithExtensions<RT, typeof client[Key]>
          & {
            query: typeof client[Key] extends
              RequestHandlerWithInput<infer I, infer A, infer E, infer _R, infer Request, infer Id>
              ? ReturnType<typeof useQuery<I, E, A, Request, Id>>
              : typeof client[Key] extends RequestHandler<infer A, infer E, infer _R, infer Request, infer Id>
                ? ReturnType<typeof useQuery<E, A, Request, Id>>
              : never
            // TODO or suspense as Option?
            suspense: typeof client[Key] extends
              RequestHandlerWithInput<infer I, infer A, infer E, infer _R, infer Request, infer Id>
              ? ReturnType<typeof useSuspenseQuery<I, E, A, Request, Id>>
              : typeof client[Key] extends RequestHandler<infer A, infer E, infer _R, infer Request, infer Id>
                ? ReturnType<typeof useSuspenseQuery<E, A, Request, Id>>
              : never
            // mutate: typeof client[Key] extends
            //   RequestHandlerWithInput<infer I, infer A, infer E, infer R, infer Request, infer Id>
            //   ? ReturnType<typeof useMutation<I, E, A, R, Request, Id>>
            //   : typeof client[Key] extends RequestHandler<infer A, infer E, infer R, infer Request, infer Id>
            //     ? ReturnType<typeof useMutation<E, A, R, Request, Id>>
            //   : never
          }
      }
    )
    return Object.assign(extended, { helpers: { ...mapMutation(client), ...mapQuery(client) } })
  }

  // TODO: Clean up this delay initialisation messs
  // TODO; invalidateQueries should perhaps be configured in the Request impl themselves?
  const clientFor__ = <M extends Requests>(
    m: M,
    queryInvalidation?: (client: ClientFrom<M>) => QueryInvalidation<M>
  ) => getBaseMrt().runSync(clientFor_(m).pipe(Effect.map(mapClient(queryInvalidation))))

  // delay client creation until first access
  // the idea is that we don't need the useNuxtApp().$runtime (only available at later initialisation stage)
  // until we are at a place where it is available..
  const clientFor = <M extends Requests>(
    m: M,
    queryInvalidation?: (client: ClientFrom<M>) => QueryInvalidation<M>
  ) => {
    type Client = ReturnType<typeof clientFor__<M>>
    let client: Client | undefined = undefined
    const getOrMakeClient = () => (client ??= clientFor__(m, queryInvalidation))

    // initialize on first use..
    const proxy = Struct.keys(m).concat(["helpers"]).reduce((acc, key) => {
      Object.defineProperty(acc, key, {
        configurable: true,
        get() {
          const v = getOrMakeClient()[key as any]
          // cache on first use.
          Object.defineProperty(acc, key, { value: v })
          return v
        }
      })
      return acc
    }, {} as Client)
    return proxy
  }

  const legacy: Legacy<R> = {
    ...mutations,
    ...query
  }

  const Command: CommanderResolved<R> = {
    ...{
      // delay initialisation until first use...
      fn: (...args: [any]) => useCommand().fn(...args),
      wrap: (...args: [any]) => useCommand().wrap(...args),
      alt: (...args: [any]) => useCommand().alt(...args),
      alt2: (...args: [any]) => useCommand().alt2(...args)
    } as ReturnType<typeof useCommand>,
    ...CommanderStatic
  }

  return {
    Command,
    useCommand,
    clientFor,
    legacy
  }
}

export interface Legacy<R>
  extends
    Pick<QueryImpl<R>, "useQuery" | "useSuspenseQuery">,
    Omit<LegacyMutationImpl<R>, "getRuntime" | "toast" | "intl">
{}

export type QueryInvalidation<M> = {
  [K in keyof M]?: (defaultKey: string[], name: string) => {
    filters?: InvalidateQueryFilters | undefined
    options?: InvalidateOptions | undefined
  }[]
}

export type ToCamel<S extends string | number | symbol> = S extends string
  ? S extends `${infer Head}_${infer Tail}` ? `${Uncapitalize<Head>}${Capitalize<ToCamel<Tail>>}`
  : Uncapitalize<S>
  : never

export interface CommandBase<I extends ReadonlyArray<any>, A = void> {
  handle: (...input: I) => A
  waiting: boolean
  action: string
}

// export interface Command<I extends ReadonlyArray<any>> extends CommandBase<I, void> {}

export interface EffectCommand<I extends ReadonlyArray<any>, A = unknown, E = unknown>
  extends CommandBase<I, RuntimeFiber<A, E>>
{}

export interface UnaryCommand<I, A = unknown, E = unknown> extends CommandBase<[I], RuntimeFiber<A, E>> {}

export interface CommandFromRequest<I extends abstract new(...args: any) => any, A = unknown, E = unknown>
  extends UnaryCommand<ConstructorParameters<I>[0], A, E>
{}

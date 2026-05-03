/* eslint-disable @typescript-eslint/no-explicit-any */
import { asResult, asStreamResult, deepToRaw, type MissingDependencies, reportRuntimeError } from "@effect-app/vue"
import { reportMessage } from "@effect-app/vue/errorReporter"
import { Cause, Context, Effect, type Exit, type Fiber, flow, Layer, Match, MutableHashMap, Option, Predicate, S } from "effect-app"
import { SupportedErrors } from "effect-app/client"
import { OperationFailure, OperationSuccess } from "effect-app/Operations"
import { isGeneratorFunction, wrapEffect } from "effect-app/utils"
import { type Refinement } from "effect/Predicate"
import * as Stream from "effect/Stream"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import { type FormatXMLElementFn, type PrimitiveType } from "intl-messageformat"
import { computed, type ComputedRef, reactive, ref, toRaw } from "vue"
import { Confirm } from "./confirm.js"
import { I18n } from "./intl.js"
import { CurrentToastId, Toast } from "./toast.js"
import { WithToast } from "./withToast.js"

type IntlRecord = Record<string, PrimitiveType | FormatXMLElementFn<string, string>>

/**
 * Progress information surfaced by a stream command. Either a plain text label
 * or a `{ text, percentage }` pair when concrete progress is known.
 */
export type Progress = string | { readonly text: string; readonly percentage: number }

/**
 * Options accepted when calling a stream mutation factory.
 * Supplying `progress` causes the resulting command to expose `running`
 * (the live AsyncResult ref) and `progress` (formatted loading info).
 * When omitted, neither is exposed on the command.
 */
export type StreamMutationCallOptions<A, E> = {
  progress?: (result: AsyncResult.AsyncResult<A, E>) => Progress | undefined
}

/**
 * The result of invoking a `mutateStream` factory: the `execute` function (or
 * `Effect`, when the request takes no input) carries `id`, plus `running` and
 * `progress` when the factory was called with a `progress` formatter. Pass
 * directly to `Command.fn` / `Command.wrap` / `Command.wrapStream`, or invoke
 * to run the stream.
 */
type StreamMutationCallable<Id extends string, Arg, A, E, R> =
  & (((arg: Arg) => Effect.Effect<any, E, R>) | Effect.Effect<any, E, R>)
  & {
    readonly id: Id
    readonly _streamCallable: true
    readonly running?: ComputedRef<AsyncResult.AsyncResult<A, E>>
    readonly progress?: ComputedRef<Progress | undefined>
  }

type StreamMutationFactory<Id extends string, Arg, A, E, R> =
  & ((options?: StreamMutationCallOptions<A, E>) => StreamMutationCallable<Id, Arg, A, E, R>)
  & { readonly id: Id; readonly _streamFactory: true }

const isStreamFactory = (x: unknown): x is StreamMutationFactory<string, any, any, any, any> =>
  typeof x === "function" && (x as any)._streamFactory === true

const isStreamCallable = (x: unknown): x is StreamMutationCallable<string, any, any, any, any> =>
  x !== null && x !== undefined && (x as any)._streamCallable === true
type FnOptions<
  Id extends string,
  I18nCustomKey extends string,
  State extends IntlRecord | undefined
> = {
  i18nCustomKey?: I18nCustomKey
  /**
   * passed to the i18n formatMessage calls so you can use it in translation messagee
   * including the Command `action` string.
   * Automatically wrapped with Computed if just a thunk.
   * provided as Command.state tag, so you can access it in the function.
   */
  state?: ComputedRef<State> | (() => State)
  // TODO: namespaced keys like reactivity keys: ["modify_thing", item], so that one can block also on "modify_thing" *
  blockKey?: (id: Id) => string | undefined
  waitKey?: (id: Id) => string | undefined
  allowed?: (id: Id, state: ComputedRef<State>) => boolean
}

type FnOptionsInternal<I18nCustomKey extends string> = {
  i18nCustomKey?: I18nCustomKey | undefined
  state?: IntlRecord | undefined
}

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
    "handle.unexpected_error2": "{action} unerwarteter Fehler, probieren sie es in kurze nochmals.",

    "handle.unexpected_error": "Unerwarteter Fehler:\n{error}",
    "handle.not_found": "Das gesuchte war nicht gefunden"
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
    "handle.unexpected_error2": "{action} unexpected error, please try again shortly.",

    "handle.unexpected_error": "Unexpected Error:\n{error}",
    "handle.not_found": "The requested item was not found."
  }
}

export class CommandContext extends Context.Service<CommandContext, {
  id: string
  i18nKey: string
  action: string
  label: string
  namespace: string
  namespaced: (key: string) => string
  state?: IntlRecord | undefined
}>()(
  "CommandContext"
) {}

/**
 * Service available inside `streamFn` stream handlers that lets you imperatively push
 * progress updates to the command's reactive `progress` ref.
 *
 * Use `Command.mapProgress(fn)` or `Command.updateProgress(progress)` to interact with this service.
 *
 * @example
 * ```ts
 * // Using mapProgress (recommended) — applied as a stream pipe operator:
 * const exportCmd = Command.streamFn("exportData")(
 *   function*(arg, ctx) {
 *     return makeExportStream(arg.id).pipe(
 *       Command.mapProgress((r) =>
 *         AsyncResult.isSuccess(r) && r.value._tag === "OperationProgress"
 *           ? { text: `${r.value.completed}/${r.value.total}`, percentage: r.value.completed / r.value.total * 100 }
 *           : undefined
 *       )
 *     )
 *   }
 * )
 * // exportCmd.progress is updated for every OperationProgress event
 * ```
 */
export class CommandProgress extends Context.Reference<{
  readonly update: (progress: Progress | undefined) => Effect.Effect<void>
}>("Commander.CommandProgress", {
  defaultValue: () => ({ update: (_progress: Progress | undefined): Effect.Effect<void> => Effect.void })
}) {}

export type EmitWithCallback<A, Event extends string> = (event: Event, value: A, onDone: () => void) => void

/**
 * Use to wrap emit calls with a callback to signal completion.
 * Useful when the publisher wants to wait for the subscriber to finish processing.
 */
export const wrapEmit = <A, Event extends string>(
  emit: EmitWithCallback<A, NoInfer<Event>>,
  event: Event
) =>
(value: A) => new Promise<void>((resolve) => emit(event, value, resolve))

export declare namespace Commander {
  export type CommanderBase<RT, Id extends string, I18nKey extends string, State extends IntlRecord | undefined> =
    & Gen<RT, Id, I18nKey, State>
    & NonGen<RT, Id, I18nKey, State>
    & CommandContextLocal<Id, I18nKey>
    & {
      state: Context.Service<`Commander.Command.${Id}.state`, State>
    }

  export type CommanderFn<RT, Id extends string, I18nKey extends string, State extends IntlRecord | undefined> =
    CommanderBase<RT, Id, I18nKey, State>

  export type CommanderWrap<
    RT,
    Id extends string,
    I18nCustomKey extends string,
    State extends IntlRecord | undefined,
    I,
    A,
    E,
    R
  > =
    & CommandContextLocal<Id, I18nCustomKey>
    & GenWrap<RT, Id, I18nCustomKey, I, A, E, R, State>
    & NonGenWrap<RT, Id, I18nCustomKey, I, A, E, R, State>
    & {
      state: Context.Service<`Commander.Command.${Id}.state`, State>
    }

  export interface CommandContextLocal<Id extends string, I18nKey extends string> {
    id: Id
    i18nKey: I18nKey
    namespace: `action.${I18nKey}`
    namespaced: <K extends string>(k: K) => `action.${I18nKey}.${K}`
  }

  export interface CommandProps<
    A,
    E,
    Id extends string,
    I18nKey extends string,
    State extends IntlRecord | undefined
  > extends CommandContextLocal<Id, I18nKey> {
    /** reactive */
    action: string
    /** reactive */
    label: string
    /** reactive */
    result: AsyncResult.AsyncResult<A, E>
    /**
     * reactive – set when the command wraps a stream (`wrapStream` / `wrap` with `mutateStream`)
     * or when the `progress` option is provided to `fn`.
     * Reflects the live AsyncResult of the underlying stream.
     */
    running: AsyncResult.AsyncResult<any, any> | undefined
    /**
     * reactive – formatted progress info computed from `running` via the
     * `progress` option. Useful as the loading state on a `CommandButton`.
     * Undefined when no `progress` formatter was supplied.
     */
    progress: Progress | undefined
    /** reactive */
    waiting: boolean
    /** reactive */
    blocked: boolean
    /** reactive */
    allowed: boolean
    /** reactive */
    state: State
  }

  export interface CommandOut<
    Arg,
    A,
    E,
    R,
    Id extends string,
    I18nKey extends string,
    State extends IntlRecord | undefined
  > extends CommandProps<A, E, Id, I18nKey, State> {
    new(): {}

    /** click handlers */
    handle: ((arg: Arg) => Fiber.Fiber<Exit.Exit<A, E>, never>) & {
      /** @deprecated don't exist */
      effect: (arg: Arg) => Effect.Effect<A, E, R>
    }

    // // TODO: if we keep them, it would probably be nicer as an option api, deciding the return value like in Atom?
    // /** @experimental */
    // compose: (arg: Arg) => Effect.Effect<Exit.Exit<A, E>, R>
    // /** @experimental */
    // compose2: (arg: Arg) => Effect.Effect<A, E, R>
    // /**
    //  * @experimental
    //  * captures the current span and returns an Effect that when run will execute the command
    //  */
    // handleEffect: (arg: Arg) => Effect.Effect<Fiber.Fiber<Exit.Exit<A, E>, never>>
    // /**
    //  * @experimental
    //  */
    // exec: (arg: Arg) => Effect.Effect<Exit.Exit<A, E>, never, Exclude<R, CommandContext>>
  }

  export interface CommandContextLocal2<Id extends string, I18nKey extends string, State extends IntlRecord | undefined>
    extends CommandContextLocal<Id, I18nKey>
  {
    state: State
  }

  type ArgForCombinator<Arg> = [Arg] extends [void] ? undefined : NoInfer<Arg>

  type CommandOutHelper<
    Arg,
    Eff extends Effect.Effect<any, any, any>,
    Id extends string,
    I18nKey extends string,
    State extends IntlRecord | undefined
  > = CommandOut<
    Arg,
    Effect.Success<Eff>,
    Effect.Error<Eff>,
    Effect.Services<Eff>,
    Id,
    I18nKey,
    State
  >

  export type Gen<RT, Id extends string, I18nKey extends string, State extends IntlRecord | undefined> = {
    <
      Eff extends Effect.Yieldable<any, any, any, RT | CommandContext | `Commander.Command.${Id}.state`>,
      AEff,
      Arg = void
    >(
      body: (arg: Arg, ctx: CommandContextLocal2<Id, I18nKey, State>) => Generator<Eff, AEff, never>
    ): CommandOut<
      Arg,
      AEff,
      [Eff] extends [never] ? never
        : [Eff] extends [Effect.Yieldable<any, infer _A, infer E, infer _R>] ? E
        : never,
      [Eff] extends [never] ? never
        : [Eff] extends [Effect.Yieldable<any, infer _A, infer _E, infer R>] ? R
        : never,
      Id,
      I18nKey,
      State
    >
    <
      Eff extends Effect.Yieldable<any, any, any, any>,
      AEff,
      A extends Effect.Effect<any, any, RT | CommandContext | `Commander.Command.${Id}.state`>,
      Arg = void
    >(
      body: (arg: Arg, ctx: CommandContextLocal2<Id, I18nKey, State>) => Generator<Eff, AEff, never>,
      a: (
        _: Effect.Effect<
          AEff,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect.Yieldable<any, infer _A, infer E, infer _R>] ? E
            : never,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect.Yieldable<any, infer _A, infer _E, infer R>] ? R
            : never
        >,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => A
    ): CommandOutHelper<Arg, A, Id, I18nKey, State>
    <
      Eff extends Effect.Yieldable<any, any, any, any>,
      AEff,
      A,
      B extends Effect.Effect<any, any, RT | CommandContext | `Commander.Command.${Id}.state`>,
      Arg = void
    >(
      body: (arg: Arg, ctx: CommandContextLocal2<Id, I18nKey, State>) => Generator<Eff, AEff, never>,
      a: (
        _: Effect.Effect<
          AEff,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect.Yieldable<any, infer _A, infer E, infer _R>] ? E
            : never,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect.Yieldable<any, infer _A, infer _E, infer R>] ? R
            : never
        >,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => A,
      b: (
        _: A,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => B
    ): CommandOutHelper<Arg, B, Id, I18nKey, State>
    <
      Eff extends Effect.Yieldable<any, any, any, any>,
      AEff,
      A,
      B,
      C extends Effect.Effect<any, any, RT | CommandContext | `Commander.Command.${Id}.state`>,
      Arg = void
    >(
      body: (arg: Arg, ctx: CommandContextLocal2<Id, I18nKey, State>) => Generator<Eff, AEff, never>,
      a: (
        _: Effect.Effect<
          AEff,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect.Yieldable<any, infer _A, infer E, infer _R>] ? E
            : never,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect.Yieldable<any, infer _A, infer _E, infer R>] ? R
            : never
        >,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => A,
      b: (
        _: A,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => B,
      c: (
        _: B,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => C
    ): CommandOutHelper<Arg, C, Id, I18nKey, State>
    <
      Eff extends Effect.Yieldable<any, any, any, any>,
      AEff,
      A,
      B,
      C,
      D extends Effect.Effect<any, any, RT | CommandContext | `Commander.Command.${Id}.state`>,
      Arg = void
    >(
      body: (arg: Arg, ctx: CommandContextLocal2<Id, I18nKey, State>) => Generator<Eff, AEff, never>,
      a: (
        _: Effect.Effect<
          AEff,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect.Yieldable<any, infer _A, infer E, infer _R>] ? E
            : never,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect.Yieldable<any, infer _A, infer _E, infer R>] ? R
            : never
        >,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => A,
      b: (
        _: A,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => B,
      c: (
        _: B,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => C,
      d: (
        _: C,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => D
    ): CommandOutHelper<Arg, D, Id, I18nKey, State>
    <
      Eff extends Effect.Yieldable<any, any, any, any>,
      AEff,
      A,
      B,
      C,
      D,
      E extends Effect.Effect<any, any, RT | CommandContext | `Commander.Command.${Id}.state`>,
      Arg = void
    >(
      body: (arg: Arg, ctx: CommandContextLocal2<Id, I18nKey, State>) => Generator<Eff, AEff, never>,
      a: (
        _: Effect.Effect<
          AEff,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect.Yieldable<any, infer _A, infer E, infer _R>] ? E
            : never,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect.Yieldable<any, infer _A, infer _E, infer R>] ? R
            : never
        >,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => A,
      b: (
        _: A,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => B,
      c: (
        _: B,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => C,
      d: (
        _: C,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => D,
      e: (
        _: D,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => E
    ): CommandOutHelper<Arg, E, Id, I18nKey, State>
    <
      Eff extends Effect.Yieldable<any, any, any, any>,
      AEff,
      A,
      B,
      C,
      D,
      E,
      F extends Effect.Effect<any, any, RT | CommandContext | `Commander.Command.${Id}.state`>,
      Arg = void
    >(
      body: (arg: Arg, ctx: CommandContextLocal2<Id, I18nKey, State>) => Generator<Eff, AEff, never>,
      a: (
        _: Effect.Effect<
          AEff,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect.Yieldable<any, infer _A, infer E, infer _R>] ? E
            : never,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect.Yieldable<any, infer _A, infer _E, infer R>] ? R
            : never
        >,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => A,
      b: (
        _: A,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => B,
      c: (
        _: B,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => C,
      d: (
        _: C,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => D,
      e: (
        _: D,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => E,
      f: (
        _: E,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => F
    ): CommandOutHelper<Arg, F, Id, I18nKey, State>
    <
      Eff extends Effect.Yieldable<any, any, any, any>,
      AEff,
      A,
      B,
      C,
      D,
      E,
      F,
      G extends Effect.Effect<any, any, RT | CommandContext | `Commander.Command.${Id}.state`>,
      Arg = void
    >(
      body: (arg: Arg, ctx: CommandContextLocal2<Id, I18nKey, State>) => Generator<Eff, AEff, never>,
      a: (
        _: Effect.Effect<
          AEff,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect.Yieldable<any, infer _A, infer E, infer _R>] ? E
            : never,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect.Yieldable<any, infer _A, infer _E, infer R>] ? R
            : never
        >,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => A,
      b: (
        _: A,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => B,
      c: (
        _: B,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => C,
      d: (
        _: C,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => D,
      e: (
        _: D,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => E,
      f: (
        _: E,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => F,
      g: (
        _: F,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => G
    ): CommandOutHelper<Arg, G, Id, I18nKey, State>
    <
      Eff extends Effect.Yieldable<any, any, any, any>,
      AEff,
      A,
      B,
      C,
      D,
      E,
      F,
      G,
      H extends Effect.Effect<any, any, RT | CommandContext | `Commander.Command.${Id}.state`>,
      Arg = void
    >(
      body: (arg: Arg, ctx: CommandContextLocal2<Id, I18nKey, State>) => Generator<Eff, AEff, never>,
      a: (
        _: Effect.Effect<
          AEff,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect.Yieldable<any, infer _A, infer E, infer _R>] ? E
            : never,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect.Yieldable<any, infer _A, infer _E, infer R>] ? R
            : never
        >,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => A,
      b: (
        _: A,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => B,
      c: (
        _: B,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => C,
      d: (
        _: C,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => D,
      e: (
        _: D,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => E,
      f: (
        _: E,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => F,
      g: (
        _: F,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => G,
      h: (
        _: G,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => H
    ): CommandOutHelper<Arg, H, Id, I18nKey, State>
    <
      Eff extends Effect.Yieldable<any, any, any, any>,
      AEff,
      A,
      B,
      C,
      D,
      E,
      F,
      G,
      H,
      I extends Effect.Effect<any, any, RT | CommandContext | `Commander.Command.${Id}.state`>,
      Arg = void
    >(
      body: (arg: Arg, ctx: CommandContextLocal2<Id, I18nKey, State>) => Generator<Eff, AEff, never>,
      a: (
        _: Effect.Effect<
          AEff,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect.Yieldable<any, infer _A, infer E, infer _R>] ? E
            : never,
          [Eff] extends [never] ? never
            : [Eff] extends [Effect.Yieldable<any, infer _A, infer _E, infer R>] ? R
            : never
        >,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => A,
      b: (
        _: A,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => B,
      c: (
        _: B,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => C,
      d: (
        _: C,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => D,
      e: (
        _: D,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => E,
      f: (
        _: E,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => F,
      g: (
        _: F,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => G,
      h: (
        _: G,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => H,
      i: (
        _: H,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => I
    ): CommandOutHelper<Arg, I, Id, I18nKey, State>
  }

  export type NonGen<RT, Id extends string, I18nKey extends string, State extends IntlRecord | undefined> = {
    <
      Eff extends Effect.Effect<any, any, RT | CommandContext | `Commander.Command.${Id}.state`>,
      Arg = void
    >(
      body: (arg: Arg, ctx: CommandContextLocal2<Id, I18nKey, State>) => Eff
    ): CommandOutHelper<Arg, Eff, Id, I18nKey, State>
    <
      Eff extends Effect.Effect<any, any, RT | CommandContext | `Commander.Command.${Id}.state`>,
      A,
      Arg = void
    >(
      body: (arg: Arg, ctx: CommandContextLocal2<Id, I18nKey, State>) => A,
      a: (
        _: A,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => Eff
    ): CommandOutHelper<Arg, Eff, Id, I18nKey, State>
    <
      Eff extends Effect.Effect<any, any, RT | CommandContext | `Commander.Command.${Id}.state`>,
      A,
      B,
      Arg = void
    >(
      body: (arg: Arg, ctx: CommandContextLocal2<Id, I18nKey, State>) => A,
      a: (
        _: A,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => B,
      b: (
        _: B,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => Eff
    ): CommandOutHelper<Arg, Eff, Id, I18nKey, State>
    <
      Eff extends Effect.Effect<any, any, RT | CommandContext | `Commander.Command.${Id}.state`>,
      A,
      B,
      C,
      Arg = void
    >(
      body: (arg: Arg, ctx: CommandContextLocal2<Id, I18nKey, State>) => A,
      a: (
        _: A,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => B,
      b: (
        _: B,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => C,
      c: (
        _: C,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => Eff
    ): CommandOutHelper<Arg, Eff, Id, I18nKey, State>
    <
      Eff extends Effect.Effect<any, any, RT | CommandContext | `Commander.Command.${Id}.state`>,
      A,
      B,
      C,
      D,
      Arg = void
    >(
      body: (arg: Arg, ctx: CommandContextLocal2<Id, I18nKey, State>) => A,
      a: (
        _: A,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => B,
      b: (
        _: B,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => C,
      c: (
        _: C,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => D,
      d: (
        _: D,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => Eff
    ): CommandOutHelper<Arg, Eff, Id, I18nKey, State>
    <
      Eff extends Effect.Effect<any, any, RT | CommandContext | `Commander.Command.${Id}.state`>,
      A,
      B,
      C,
      D,
      E,
      Arg = void
    >(
      body: (arg: Arg, ctx: CommandContextLocal2<Id, I18nKey, State>) => A,
      a: (
        _: A,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => B,
      b: (
        _: B,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => C,
      c: (
        _: C,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => D,
      d: (
        _: D,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => E,
      e: (
        _: E,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => Eff
    ): CommandOutHelper<Arg, Eff, Id, I18nKey, State>
    <
      Eff extends Effect.Effect<any, any, RT | CommandContext | `Commander.Command.${Id}.state`>,
      A,
      B,
      C,
      D,
      E,
      F,
      Arg = void
    >(
      body: (arg: Arg, ctx: CommandContextLocal2<Id, I18nKey, State>) => A,
      a: (
        _: A,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => B,
      b: (
        _: B,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => C,
      c: (
        _: C,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => D,
      d: (
        _: D,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => E,
      e: (
        _: E,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => F,
      f: (
        _: F,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => Eff
    ): CommandOutHelper<Arg, Eff, Id, I18nKey, State>
    <
      Eff extends Effect.Effect<any, any, RT | CommandContext | `Commander.Command.${Id}.state`>,
      A,
      B,
      C,
      D,
      E,
      F,
      G,
      Arg = void
    >(
      body: (arg: Arg, ctx: CommandContextLocal2<Id, I18nKey, State>) => A,
      a: (
        _: A,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => B,
      b: (
        _: B,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => C,
      c: (
        _: C,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => D,
      d: (
        _: D,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => E,
      e: (
        _: E,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => F,
      f: (
        _: F,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => G,
      g: (
        _: G,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => Eff
    ): CommandOutHelper<Arg, Eff, Id, I18nKey, State>
    <
      Eff extends Effect.Effect<any, any, RT | CommandContext | `Commander.Command.${Id}.state`>,
      A,
      B,
      C,
      D,
      E,
      F,
      G,
      H,
      Arg = void
    >(
      body: (arg: Arg, ctx: CommandContextLocal2<Id, I18nKey, State>) => A,
      a: (
        _: A,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => B,
      b: (
        _: B,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => C,
      c: (
        _: C,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => D,
      d: (
        _: D,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => E,
      e: (
        _: E,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => F,
      f: (
        _: F,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => G,
      g: (
        _: G,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => H,
      h: (
        _: H,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => Eff
    ): CommandOutHelper<Arg, Eff, Id, I18nKey, State>
    <
      Eff extends Effect.Effect<any, any, RT | CommandContext | `Commander.Command.${Id}.state`>,
      A,
      B,
      C,
      D,
      E,
      F,
      G,
      H,
      I,
      Arg = void
    >(
      body: (arg: Arg, ctx: CommandContextLocal2<Id, I18nKey, State>) => A,
      a: (
        _: A,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => B,
      b: (
        _: B,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => C,
      c: (
        _: C,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => D,
      d: (
        _: D,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => E,
      e: (
        _: E,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => F,
      f: (
        _: F,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => G,
      g: (
        _: G,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => H,
      h: (
        _: H,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => I,
      i: (
        _: H,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => Eff
    ): CommandOutHelper<Arg, Eff, Id, I18nKey, State>
  }

  export type GenWrap<
    RT,
    Id extends string,
    I18nKey extends string,
    Arg,
    AEff,
    EEff,
    REff,
    State extends IntlRecord | undefined
  > = {
    (): Exclude<REff, RT> extends never ? CommandOut<
        Arg,
        AEff,
        EEff,
        REff,
        Id,
        I18nKey,
        State
      >
      : MissingDependencies<RT, REff> & {}
    <
      A extends Effect.Effect<any, any, RT | CommandContext | `Commander.Command.${Id}.state`>
    >(
      a: (
        _: Effect.Effect<
          AEff,
          EEff,
          REff
        >,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => A
    ): CommandOutHelper<Arg, A, Id, I18nKey, State>
    <
      A,
      B extends Effect.Effect<any, any, RT | CommandContext | `Commander.Command.${Id}.state`>
    >(
      a: (
        _: Effect.Effect<
          AEff,
          EEff,
          REff
        >,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => A,
      b: (
        _: A,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => B
    ): CommandOutHelper<Arg, B, Id, I18nKey, State>
    <
      A,
      B,
      C extends Effect.Effect<any, any, RT | CommandContext | `Commander.Command.${Id}.state`>
    >(
      a: (
        _: Effect.Effect<
          AEff,
          EEff,
          REff
        >,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => A,
      b: (
        _: A,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => B,
      c: (
        _: B,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => C
    ): CommandOutHelper<Arg, C, Id, I18nKey, State>
    <
      A,
      B,
      C,
      D extends Effect.Effect<any, any, RT | CommandContext | `Commander.Command.${Id}.state`>
    >(
      a: (
        _: Effect.Effect<
          AEff,
          EEff,
          REff
        >,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => A,
      b: (
        _: A,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => B,
      c: (
        _: B,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => C,
      d: (
        _: C,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => D
    ): CommandOutHelper<Arg, D, Id, I18nKey, State>
    <
      A,
      B,
      C,
      D,
      E extends Effect.Effect<any, any, RT | CommandContext | `Commander.Command.${Id}.state`>
    >(
      a: (
        _: Effect.Effect<
          AEff,
          EEff,
          REff
        >,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => A,
      b: (
        _: A,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => B,
      c: (
        _: B,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => C,
      d: (
        _: C,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => D,
      e: (
        _: D,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => E
    ): CommandOutHelper<Arg, E, Id, I18nKey, State>
    <
      A,
      B,
      C,
      D,
      E,
      F extends Effect.Effect<any, any, RT | CommandContext | `Commander.Command.${Id}.state`>
    >(
      a: (
        _: Effect.Effect<
          AEff,
          EEff,
          REff
        >,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => A,
      b: (
        _: A,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => B,
      c: (
        _: B,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => C,
      d: (
        _: C,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => D,
      e: (
        _: D,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => E,
      f: (
        _: E,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => F
    ): CommandOutHelper<Arg, F, Id, I18nKey, State>
    <
      A,
      B,
      C,
      D,
      E,
      F,
      G extends Effect.Effect<any, any, RT | CommandContext | `Commander.Command.${Id}.state`>
    >(
      a: (
        _: Effect.Effect<
          AEff,
          EEff,
          REff
        >,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => A,
      b: (
        _: A,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => B,
      c: (
        _: B,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => C,
      d: (
        _: C,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => D,
      e: (
        _: D,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => E,
      f: (
        _: E,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => F,
      g: (
        _: F,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => G
    ): CommandOutHelper<Arg, G, Id, I18nKey, State>
    <A, B, C, D, E, F, G, H extends Effect.Effect<any, any, RT | CommandContext | `Commander.Command.${Id}.state`>>(
      a: (
        _: Effect.Effect<
          AEff,
          EEff,
          REff
        >,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => A,
      b: (
        _: A,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => B,
      c: (
        _: B,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => C,
      d: (
        _: C,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => D,
      e: (
        _: D,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => E,
      f: (
        _: E,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => F,
      g: (
        _: F,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => G,
      h: (
        _: G,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => H
    ): CommandOutHelper<Arg, H, Id, I18nKey, State>
    <A, B, C, D, E, F, G, H, I extends Effect.Effect<any, any, RT | CommandContext | `Commander.Command.${Id}.state`>>(
      a: (
        _: Effect.Effect<
          AEff,
          EEff,
          REff
        >,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => A,
      b: (
        _: A,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => B,
      c: (
        _: B,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => C,
      d: (
        _: C,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => D,
      e: (
        _: D,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => E,
      f: (
        _: E,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => F,
      g: (
        _: F,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => G,
      h: (
        _: G,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => H,
      i: (
        _: H,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => I
    ): CommandOutHelper<Arg, I, Id, I18nKey, State>
  }

  export type NonGenWrap<
    RT,
    Id extends string,
    I18nKey extends string,
    Arg,
    AEff,
    EEff,
    REff,
    State extends IntlRecord | undefined
  > = {
    (): Exclude<REff, RT> extends never ? CommandOutHelper<Arg, Effect.Effect<AEff, EEff, REff>, Id, I18nKey, State>
      : MissingDependencies<RT, REff> & {}
    <
      Eff extends Effect.Effect<any, any, RT | CommandContext | `Commander.Command.${Id}.state`>,
      Arg
    >(
      a: (
        _: Effect.Effect<
          AEff,
          EEff,
          REff
        >,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => Eff
    ): CommandOutHelper<Arg, Eff, Id, I18nKey, State>
    <
      Eff extends Effect.Effect<any, any, RT | CommandContext | `Commander.Command.${Id}.state`>,
      B,
      Arg
    >(
      a: (
        _: Effect.Effect<
          AEff,
          EEff,
          REff
        >,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => B,
      b: (
        _: B,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => Eff
    ): CommandOutHelper<Arg, Eff, Id, I18nKey, State>
    <
      Eff extends Effect.Effect<any, any, RT | CommandContext | `Commander.Command.${Id}.state`>,
      B,
      C,
      Arg
    >(
      a: (
        _: Effect.Effect<
          AEff,
          EEff,
          REff
        >,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => B,
      b: (
        _: B,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => C,
      c: (
        _: C,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => Eff
    ): CommandOutHelper<Arg, Eff, Id, I18nKey, State>
    <
      Eff extends Effect.Effect<any, any, RT | CommandContext | `Commander.Command.${Id}.state`>,
      B,
      C,
      D,
      Arg
    >(
      a: (
        _: Effect.Effect<
          AEff,
          EEff,
          REff
        >,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => B,
      b: (
        _: B,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => C,
      c: (
        _: C,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => D,
      d: (
        _: D,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => Eff
    ): CommandOutHelper<Arg, Eff, Id, I18nKey, State>
    <
      Eff extends Effect.Effect<any, any, RT | CommandContext | `Commander.Command.${Id}.state`>,
      B,
      C,
      D,
      E,
      Arg
    >(
      a: (
        _: Effect.Effect<
          AEff,
          EEff,
          REff
        >,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => B,
      b: (
        _: B,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => C,
      c: (
        _: C,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => D,
      d: (
        _: D,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => E,
      e: (
        _: E,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => Eff
    ): CommandOutHelper<Arg, Eff, Id, I18nKey, State>
    <
      Eff extends Effect.Effect<any, any, RT | CommandContext | `Commander.Command.${Id}.state`>,
      B,
      C,
      D,
      E,
      F,
      Arg
    >(
      a: (
        _: Effect.Effect<
          AEff,
          EEff,
          REff
        >,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => B,
      b: (
        _: B,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => C,
      c: (
        _: C,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => D,
      d: (
        _: D,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => E,
      e: (
        _: E,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => F,
      f: (
        _: F,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => Eff
    ): CommandOutHelper<Arg, Eff, Id, I18nKey, State>
    <
      Eff extends Effect.Effect<any, any, RT | CommandContext | `Commander.Command.${Id}.state`>,
      B,
      C,
      D,
      E,
      F,
      G,
      Arg
    >(
      a: (
        _: Effect.Effect<
          AEff,
          EEff,
          REff
        >,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => B,
      b: (
        _: B,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => C,
      c: (
        _: C,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => D,
      d: (
        _: D,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => E,
      e: (
        _: E,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => F,
      f: (
        _: F,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => G,
      g: (
        _: G,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => Eff
    ): CommandOutHelper<Arg, Eff, Id, I18nKey, State>
    <
      Eff extends Effect.Effect<any, any, RT | CommandContext | `Commander.Command.${Id}.state`>,
      B,
      C,
      D,
      E,
      F,
      G,
      H,
      Arg
    >(
      a: (
        _: Effect.Effect<
          AEff,
          EEff,
          REff
        >,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => B,
      b: (
        _: B,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => C,
      c: (
        _: C,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => D,
      d: (
        _: D,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => E,
      e: (
        _: E,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => F,
      f: (
        _: F,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => G,
      g: (
        _: G,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => H,
      h: (
        _: H,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => Eff
    ): CommandOutHelper<Arg, Eff, Id, I18nKey, State>
    <
      Eff extends Effect.Effect<any, any, RT | CommandContext | `Commander.Command.${Id}.state`>,
      B,
      C,
      D,
      E,
      F,
      G,
      H,
      I,
      Arg
    >(
      a: (
        _: Effect.Effect<
          AEff,
          EEff,
          REff
        >,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => B,
      b: (
        _: B,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => C,
      c: (
        _: C,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => D,
      d: (
        _: D,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => E,
      e: (
        _: E,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => F,
      f: (
        _: F,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => G,
      g: (
        _: G,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => H,
      h: (
        _: H,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => I,
      i: (
        _: H,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => Eff
    ): CommandOutHelper<Arg, Eff, Id, I18nKey, State>
  }

  /**
   * Type for `streamFn` — generator overload where the body yields Effects and returns a `Stream`.
   * `waiting` stays `true` while the stream is running, and updates the `result` ref per emitted value.
   */
  export type StreamGen<RT, Id extends string, I18nKey extends string, State extends IntlRecord | undefined> = {
    <
      Eff extends Effect.Yieldable<any, any, any, RT | CommandContext | `Commander.Command.${Id}.state`>,
      SA,
      SE,
      SR,
      Arg = void
    >(
      body: (
        arg: Arg,
        ctx: CommandContextLocal2<Id, I18nKey, State>
      ) => Generator<Eff, Stream.Stream<SA, SE, SR>, never>
    ): CommandOut<
      Arg,
      SA,
      | SE
      | ([Eff] extends [never] ? never
        : [Eff] extends [Effect.Yieldable<any, infer _A, infer E, infer _R>] ? E
        : never),
      | SR
      | ([Eff] extends [never] ? never
        : [Eff] extends [Effect.Yieldable<any, infer _A, infer _E, infer R>] ? R
        : never),
      Id,
      I18nKey,
      State
    >
    <
      Eff extends Effect.Yieldable<any, any, any, RT | CommandContext | `Commander.Command.${Id}.state`>,
      SA,
      SE,
      SR,
      B,
      Arg = void
    >(
      body: (
        arg: Arg,
        ctx: CommandContextLocal2<Id, I18nKey, State>
      ) => Generator<Eff, Stream.Stream<SA, SE, SR>, never>,
      a: (
        _: Effect.Effect<
          Stream.Stream<SA, SE, SR>,
          ([Eff] extends [never] ? never
            : [Eff] extends [Effect.Yieldable<any, infer _A, infer E, infer _R>] ? E
            : never),
          ([Eff] extends [never] ? never
            : [Eff] extends [Effect.Yieldable<any, infer _A, infer _E, infer R>] ? R
            : never)
        >,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => B
    ): B extends Stream.Stream<infer SA2, infer SE2, infer SR2> ? CommandOut<Arg, SA2, SE2, SR2, Id, I18nKey, State>
      : B extends Effect.Effect<Stream.Stream<infer SA2, infer SE2, infer SR2>, infer EE2, infer ER2>
        ? CommandOut<Arg, SA2, SE2 | EE2, SR2 | ER2, Id, I18nKey, State>
      : never
  }

  /**
   * Type for `streamFn` — non-generator overload accepting a function that returns a `Stream` directly,
   * or an `Effect` that resolves to a `Stream`.
   */
  export type NonGenStream<RT, Id extends string, I18nKey extends string, State extends IntlRecord | undefined> = {
    <
      SA,
      SE,
      SR extends RT | CommandContext | `Commander.Command.${Id}.state`,
      Arg = void
    >(
      body: (arg: Arg, ctx: CommandContextLocal2<Id, I18nKey, State>) => Stream.Stream<SA, SE, SR>
    ): CommandOut<Arg, SA, SE, SR, Id, I18nKey, State>
    <
      SA,
      SE,
      SR,
      A extends Stream.Stream<any, any, RT | CommandContext | `Commander.Command.${Id}.state`>,
      Arg = void
    >(
      body: (arg: Arg, ctx: CommandContextLocal2<Id, I18nKey, State>) => Stream.Stream<SA, SE, SR>,
      a: (
        _: Stream.Stream<SA, SE, SR>,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => A
    ): CommandOut<Arg, Stream.Success<A>, Stream.Error<A>, Stream.Services<A>, Id, I18nKey, State>
    <
      SA,
      SE,
      SR,
      EE,
      ER extends RT | CommandContext | `Commander.Command.${Id}.state`,
      Arg = void
    >(
      body: (
        arg: Arg,
        ctx: CommandContextLocal2<Id, I18nKey, State>
      ) => Effect.Effect<Stream.Stream<SA, SE, SR>, EE, ER>
    ): CommandOut<Arg, SA, SE | EE, SR | ER, Id, I18nKey, State>
    <
      SA,
      SE,
      SR,
      EE,
      ER,
      B,
      Arg = void
    >(
      body: (
        arg: Arg,
        ctx: CommandContextLocal2<Id, I18nKey, State>
      ) => Effect.Effect<Stream.Stream<SA, SE, SR>, EE, ER>,
      a: (
        _: Effect.Effect<Stream.Stream<SA, SE, SR>, EE, ER>,
        arg: ArgForCombinator<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => B
    ): B extends Stream.Stream<infer SA2, infer SE2, infer SR2> ? CommandOut<Arg, SA2, SE2, SR2, Id, I18nKey, State>
      : B extends Effect.Effect<Stream.Stream<infer SA2, infer SE2, infer SR2>, infer EE2, infer ER2>
        ? CommandOut<Arg, SA2, SE2 | EE2, SR2 | ER2, Id, I18nKey, State>
      : never
  }
}

type ErrorRenderer<E, Args extends readonly any[]> = (e: E, action: string, ...args: Args) => string | undefined

type RegisteredErrorRenderer<A> = {
  guard: Refinement<unknown, A>
  render: (guarded: A) => string | undefined
}

export class CommanderErrorRenderers extends Context.Reference("Commander.ErrorRenderers", {
  defaultValue: () => [] as RegisteredErrorRenderer<any>[]
}) {}

export const makeRegisteredErrorRenderer = <A>(
  guard: Predicate.Refinement<unknown, A>,
  render: (guarded: A) => string | undefined
): RegisteredErrorRenderer<A> => ({
  guard,
  render
})

const renderErrorMaker = Effect.gen(function*() {
  const { intl } = yield* I18n
  const registeredRenderers = yield* CommanderErrorRenderers
  return (
    <E, Args extends readonly any[]>(action: string, errorRenderer?: ErrorRenderer<E, Args>) =>
    (e: E, ...args: Args): string => {
      if (errorRenderer) {
        const m = errorRenderer(e, action, ...args)
        if (m !== undefined) {
          return m
        }
      }
      for (const entry of registeredRenderers) {
        if (!entry.guard(e)) {
          continue
        }
        const m = entry.render(e)
        if (m !== undefined) {
          return m
        }
      }
      if (!S.is(SupportedErrors)(e) && !S.isSchemaError(e)) {
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
      const e2: SupportedErrors | S.SchemaError = e
      return Match.value(e2).pipe(
        Match.tags({
          NotFoundError: (e) => {
            return intl.formatMessage({ id: "handle.not_found" }, { type: e.type, id: e.id })
          },
          SchemaError: (e) => {
            console.warn(e.toString())
            return intl.formatMessage({ id: "validation.failed" })
          }
        }),
        Match.orElse((e) => `${e.message ?? e._tag ?? e}`)
      )
    }
  )
})

const defaultFailureMessageHandler = <E, Args extends Array<unknown>, AME, AMR>(
  actionMaker:
    | string
    | ((o: Option.Option<E>, ...args: Args) => string)
    | ((o: Option.Option<E>, ...args: Args) => Effect.Effect<string, AME, AMR>),
  errorRenderer?: ErrorRenderer<E, Args>
) =>
  Effect.fnUntraced(function*(o: Option.Option<E>, ...args: Args) {
    const action = yield* wrapEffect(actionMaker)(o, ...args)
    const { intl } = yield* I18n
    const renderError = yield* renderErrorMaker

    return Option.match(o, {
      onNone: () =>
        intl.formatMessage(
          { id: "handle.unexpected_error2" },
          {
            action,
            error: "" // TODO consider again Cause.pretty(cause), // will be reported to Sentry/Otel anyway.. and we shouldn't bother users with error dumps?
          }
        ),
      onSome: (e) => {
        const rendered = renderError(action, errorRenderer)(e, ...args)
        return S.is(OperationFailure)(e)
          ? {
            level: "warn" as const,
            message: `${
              intl.formatMessage(
                { id: "handle.with_warnings" },
                { action }
              )
            }${rendered ? "\n" + rendered : ""}`
          }
          : {
            level: "warn" as const,
            message: `${
              intl.formatMessage(
                { id: "handle.with_errors" },
                { action }
              )
            }:\n` + rendered
          }
      }
    })
  })

export const CommanderStatic = {
  accessArgs: <In, Out, Arg2, Arg = void>(
    cb: (a: NoInfer<Arg>, b: NoInfer<Arg2>) => (self: NoInfer<In>) => Out
  ) =>
  (self: In, arg: Arg, arg2: Arg2) => cb(arg, arg2)(self),

  /**
   * Stream pipe operator that maps each emitted value to a `Progress` entry and updates the
   * command's reactive `progress` ref via the `CommandProgress` service.
   *
   * The mapper receives an `AsyncResult<A, E>` (each emitted value wrapped as
   * `AsyncResult.success(value, { waiting: true })`), matching the same shape used by
   * `CommandButton`'s `:progress-map` prop.
   *
   * Designed to be used inside a `streamFn` handler (either directly with `.pipe()`, or as
   * a combinator argument):
   *
   * @example
   * ```ts
   * // Inside the handler body:
   * Command.streamFn("exportData")(function*(arg, ctx) {
   *   return makeExportStream(arg.id).pipe(
   *     Command.mapProgress((r) =>
   *       AsyncResult.isSuccess(r) && r.value._tag === "OperationProgress"
   *         ? { text: `${r.value.completed}/${r.value.total}`, percentage: r.value.completed / r.value.total * 100 }
   *         : undefined
   *     )
   *   )
   * })
   *
   * // Or as a stream combinator argument:
   * Command.streamFn("exportData")(
   *   function*(arg, ctx) { return makeExportStream(arg.id) },
   *   (s) => s.pipe(Command.mapProgress((r) => AsyncResult.isSuccess(r) && r.value._tag === "OperationProgress" ? { text: `${r.value.completed}/${r.value.total}` } : undefined))
   * )
   * ```
   */
  mapProgress:
    <A, E>(fn: (result: AsyncResult.AsyncResult<A, E>) => Progress | undefined) =>
    <R>(stream: Stream.Stream<A, E, R>): Stream.Stream<A, E, R> =>
      stream.pipe(
        Stream.tap((v) => {
          const p = fn(AsyncResult.success(v, { waiting: true }))
          return p !== undefined ? CommandProgress.use((s) => s.update(p)) : Effect.void
        })
      ),

  /**
   * Imperatively push a progress update from inside a `streamFn` handler.
   * Requires `CommandProgress` to be in context — provided automatically for all `streamFn` streams.
   *
   * @example
   * ```ts
   * // In a streamFn handler:
   * stream.pipe(
   *   Stream.tap((event) =>
   *     event._tag === "OperationProgress"
   *       ? Command.updateProgress({ text: `${event.completed}/${event.total}`, percentage: event.completed / event.total * 100 })
   *       : Effect.void
   *   )
   * )
   * ```
   */
  updateProgress: (progress: Progress | undefined): Effect.Effect<void> =>
    CommandProgress.use((s) => s.update(progress)),

  /** Version of @see confirmOrInterrupt that automatically includes the action name in the default messages */
  confirmOrInterrupt: Effect.fnUntraced(function*(
    message: string | undefined = undefined
  ) {
    const context = yield* CommandContext
    const { intl } = yield* I18n

    yield* Confirm.confirmOrInterrupt(
      message
        ?? intl.formatMessage(
          { id: "handle.confirmation" },
          { action: context.action }
        )
    )
  }),
  /** Version of @see confirm that automatically includes the action name in the default messages */
  confirm: Effect.fnUntraced(function*(
    message: string | undefined = undefined
  ) {
    const context = yield* CommandContext
    const { intl } = yield* I18n
    return yield* Confirm.confirm(
      message
        ?? intl.formatMessage(
          { id: "handle.confirmation" },
          { action: context.action }
        )
    )
  }),
  updateAction:
    <Args extends Array<unknown>>(update: (currentActionId: string, ...args: Args) => string) =>
    <A, E, R>(_: Effect.Effect<A, E, R>, ...input: Args) =>
      Effect.updateService(
        _,
        CommandContext,
        (c) => ({ ...c, action: update(c.action, ...input) })
      ),
  registerErrorRenderer: <A>(
    guard: Predicate.Refinement<unknown, A>,
    render: (guarded: A) => string | undefined
  ) =>
    Layer.effect(
      CommanderErrorRenderers,
      Effect.gen(function*() {
        const current = yield* CommanderErrorRenderers
        return [...current, makeRegisteredErrorRenderer(guard, render)]
      })
    ),
  defaultFailureMessageHandler,
  renderError: renderErrorMaker,
  /**
   * Version of withDefaultToast that automatically includes the action name in the default messages and uses intl.
   * uses the Command id as i18n namespace.  `action.{id}` is the main action name,
   * and `action.{id}.waiting`, `action.{id}.success`, `action.{id}.failure` can be used to override the default messages for the respective states.
   *
   * the computed `state` provided to the Command can be used for interpolation in the i18n messages. (the state is captured at the start of each command execution and remains stable throughout)
   *
   * Note: if you provide `onWaiting` or `onSuccess` as `null`, no toast will be shown for that state.
   * If you provide a string or function, it will be used instead of the i18n message.
   * If you provide an `errorRenderer`, it will be used to render errors in the failure message.
   */
  withDefaultToast: <A, E, R, Args extends Array<unknown>>(
    options?: {
      /**
       * if true, previous toasts with this key will be replaced
       */
      stableToastId?:
        | undefined
        | true
        | string
        | ((id: string, arg: NoInfer<Args>[0], ctx: NoInfer<Args>[1]) => true | string | undefined)
      errorRenderer?: (e: E, action: string, arg: NoInfer<Args>[0], ctx: NoInfer<Args>[1]) => string | undefined
      showSpanInfo?: false
      onWaiting?:
        | null
        | undefined
        | string
        | ((id: string, arg: NoInfer<Args>[0], ctx: NoInfer<Args>[1]) => string | null | undefined)
      onSuccess?:
        | null
        | undefined
        | string
        | ((a: A, action: string, arg: NoInfer<Args>[0], ctx: NoInfer<Args>[1]) => string | null | undefined)
    }
  ) =>
    Effect.fnUntraced(function*(
      self: Effect.Effect<A, E, R>,
      ...args: Args
    ) {
      const cc = yield* CommandContext
      const { intl } = yield* I18n
      const withToast = yield* WithToast
      const customWaiting = cc.namespaced("waiting")
      const hasCustomWaiting = !!intl.messages[customWaiting]
      const customSuccess = cc.namespaced("success")
      const hasCustomSuccess = !!intl.messages[customSuccess]
      const customFailure = cc.namespaced("failure")
      const hasCustomFailure = !!intl.messages[customFailure]
      const stableToastId = options?.stableToastId
        ? typeof options.stableToastId === "string"
          ? options.stableToastId
          : typeof options.stableToastId === "boolean"
          ? cc.id
          : typeof options.stableToastId === "function"
          ? (...args: Args) => {
            const r = (options.stableToastId as any)(cc.id, ...args)
            if (typeof r === "string") return r
            if (r === true) return cc.id
            return undefined
          }
          : undefined
        : undefined
      return yield* self.pipe(
        (_) =>
          withToast<A, E, Args, R, never, never, I18n>({
            onWaiting: options?.onWaiting === null ? null : hasCustomWaiting
              ? intl.formatMessage({
                id: customWaiting
              }, cc.state)
              : intl.formatMessage(
                { id: "handle.waiting" },
                { action: cc.action }
              ),
            onSuccess: options?.onSuccess === null
              ? null
              : (a, ..._args) =>
                hasCustomSuccess
                  ? intl.formatMessage(
                    { id: customSuccess },
                    cc.state
                  )
                  : (intl.formatMessage({ id: "handle.success" }, { action: cc.action })
                    + (S.is(OperationSuccess)(a) && a.message ? "\n" + a.message : "")),
            onFailure: defaultFailureMessageHandler(
              hasCustomFailure ? intl.formatMessage({ id: customFailure }, cc.state) : cc.action,
              options?.errorRenderer as ErrorRenderer<E, Args> | undefined
            ),
            stableToastId,
            ...options?.showSpanInfo === false ? { showSpanInfo: options.showSpanInfo } : {}
          })(_, ...args)
      )
    }),

  /**
   * Stream-aware version of `withDefaultToast`. Use this as a combinator inside `streamFn`
   * (or anywhere a `Stream` needs toast lifecycle handling) instead of `withDefaultToast`.
   *
   * Unlike `withDefaultToast` (which only wraps the initial `Effect`), this combinator:
   * - Shows the "waiting" toast **before** the stream starts
   * - Updates the waiting toast with progress text when `progress` is set and a new element arrives
   * - Shows the "success" toast only **after** the stream drains fully without error
   * - Shows the "failure" toast if the stream errors or fails
   *
   * Accepts either a `Stream<A, E, R>` or an `Effect<Stream<A, E, R>, EE, ER>` as input,
   * so it works in both the `NonGenStream` and `StreamGen` overloads of `streamFn`.
   *
   * @example
   * ```ts
   * Command.streamFn("exportData")(
   *   function*(arg, ctx) { return makeExportStream(arg.id) },
   *   Command.withDefaultToastStream({
   *     progress: (r) =>
   *       AsyncResult.isSuccess(r) && r.value._tag === "OperationProgress"
   *         ? { text: `${r.value.completed}/${r.value.total}`, percentage: r.value.completed / r.value.total * 100 }
   *         : undefined
   *   })
   * )
   * ```
   */
  withDefaultToastStream: <A, E, R, Args extends Array<unknown>>(
    options?: {
      stableToastId?:
        | undefined
        | true
        | string
        | ((id: string, arg: NoInfer<Args>[0], ctx: NoInfer<Args>[1]) => true | string | undefined)
      errorRenderer?: (e: E, action: string, arg: NoInfer<Args>[0], ctx: NoInfer<Args>[1]) => string | undefined
      showSpanInfo?: false
      onWaiting?:
        | null
        | undefined
        | string
        | ((id: string, arg: NoInfer<Args>[0], ctx: NoInfer<Args>[1]) => string | null | undefined)
      onSuccess?:
        | null
        | undefined
        | string
        | ((a: A, action: string, arg: NoInfer<Args>[0], ctx: NoInfer<Args>[1]) => string | null | undefined)
      /** Map each stream element to a progress label. When non-`undefined`, the active waiting toast is updated to show the progress text. */
      progress?: (result: AsyncResult.AsyncResult<A, E>) => Progress | undefined
    }
  ) =>
  (
    self: Stream.Stream<A, E, R> | Effect.Effect<Stream.Stream<A, E, R>, any, any>,
    ...args: Args
  ): Stream.Stream<A, E, R | I18n | Toast | CommandContext> => {
    const rawStream: Stream.Stream<A, E, R> = Stream.isStream(self)
      ? self
      : Stream.unwrap(self)

    return Stream.unwrap(Effect.gen(function*() {
      const cc = yield* CommandContext
      const { intl } = yield* I18n
      const toast = yield* Toast

      const customWaiting = cc.namespaced("waiting")
      const hasCustomWaiting = !!intl.messages[customWaiting]
      const customSuccess = cc.namespaced("success")
      const hasCustomSuccess = !!intl.messages[customSuccess]
      const customFailure = cc.namespaced("failure")
      const hasCustomFailure = !!intl.messages[customFailure]

      const stableToastId: string | undefined = options?.stableToastId
        ? typeof options.stableToastId === "string"
          ? options.stableToastId
          : typeof options.stableToastId === "boolean"
          ? cc.id
          : typeof options.stableToastId === "function"
          ? (() => {
            const r = (options.stableToastId as (...a: any[]) => true | string | undefined)(cc.id, ...args)
            if (typeof r === "string") return r
            if (r === true) return cc.id
            return undefined
          })()
          : undefined
        : undefined

      const baseTimeout = 3_000

      const waitingMsg: string | null = options?.onWaiting === null
        ? null
        : typeof options?.onWaiting === "string"
        ? options.onWaiting
        : typeof options?.onWaiting === "function"
        ? (options.onWaiting as (...a: any[]) => string | null | undefined)(cc.id, ...args) ?? null
        : hasCustomWaiting
        ? intl.formatMessage({ id: customWaiting }, cc.state)
        : intl.formatMessage({ id: "handle.waiting" }, { action: cc.action })

      const toastId: string | number | undefined = waitingMsg === null
        ? stableToastId
        : yield* toast.info(waitingMsg, { id: stableToastId ?? null })

      const failureHandler = defaultFailureMessageHandler<E, [], never, never>(
        hasCustomFailure ? intl.formatMessage({ id: customFailure }, cc.state) : cc.action,
        options?.errorRenderer as ErrorRenderer<E, []> | undefined
      )

      let lastValue: A | undefined = undefined
      let didFail = false

      const composed = rawStream.pipe(
        Stream.tap((v) =>
          Effect.gen(function*() {
            lastValue = v
            if (options?.progress !== undefined && toastId !== undefined) {
              const p = options.progress(AsyncResult.success(v, { waiting: true }))
              if (p !== undefined) {
                const progressText = typeof p === "string" ? p : p.text
                const msg = waitingMsg ? `${waitingMsg}\n${progressText}` : progressText
                yield* toast.info(msg, { id: toastId })
              }
            }
          })
        ),
        Stream.tapCause(Effect.fnUntraced(function*(cause) {
          didFail = true
          if (Cause.hasInterruptsOnly(cause)) {
            if (toastId !== undefined) yield* toast.dismiss(toastId)
            return
          }

          const spanInfo = options?.showSpanInfo !== false
            ? yield* Effect.currentSpan.pipe(
              Effect.map((span) => `\nTrace: ${span.traceId}\nSpan: ${span.spanId}`),
              Effect.orElseSucceed(() => "")
            )
            : ""

          const t = yield* failureHandler(Cause.findErrorOption(cause))
          const opts = { timeout: baseTimeout * 2 }

          if (typeof t === "object") {
            const message = t.message + spanInfo
            yield* t.level === "warn"
              ? toast.warning(message, toastId !== undefined ? { ...opts, id: toastId } : opts)
              : toast.error(message, toastId !== undefined ? { ...opts, id: toastId } : opts)
          } else {
            yield* toast.error(t + spanInfo, toastId !== undefined ? { ...opts, id: toastId } : opts)
          }
        }, Effect.uninterruptible)),
        Stream.ensuring(Effect.suspend(() => {
          if (didFail) return Effect.void

          if (options?.onSuccess === null) return Effect.void

          const successMsg: string | null = typeof options?.onSuccess === "string"
            ? options.onSuccess
            : typeof options?.onSuccess === "function"
            ? (options.onSuccess as (...a: any[]) => string | null | undefined)(lastValue, cc.action, ...args) ?? null
            : hasCustomSuccess
            ? intl.formatMessage({ id: customSuccess }, cc.state)
            : intl.formatMessage({ id: "handle.success" }, { action: cc.action })
              + (S.is(OperationSuccess)(lastValue) && lastValue.message ? "\n" + lastValue.message : "")

          if (successMsg === null) return Effect.void

          return toast.success(
            successMsg,
            toastId !== undefined ? { id: toastId, timeout: baseTimeout } : { timeout: baseTimeout }
          )
        }))
      )

      return (toastId !== undefined
        ? composed.pipe(Stream.provideService(CurrentToastId, CurrentToastId.of({ toastId })))
        : composed) as unknown as Stream.Stream<A, E, R>
    }))
  },

  /** borrowing the idea from Families in Effect Atom */
  family: <T extends object, Arg, ArgIn = Arg>(
    maker: (arg: Arg) => T,
    keyMaker?: (arg: ArgIn) => Arg
  ): (arg: ArgIn) => T => {
    const commands = MutableHashMap.empty<Arg, WeakRef<T>>()
    const registry = new FinalizationRegistry<Arg>((arg) => {
      MutableHashMap.remove(commands, arg)
    })

    return (_k: ArgIn) => {
      const k = keyMaker ? keyMaker(_k) : _k as unknown as Arg
      // we want to compare structurally, unless custom equal/hash has been implemented
      const item = MutableHashMap.get(commands, k).pipe(Option.flatMap((r) => Option.fromNullishOr(r.deref())))
      if (item.value) {
        return item.value
      }
      const v = maker(k)
      MutableHashMap.set(commands, k, new WeakRef(v))

      registry.register(v, k)
      return v
    }
  }
}

const makeBaseInfo = <const Id extends string, const I18nKey extends string = Id>(
  id: Id,
  options?: Pick<FnOptionsInternal<I18nKey>, "i18nCustomKey">
) => {
  if (!id) throw new Error("must specify an id")
  const i18nKey: I18nKey = options?.i18nCustomKey ?? id as unknown as I18nKey

  const namespace = `action.${i18nKey}` as const

  const context = {
    id,
    i18nKey,
    namespace,
    namespaced: <const K extends string>(k: K) => `${namespace}.${k}` as const
  }

  return context
}

const waitState = ref<Record<string, number>>({})
const registerWait = (id: string) => {
  // console.debug("register wait", id)
  waitState.value[id] = waitState.value[id] ? waitState.value[id] + 1 : 1
}
const unregisterWait = (id: string) => {
  // console.debug("unregister wait", id)
  if (waitState.value[id]) {
    waitState.value[id] = waitState.value[id] - 1
    if (waitState.value[id] <= 0) {
      delete waitState.value[id]
    }
  }
}

const getStateValues = <
  const Id extends string,
  const I18nKey extends string,
  State extends IntlRecord | undefined
>(
  options?: FnOptions<Id, I18nKey, State>
): ComputedRef<State> => {
  const state_ = options?.state
  const state = !state_ ? computed(() => undefined as State) : typeof state_ === "function"
    ? computed(state_)
    : state_
  return state
}

// class preserves JSDoc throughout..
export class CommanderImpl<RT, RTHooks> {
  constructor(
    private readonly rt: Context.Context<RT>,
    private readonly intl: I18n,
    private readonly hooks: Layer.Layer<RTHooks, never, RT>
  ) {
  }

  readonly makeContext = <const Id extends string, const I18nKey extends string = Id>(
    id: Id,
    options?: FnOptionsInternal<I18nKey>
  ) => {
    if (!id) throw new Error("must specify an id")
    const i18nKey: I18nKey = options?.i18nCustomKey ?? id as unknown as I18nKey

    const namespace = `action.${i18nKey}` as const

    // must remain stable through out single call
    const action = this.intl.formatMessage({
      id: namespace,
      defaultMessage: id
    }, { ...options?.state, _isLabel: false })

    const label = this.intl.formatMessage({
      id: namespace,
      defaultMessage: id
    }, { ...options?.state, _isLabel: true })

    const context = CommandContext.of({
      ...makeBaseInfo(id, options),
      action,
      label,
      state: options?.state
    })

    return context
  }

  readonly makeCommand = <
    const Id extends string,
    const State extends IntlRecord | undefined,
    const I18nKey extends string = Id,
    RunningA = unknown,
    RunningE = unknown
  >(
    id_: Id | { id: Id },
    options?: FnOptions<Id, I18nKey, State>,
    errorDef?: Error,
    streamMeta?: {
      running?: ComputedRef<AsyncResult.AsyncResult<RunningA, RunningE>> | undefined
      progress?: ComputedRef<Progress | undefined> | undefined
    }
  ) => {
    const id = typeof id_ === "string" ? id_ : id_.id
    const state = getStateValues(options)

    return Object.assign(
      <Arg, A, E, R extends RT | RTHooks | CommandContext | `Commander.Command.${Id}.state`>(
        handler: (arg: Arg, ctx: Commander.CommandContextLocal2<Id, I18nKey, State>) => Effect.Effect<A, E, R>
      ) => {
        // we capture the definition stack here, so we can append it to later stack traces
        const limit = Error.stackTraceLimit
        Error.stackTraceLimit = 2
        const localErrorDef = new Error()
        Error.stackTraceLimit = limit
        if (!errorDef) {
          errorDef = localErrorDef
        }

        const key = `Commander.Command.${id}.state` as const
        const stateTag = Context.Service<typeof key, State>(key)

        const makeContext_ = () => this.makeContext(id, { ...options, state: state?.value })
        const initialContext = makeContext_()
        const context = computed(() => makeContext_())
        const action = computed(() => context.value.action)
        const label = computed(() => context.value.label)

        const errorReporter = <A, E, R>(self: Effect.Effect<A, E, R>) =>
          self.pipe(
            Effect.tapCause(
              Effect.fnUntraced(function*(cause) {
                if (Cause.hasInterruptsOnly(cause)) {
                  console.info(`Interrupted while trying to ${id}`)
                  return
                }

                const fail = Cause.findErrorOption(cause)
                if (Option.isSome(fail)) {
                  // if (fail.value._tag === "SuppressErrors") {
                  //   console.info(
                  //     `Suppressed error trying to ${action}`,
                  //     fail.value,
                  //   )
                  //   return
                  // }
                  const message = `Failure trying to ${id}`
                  yield* reportMessage(message, {
                    action: id,
                    error: fail.value
                  })
                  return
                }

                const context = yield* CommandContext
                const extra = {
                  action: context.action,
                  message: `Unexpected Error trying to ${id}`
                }
                yield* reportRuntimeError(cause, extra)
              }, Effect.uninterruptible)
            )
          )

        const currentState = Effect.sync(() => state.value)

        const theHandler = flow(
          handler,
          errorReporter,
          // all must be within the Effect.fn to fit within the Span
          Effect.provideServiceEffect(
            stateTag,
            currentState
          ),
          Effect.provideServiceEffect(
            CommandContext,
            Effect.sync(() => makeContext_())
          )
        )
        const waitId = options?.waitKey ? options.waitKey(id) : undefined
        const blockId = options?.blockKey ? options.blockKey(id) : undefined

        const [result, exec_] = asResult(theHandler)

        const exec = Effect
          .fnUntraced(
            function*(...args: [any, any]) {
              if (waitId !== undefined) registerWait(waitId)
              if (blockId !== undefined && blockId !== waitId) {
                registerWait(blockId)
              }
              return yield* exec_(...args)
            },
            Effect.onExit(() =>
              Effect.sync(() => {
                if (waitId !== undefined) unregisterWait(waitId)
                if (blockId !== undefined && blockId !== waitId) {
                  unregisterWait(blockId)
                }
              })
            )
          )

        const waiting = waitId !== undefined
          ? computed(() => result.value.waiting || (waitState.value[waitId] ?? 0) > 0)
          : computed(() => result.value.waiting)

        const blocked = blockId !== undefined
          ? computed(() => waiting.value || (waitState.value[blockId] ?? 0) > 0)
          : computed(() => waiting.value)

        const computeAllowed = options?.allowed
        const allowed = computeAllowed ? computed(() => computeAllowed(id, state)) : true

        const rt = Effect.context<RT | RTHooks>().pipe(Effect.provide(this.hooks)).pipe(Effect.runSyncWith(this.rt))
        const runFork = Effect.runForkWith(rt)

        const handle = Object.assign((arg: Arg) => {
          arg = toRaw(arg) // remove outside vue proxy bs
          // we capture the call site stack here
          const limit = Error.stackTraceLimit
          Error.stackTraceLimit = 2
          const errorCall = new Error()
          Error.stackTraceLimit = limit

          let cache: false | string = false
          const captureStackTrace = () => {
            // in case of an error, we want to append the definition stack to the call site stack,
            // so we can see where the handler was defined too

            if (cache !== false) {
              return cache
            }
            if (errorCall.stack) {
              const stackDef = errorDef!.stack!.trim().split("\n")
              const stackCall = errorCall.stack.trim().split("\n")
              let endStackDef = stackDef.slice(2).join("\n").trim()
              if (!endStackDef.includes(`(`)) {
                endStackDef = endStackDef.replace(/at (.*)/, "at ($1)")
              }
              let endStackCall = stackCall.slice(2).join("\n").trim()
              if (!endStackCall.includes(`(`)) {
                endStackCall = endStackCall.replace(/at (.*)/, "at ($1)")
              }
              cache = `${endStackDef}\n${endStackCall}`
              return cache
            }
          }

          const command = currentState.pipe(Effect.flatMap((state) => {
            const rawArg = deepToRaw(arg)
            const rawState = deepToRaw(state)
            return Effect.withSpan(
              exec(arg, { ...context.value, state } as any),
              id,
              {
                captureStackTrace,
                attributes: {
                  input: rawArg,
                  state: rawState,
                  action: initialContext.action,
                  label: initialContext.label,
                  id: initialContext.id,
                  i18nKey: initialContext.i18nKey
                }
              }
            )
          }))

          return runFork(command)
        }, { action, label })

        return reactive({
          /** static */
          id,

          /** the base i18n key, based on id by default. static */
          i18nKey: initialContext.i18nKey,
          /** the `action.` namespace based on i18nKey.. static */
          namespace: initialContext.namespace,

          /** easy generate namespaced 18n keys, based on namespace. static */
          namespaced: initialContext.namespaced,

          /** reactive */
          result,
          /** reactive – live AsyncResult of the underlying stream, exposed only when
           * the stream factory was called with a `progress` formatter */
          running: streamMeta?.running,
          /** reactive – formatted progress info for current `running` state, when `progress`
           * formatter was supplied to the stream factory */
          progress: streamMeta?.progress,
          /** reactive */
          waiting,
          /** reactive */
          blocked,
          /** reactive */
          allowed,
          /** reactive */
          action,
          /** reactive */
          label,
          /** reactive */
          state,

          handle
        })
      },
      { id }
    )
  }

  // /** @experimental */
  // takeOver:
  //   <Args extends any[], A, E, R, const Id extends string>(command: Commander.CommandOut<Args, A, E, R, Id,I18nKey>) =>
  //   (...args: Args) => {
  //     // we capture the call site stack here
  //     const limit = Error.stackTraceLimit
  //     Error.stackTraceLimit = 2
  //     const errorCall = new Error()
  //     const localErrorDef = new Error()
  //     Error.stackTraceLimit = limit

  //     // TODO
  //     const errorDef = localErrorDef

  //     let cache: false | string = false
  //     const captureStackTrace = () => {
  //       // in case of an error, we want to append the definition stack to the call site stack,
  //       // so we can see where the handler was defined too

  //       if (cache !== false) {
  //         return cache
  //       }
  //       if (errorCall.stack) {
  //         const stackDef = errorDef.stack!.trim().split("\n")
  //         const stackCall = errorCall.stack.trim().split("\n")
  //         let endStackDef = stackDef.slice(2).join("\n").trim()
  //         if (!endStackDef.includes(`(`)) {
  //           endStackDef = endStackDef.replace(/at (.*)/, "at ($1)")
  //         }
  //         let endStackCall = stackCall.slice(2).join("\n").trim()
  //         if (!endStackCall.includes(`(`)) {
  //           endStackCall = endStackCall.replace(/at (.*)/, "at ($1)")
  //         }
  //         cache = `${endStackDef}\n${endStackCall}`
  //         return cache
  //       }
  //     }

  //     return Effect.gen(function*() {
  //       const ctx = yield* CommandContext
  //       ctx.action = command.action
  //       return yield* command.exec(...args).pipe(
  //         Effect.flatten,
  //         Effect.withSpan(
  //           command.action,
  //           { captureStackTrace }
  //         )
  //       )
  //     })
  //   },

  /**
   * Define a Command for handling user actions with built-in error reporting and state management.
   *
   * @param id The internal identifier for the action. Used as a tracing span and to lookup
   *                   the user-facing name via internationalization (`action.${id}`).
   * @param options Optional configuration for internationalization and state.
   * @param options.i18nCustomKey Custom i18n key to use instead of `id` (e.g., for grouping similar actions)
   * @param options.state Optional reactive state object (or function returning one) that is
   *                     made available to the command effects and can be used for i18n interpolation.
   *                     The state is captured at the start of each command execution and remains stable throughout.
   * @returns A function that executes the command when called (e.g., directly in `@click` handlers).
   *          Built-in error reporting handles failures automatically.
   *
   * **Effect Context**: Effects have access to the `CommandContext` service, which provides
   * the user-facing action name.
   *
   * **Returned Properties**:
   * - `action`: User-facing action name from intl messages (useful for button labels)
   * - `result`: The command result state
   * - `waiting`: Boolean indicating if the command is in progress (shorthand for `result.waiting`)
   * - `handle`: Function to execute the command
   * - `exec`: The raw Effect that will be executed when calling `handle` (for advanced use cases)
   * - `i18nKey`, `namespace`, `namespaced`: Helpers for internationalization keys
   *
   * **User Feedback**: Use the `withDefaultToast` helper for status notifications, or render
   * the `result` inline for custom UI feedback.
   */
  fn = <
    const Id extends string,
    const State extends IntlRecord = IntlRecord,
    const I18nKey extends string = Id,
    RunningA = unknown,
    RunningE = unknown
  >(
    id:
      | Id
      | { id: Id }
      | StreamMutationCallable<Id, any, RunningA, RunningE, any>
      | StreamMutationFactory<Id, any, RunningA, RunningE, any>,
    options?: FnOptions<Id, I18nKey, State>
  ): Commander.Gen<RT | RTHooks, Id, I18nKey, State> & Commander.NonGen<RT | RTHooks, Id, I18nKey, State> & {
    state: Context.Service<`Commander.Command.${Id}.state`, State>
  } => {
    // Resolve id and (optionally) per-build stream metadata.
    const resolvedId: Id = typeof id === "string" ? id : (id as { id: Id }).id
    const factory = isStreamFactory(id)
    const callable = !factory && isStreamCallable(id)
    const resolveStreamMeta = ():
      | {
        running?: ComputedRef<AsyncResult.AsyncResult<RunningA, RunningE>> | undefined
        progress?: ComputedRef<Progress | undefined> | undefined
      }
      | undefined =>
    {
      if (factory) {
        const c = id()
        return { running: c.running, progress: c.progress }
      }
      if (callable) {
        const c = id as StreamMutationCallable<Id, any, RunningA, RunningE, any>
        return { running: c.running, progress: c.progress }
      }
      return undefined
    }
    return Object.assign(
      (
        fn: any,
        ...combinators: any[]
      ): any => {
        // we capture the definition stack here, so we can append it to later stack traces
        const limit = Error.stackTraceLimit
        Error.stackTraceLimit = 2
        const errorDef = new Error()
        Error.stackTraceLimit = limit

        const streamMeta = resolveStreamMeta()

        return this.makeCommand(resolvedId, options, errorDef, streamMeta)(
          Effect.fnUntraced(
            // fnUntraced only supports generators as first arg, so we convert to generator if needed
            isGeneratorFunction(fn) ? fn : function*(...args) {
              return yield* fn(...args)
            },
            ...combinators as [any]
          ) as any
        )
      },
      makeBaseInfo(resolvedId, options),
      {
        state: Context.Service<`Commander.Command.${Id}.state`, State>(
          `Commander.Command.${resolvedId}.state`
        )
      }
    )
  }

  /**
   * Internal factory for stream-backed commands. Accepts a handler that returns a `Stream` directly.
   * Services (`CommandContext`, `stateTag`) are provided to the stream via `Stream.provideServiceEffect`.
   */
  readonly makeStreamCommand = <
    const Id extends string,
    const State extends IntlRecord | undefined,
    const I18nKey extends string = Id
  >(
    id_: Id | { id: Id },
    options?: FnOptions<Id, I18nKey, State>,
    errorDef?: Error
  ) => {
    const id = typeof id_ === "string" ? id_ : id_.id
    const state = getStateValues(options)

    return Object.assign(
      <Arg, SA, SE, SR>(
        handler: (arg: Arg, ctx: Commander.CommandContextLocal2<Id, I18nKey, State>) => Stream.Stream<SA, SE, SR>
      ) => {
        const limit = Error.stackTraceLimit
        Error.stackTraceLimit = 2
        const localErrorDef = new Error()
        Error.stackTraceLimit = limit
        if (!errorDef) {
          errorDef = localErrorDef
        }

        const key = `Commander.Command.${id}.state` as const
        const stateTag = Context.Service<typeof key, State>(key)

        const makeContext_ = () => this.makeContext(id, { ...options, state: state?.value })
        const initialContext = makeContext_()
        const context = computed(() => makeContext_())
        const action = computed(() => context.value.action)
        const label = computed(() => context.value.label)

        const currentState = Effect.sync(() => state.value)

        // Reactive ref driven by the CommandProgress service — updated imperatively
        // from inside the stream via `Command.mapProgress(fn)` or `Command.updateProgress(p)`.
        const progressRef = ref<Progress | undefined>(undefined)
        const commandProgressService = {
          update: (p: Progress | undefined) =>
            Effect.sync(() => {
              progressRef.value = p
            })
        }

        const streamErrorReporter = <A, E, R>(self: Stream.Stream<A, E, R>) =>
          self.pipe(
            Stream.tapCause(
              Effect.fnUntraced(function*(cause) {
                if (Cause.hasInterruptsOnly(cause)) {
                  console.info(`Interrupted while trying to ${id}`)
                  return
                }

                const fail = Cause.findErrorOption(cause)
                if (Option.isSome(fail)) {
                  const message = `Failure trying to ${id}`
                  yield* reportMessage(message, {
                    action: id,
                    error: fail.value
                  })
                  return
                }

                const ctx = yield* CommandContext
                const extra = {
                  action: ctx.action,
                  message: `Unexpected Error trying to ${id}`
                }
                yield* reportRuntimeError(cause, extra)
              }, Effect.uninterruptible)
            )
          )

        const theStreamHandler = (arg: Arg, ctx: Commander.CommandContextLocal2<Id, I18nKey, State>) =>
          handler(arg, ctx).pipe(
            streamErrorReporter,
            Stream.provideService(CommandProgress, commandProgressService),
            Stream.provideServiceEffect(stateTag, currentState),
            Stream.provideServiceEffect(CommandContext, Effect.sync(() => makeContext_()))
          )

        const waitId = options?.waitKey ? options.waitKey(id) : undefined
        const blockId = options?.blockKey ? options.blockKey(id) : undefined

        const [result, exec_] = asStreamResult(theStreamHandler)

        const exec = Effect
          .fnUntraced(
            function*(...args: [any, any]) {
              if (waitId !== undefined) registerWait(waitId)
              if (blockId !== undefined && blockId !== waitId) {
                registerWait(blockId)
              }
              return yield* exec_(...args)
            },
            Effect.onExit(() =>
              Effect.sync(() => {
                if (waitId !== undefined) unregisterWait(waitId)
                if (blockId !== undefined && blockId !== waitId) {
                  unregisterWait(blockId)
                }
              })
            )
          )

        const waiting = waitId !== undefined
          ? computed(() => result.value.waiting || (waitState.value[waitId] ?? 0) > 0)
          : computed(() => result.value.waiting)

        const blocked = blockId !== undefined
          ? computed(() => waiting.value || (waitState.value[blockId] ?? 0) > 0)
          : computed(() => waiting.value)

        const computeAllowed = options?.allowed
        const allowed = computeAllowed ? computed(() => computeAllowed(id, state)) : true

        const rt = Effect.context<RT | RTHooks>().pipe(Effect.provide(this.hooks)).pipe(Effect.runSyncWith(this.rt))
        const runFork = Effect.runForkWith(rt)

        const progress = progressRef

        const handle = Object.assign((arg: Arg) => {
          arg = toRaw(arg)
          progressRef.value = undefined // reset progress on new invocation
          const limit = Error.stackTraceLimit
          Error.stackTraceLimit = 2
          const errorCall = new Error()
          Error.stackTraceLimit = limit

          let cache: false | string = false
          const captureStackTrace = () => {
            if (cache !== false) {
              return cache
            }
            if (errorCall.stack) {
              const stackDef = errorDef!.stack!.trim().split("\n")
              const stackCall = errorCall.stack.trim().split("\n")
              let endStackDef = stackDef.slice(2).join("\n").trim()
              if (!endStackDef.includes(`(`)) {
                endStackDef = endStackDef.replace(/at (.*)/, "at ($1)")
              }
              let endStackCall = stackCall.slice(2).join("\n").trim()
              if (!endStackCall.includes(`(`)) {
                endStackCall = endStackCall.replace(/at (.*)/, "at ($1)")
              }
              cache = `${endStackDef}\n${endStackCall}`
              return cache
            }
          }

          const command = currentState.pipe(Effect.flatMap((state) => {
            const rawArg = deepToRaw(arg)
            const rawState = deepToRaw(state)
            return Effect.withSpan(
              exec(arg, { ...context.value, state } as any),
              id,
              {
                captureStackTrace,
                attributes: {
                  input: rawArg,
                  state: rawState,
                  action: initialContext.action,
                  label: initialContext.label,
                  id: initialContext.id,
                  i18nKey: initialContext.i18nKey
                }
              }
            )
          }))

          return runFork(command as any)
        }, { action, label })

        return reactive({
          id,
          i18nKey: initialContext.i18nKey,
          namespace: initialContext.namespace,
          namespaced: initialContext.namespaced,
          result,
          /** always undefined for streamFn commands — `result` already exposes the live stream state */
          running: undefined,
          /** reactive – progress driven by `Command.mapProgress` or `Command.updateProgress` inside the stream */
          progress,
          waiting,
          blocked,
          allowed,
          action,
          label,
          state,
          handle
        })
      },
      { id }
    )
  }

  /**
   * Define a stream-backed Command for handling user actions.
   *
   * Like `fn`, but the body generator (or function) must **return** a `Stream` rather than
   * an `Effect`. The command's `waiting` state stays `true` while the stream is running and
   * is set to `false` once it terminates. The reactive `result` ref is updated for every
   * value emitted by the stream.
   *
   * Three handler shapes are accepted:
   * 1. **Generator returning a Stream** (primary) — may yield Effects freely before returning the stream:
   *    ```ts
   *    Command.streamFn("exportData")(
   *      function*(arg, ctx) {
   *        const token = yield* getAuthToken
   *        return Stream.fromEffect(startExport(token, arg.id)).pipe(
   *          Stream.flatMap((job) => pollProgress(job.id))
   *        )
   *      }
   *    )
   *    ```
   * 2. **Function returning a Stream directly**: `(arg, ctx) => Stream.make(1, 2, 3)`
   * 3. **Function returning `Effect<Stream>`**: `(arg, ctx) => Effect.map(setup, (s) => s.stream)`
   *
   * @param id The internal identifier for the action (used for tracing and i18n lookup).
   * @param options Same options as `fn` (`state`, `blockKey`, `waitKey`, `allowed`, `i18nCustomKey`).
   *
   * **Progress** — use `Command.mapProgress(fn)` as a stream pipe operator; the mapper receives
   * `AsyncResult<A, E>` (each value wrapped as `AsyncResult.success(v, { waiting: true })`),
   * matching the same shape as CommandButton’s `:progress-map` prop. Or call
   * `Command.updateProgress(p)` for imperative control:
   *
   * ```ts
   * // mapProgress as a combinator arg (outside the handler):
   * Command.streamFn("exportData")(
   *   function*(arg, ctx) { return makeExportStream(arg.id) },
   *   (s) => s.pipe(Command.mapProgress((r) => AsyncResult.isSuccess(r) && r.value._tag === "OperationProgress" ? { text: `${r.value.completed}/${r.value.total}` } : undefined))
   * )
   *
   * // Or inline inside the handler body:
   * Command.streamFn("exportData")(function*(arg, ctx) {
   *   return makeExportStream(arg.id).pipe(Command.mapProgress((r) => AsyncResult.isSuccess(r) ? ... : undefined))
   * })
   * ```
   *
   * **Pipeable combinators** — the 2nd–Nth args follow the same pattern as `fn`: each combinator
   * receives `(stream, arg, ctx)` and returns a transformed stream:
   * ```ts
   * Command.streamFn("exportData")(
   *   handler,
   *   (s, arg, ctx) => s.pipe(Command.mapProgress(fn), Stream.take(100))
   * )
   * ```
   *
   * **Returned Properties**: `action`, `label`, `result`, `progress`, `waiting`, `blocked`,
   * `allowed`, `handle`, `i18nKey`, `namespace`, `namespaced`.
   */
  streamFn = <
    const Id extends string,
    const State extends IntlRecord = IntlRecord,
    const I18nKey extends string = Id
  >(
    id: Id | { id: Id },
    options?: FnOptions<Id, I18nKey, State>
  ):
    & Commander.StreamGen<RT | RTHooks, Id, I18nKey, State>
    & Commander.NonGenStream<RT | RTHooks, Id, I18nKey, State>
    & {
      state: Context.Service<`Commander.Command.${Id}.state`, State>
    } =>
  {
    const resolvedId = typeof id === "string" ? id : id.id

    type StreamOrEffect = Stream.Stream<any, any, any> | Effect.Effect<Stream.Stream<any, any, any>, any, any>

    const toRawHandler = (fn: any): (arg: any, ctx: any) => StreamOrEffect => {
      if (isGeneratorFunction(fn)) {
        return Effect.fnUntraced(function*(arg: any, ctx: any) {
          return yield* (fn as (arg: any, ctx: any) => Generator<any, Stream.Stream<any, any, any>, any>)(arg, ctx)
        })
      }
      return fn
    }

    const toFinalStream = (value: StreamOrEffect): Stream.Stream<any, any, any> =>
      Stream.isStream(value) ? value : Stream.unwrap(value as Effect.Effect<Stream.Stream<any, any, any>, any, any>)

    return Object.assign(
      (fn: any, ...combinators: Array<(s: any, arg: any, ctx: any) => any>): any => {
        const limit = Error.stackTraceLimit
        Error.stackTraceLimit = 2
        const errorDef = new Error()
        Error.stackTraceLimit = limit

        const rawHandler = toRawHandler(fn)
        const handler = (arg: any, ctx: any) => {
          let current: any = rawHandler(arg, ctx)
          for (const combinator of combinators) {
            current = combinator(current, arg, ctx)
          }
          return toFinalStream(current)
        }

        return this.makeStreamCommand(id, options, errorDef)(handler)
      },
      makeBaseInfo(resolvedId, options),
      {
        state: Context.Service<`Commander.Command.${Id}.state`, State>(
          `Commander.Command.${resolvedId}.state`
        )
      }
    )
  }

  /** @deprecated */

  alt2: <
    const Id extends string,
    MutArg,
    MutA,
    MutE,
    MutR,
    const I18nKey extends string = Id,
    State extends IntlRecord | undefined = undefined
  >(
    id:
      | Id
      | { id: Id; mutate: (arg: MutArg) => Effect.Effect<MutA, MutE, MutR> }
      | ((arg: MutArg) => Effect.Effect<MutA, MutE, MutR>) & { id: Id },
    options?: FnOptions<Id, I18nKey, State>
  ) =>
    & Commander.CommandContextLocal<Id, I18nKey>
    & (<A, E, R extends RT | RTHooks | CommandContext | `Commander.Command.${Id}.state`, Arg = void>(
      handler: (
        ctx: Effect.fn.Traced & Effect.fn.Untraced & Commander.CommandContextLocal<Id, I18nKey> & {
          // todo: only if we passed in one
          mutate: (arg: Arg) => Effect.Effect<MutA, MutE, MutR>
        }
      ) => (arg: Arg, ctx: Commander.CommandContextLocal2<Id, I18nKey, State>) => Effect.Effect<A, E, R>
    ) => Commander.CommandOut<Arg, A, E, R, Id, I18nKey, State>) = (
      _id,
      options?
    ) => {
      const isObject = Predicate.isObjectKeyword(_id)
      const id = isObject ? _id.id : _id
      const baseInfo = makeBaseInfo(id, options)
      const idCmd = this.makeCommand(id, options)
      // TODO: implement proper tracing stack
      return Object.assign((cb: any) =>
        idCmd(cb(
          Object.assign(
            (fn: any, ...combinators: any[]) =>
              Effect.fnUntraced(
                // fnUntraced only supports generators as first arg, so we convert to generator if needed
                isGeneratorFunction(fn) ? fn : function*(...args) {
                  return yield* fn(...args)
                },
                ...combinators as [any]
              ),
            baseInfo,
            isObject
              ? { mutate: "mutate" in _id ? _id.mutate : typeof _id === "function" ? _id : undefined }
              : {}
          )
        )), baseInfo) as any
    }

  alt = this.makeCommand as unknown as <
    const Id extends string,
    const I18nKey extends string = Id,
    State extends IntlRecord | undefined = undefined
  >(
    id: Id,
    customI18nKey?: I18nKey
  ) =>
    & Commander.CommandContextLocal<Id, I18nKey>
    & (<A, E, R extends RT | CommandContext | `Commander.Command.${Id}.state`, Arg = void>(
      handler: (arg: Arg, ctx: Commander.CommandContextLocal2<Id, I18nKey, State>) => Effect.Effect<A, E, R>
    ) => Commander.CommandOut<Arg, A, E, R, Id, I18nKey, State>)

  /**
   * Define a Command for handling user actions with built-in error reporting and state management.
   *
   * @param mutation The mutation function to take the identifier and initial handler from. Used as a tracing span and to lookup
   *                   the user-facing name via internationalization (`action.${id}`).
   * @param options Optional configuration for internationalization and state.
   * @param options.i18nCustomKey Custom i18n key to use instead of `id` (e.g., for grouping similar actions)
   * @param options.state Optional reactive state object (or function returning one) that is
   *                     made available to the command effects and can be used for i18n interpolation.
   *                     The state is captured at the start of each command execution and remains stable throughout.
   * @returns A function that executes the command when called (e.g., directly in `@click` handlers).
   *          Built-in error reporting handles failures automatically.
   *
   * **Effect Context**: Effects have access to the `CommandContext` service, which provides
   * the user-facing action name.
   *
   * **Returned Properties**:
   * - `action`: User-facing action name from intl messages (useful for button labels)
   * - `result`: The command result state
   * - `waiting`: Boolean indicating if the command is in progress (shorthand for `result.waiting`)
   * - `handle`: Function to execute the command
   * - `exec`: The raw Effect that will be executed when calling `handle` (for advanced use cases)
   * - `i18nKey`, `namespace`, `namespaced`: Helpers for internationalization keys
   *
   * **User Feedback**: Use the `withDefaultToast` helper for status notifications, or render
   * the `result` inline for custom UI feedback.
   */
  wrap = <
    const Id extends string,
    Arg,
    A,
    E,
    R,
    const State extends IntlRecord = IntlRecord,
    I18nKey extends string = Id
  >(
    mutation:
      | { mutate: (arg: Arg) => Effect.Effect<A, E, R>; id: Id }
      | ((arg: Arg) => Effect.Effect<A, E, R>) & { id: Id }
      | StreamMutationFactory<Id, Arg, A, E, R>
      | {
        id: Id
        mutateStream:
          | StreamMutationFactory<Id, Arg, A, E, R>
          | StreamMutationCallable<Id, Arg, A, E, R>
      }
      | StreamMutationCallable<Id, Arg, A, E, R>,
    options?: FnOptions<Id, I18nKey, State>
  ): Commander.CommanderWrap<RT | RTHooks, Id, I18nKey, State, Arg, A, E, R> => {
    if (mutation !== null && typeof mutation === "object" && "mutateStream" in mutation) {
      return this.wrapStream(mutation as any, options) as any
    }
    if (isStreamCallable(mutation) || isStreamFactory(mutation)) {
      return this.wrapStream(mutation as any, options) as any
    }
    // At this point mutation is either { mutate, id } or (fn & { id })
    const callMutation = mutation as
      | { mutate: (arg: Arg) => Effect.Effect<A, E, R>; id: Id }
      | (((arg: Arg) => Effect.Effect<A, E, R>) & { id: Id })
    return Object.assign(
      (
        ...combinators: any[]
      ): any => {
        // we capture the definition stack here, so we can append it to later stack traces
        const limit = Error.stackTraceLimit
        Error.stackTraceLimit = 2
        const errorDef = new Error()
        Error.stackTraceLimit = limit
        const mutate = "mutate" in callMutation
          ? callMutation.mutate
          : callMutation

        return this.makeCommand(callMutation.id, options, errorDef)(
          Effect.fnUntraced(
            // fnUntraced only supports generators as first arg, so we convert to generator if needed
            isGeneratorFunction(mutate) ? mutate : function*(arg: Arg) {
              return yield* mutate(arg)
            },
            ...combinators as [any]
          ) as any
        )
      },
      makeBaseInfo(callMutation.id, options),
      {
        state: Context.Service<`Commander.Command.${Id}.state`, State>(
          `Commander.Command.${callMutation.id}.state`
        )
      }
    )
  }

  /**
   * Define a Command from a stream-type mutation (`mutateStream` factory).
   * The stream's reactive `AsyncResult` ref is exposed as `running` for independent progress tracking.
   * The command's own `result` reflects the execution outcome of the `execute` function.
   * Supports the same combinator pipeline as `wrap` (e.g. `withDefaultToast`).
   *
   * Each invocation of the resulting wrap call produces a fresh `[ref, execute]` pair
   * (the `mutateStream` factory is called once per build), so independent commands
   * don't share progress state.
   *
   * Accepts either:
   * - An object with `id` and `mutateStream` factory (e.g. a client entry)
   * - The `mutateStream` factory directly (callable, with `id`)
   * - An already-called factory result (`[resultRef, execute] & { id }`) — shared ref across builds
   *
   * @example
   * ```ts
   * // Via client entry (recommended):
   * const exportCmd = Command.wrapStream(client.myExport)()
   *
   * // Via factory directly:
   * const exportCmd = Command.wrapStream(client.myExport.mutateStream)()
   *
   * // Via already-called factory (shared ref):
   * const stream = client.myExport.mutateStream()
   * const exportCmd = Command.wrapStream(stream)()
   * ```
   */
  wrapStream = <
    const Id extends string,
    Arg,
    A,
    E,
    R,
    const State extends IntlRecord = IntlRecord,
    const I18nKey extends string = Id
  >(
    mutation:
      | {
        id: Id
        mutateStream:
          | StreamMutationFactory<Id, Arg, A, E, R>
          | StreamMutationCallable<Id, Arg, A, E, R>
      }
      | StreamMutationFactory<Id, Arg, A, E, R>
      | StreamMutationCallable<Id, Arg, A, E, R>,
    options?: FnOptions<Id, I18nKey, State>
  ): Commander.CommanderWrap<RT | RTHooks, Id, I18nKey, State, Arg, A, E, R> => {
    const id = mutation.id
    // Resolve `source` to the factory or already-invoked callable.
    const source: StreamMutationFactory<Id, Arg, A, E, R> | StreamMutationCallable<Id, Arg, A, E, R> =
      mutation !== null && typeof mutation === "object" && "mutateStream" in mutation
        ? (mutation.mutateStream as any)
        : (mutation as any)
    const resolveCallable = (): StreamMutationCallable<Id, Arg, A, E, R> =>
      (isStreamFactory(source)
        ? (source as StreamMutationFactory<Id, Arg, A, E, R>)()
        : source) as StreamMutationCallable<Id, Arg, A, E, R>
    return Object.assign(
      (...combinators: any[]): any => {
        // we capture the definition stack here, so we can append it to later stack traces
        const limit = Error.stackTraceLimit
        Error.stackTraceLimit = 2
        const errorDef = new Error()
        Error.stackTraceLimit = limit

        // Fresh per build: invoke the factory once per command instance so each
        // wrap call gets its own state + execute pair. `running`/`progress`
        // are only surfaced when the factory was called with a `progress` formatter.
        const callable = resolveCallable()
        const mutate: (_arg: Arg) => Effect.Effect<any, E, R> = Effect.isEffect(callable)
          ? (_arg: Arg) => callable
          : callable as (arg: Arg) => Effect.Effect<any, E, R>
        const streamMeta = { running: callable.running, progress: callable.progress }

        return this.makeCommand(id, options, errorDef, streamMeta)(
          Effect.fnUntraced(
            isGeneratorFunction(mutate) ? mutate : function*(arg: Arg) {
              return yield* mutate(arg)
            },
            ...combinators as [any]
          ) as any
        )
      },
      makeBaseInfo(id, options),
      {
        state: Context.Service<`Commander.Command.${Id}.state`, State>(
          `Commander.Command.${id}.state`
        )
      }
    )
  }
}

// @effect-diagnostics-next-line missingEffectServiceDependency:off
export class Commander extends Context.Service<Commander>()("Commander", {
  make: Effect.gen(function*() {
    const i18n = yield* I18n
    return <RT, RTHooks>(rt: Context.Context<RT>, rtHooks: Layer.Layer<RTHooks, never, RT>) =>
      new CommanderImpl(rt, i18n, rtHooks)
  })
}) {
  static readonly DefaultWithoutDependencies = Layer.effect(this, this.make)
  static readonly Default = this.DefaultWithoutDependencies
}

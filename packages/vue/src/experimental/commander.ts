/* eslint-disable @typescript-eslint/no-explicit-any */
import { asResult, type MissingDependencies, reportRuntimeError } from "@effect-app/vue"
import { reportMessage } from "@effect-app/vue/errorReporter"
import { type Result } from "@effect-atom/atom/Result"
import { Cause, Context, Effect, type Exit, flow, Match, Option, Runtime, S } from "effect-app"
import { SupportedErrors } from "effect-app/client"
import { OperationFailure, OperationSuccess } from "effect-app/Operations"
import { wrapEffect } from "effect-app/utils"
import { type RuntimeFiber } from "effect/Fiber"
import { type NoInfer } from "effect/Types"
import { isGeneratorFunction, type YieldWrap } from "effect/Utils"
import { type FormatXMLElementFn, type PrimitiveType } from "intl-messageformat"
import { computed, type ComputedRef, reactive } from "vue"
import { Confirm } from "./confirm.js"
import { I18n } from "./intl.js"
import { WithToast } from "./withToast.js"

type IntlRecord = Record<string, PrimitiveType | FormatXMLElementFn<string, string>>
type FnOptions<I18nCustomKey extends string, State extends IntlRecord | undefined> = {
  i18nCustomKey?: I18nCustomKey
  /**
   * passed to the i18n formatMessage calls so you can use it in translation messagee
   * including the Command `action` string.
   * Automatically wrapped with Computed if just a thunk.
   * provided as Command.state tag, so you can access it in the function.
   */
  state?: ComputedRef<State> | (() => State)
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

export class CommandContext extends Effect.Tag("CommandContext")<
  CommandContext,
  {
    id: string
    i18nKey: string
    action: string
    namespace: string
    namespaced: (key: string) => string
    state?: IntlRecord | undefined
  }
>() {}

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
  export type CommanderBase<RT, Id extends string, I18nKey extends string, State> =
    & Commander.Gen<RT, Id, I18nKey>
    & Commander.NonGen<RT, Id, I18nKey>
    & Commander.CommandContextLocal<Id, I18nKey>
    & {
      state: Context.Tag<`Commander.Command.${Id}.state`, State>
    }

  export type CommanderFn<RT, Id extends string, I18nKey extends string, State> = CommanderBase<RT, Id, I18nKey, State>

  export type CommanderWrap<RT, Id extends string, I18nCustomKey extends string, State, I extends any[], A, E, R> =
    & CommandContextLocal<Id, I18nCustomKey>
    & GenWrap<RT, Id, I18nCustomKey, I, A, E, R>
    & NonGenWrap<RT, Id, I18nCustomKey, I, A, E, R>
    & {
      state: Context.Tag<`Commander.Command.${Id}.state`, State>
    }

  export interface CommandContextLocal<Id extends string, I18nKey extends string> {
    id: Id
    i18nKey: I18nKey
    namespace: `action.${I18nKey}`
    namespaced: <K extends string>(k: K) => `action.${I18nKey}.${K}`
  }

  export interface CommandProps<A, E, Id extends string, I18nKey extends string>
    extends CommandContextLocal<Id, I18nKey>
  {
    action: string
    result: Result<A, E>
    waiting: boolean
  }

  export interface CommandOut<Args extends Array<unknown>, A, E, R, Id extends string, I18nKey extends string>
    extends CommandProps<A, E, Id, I18nKey>
  {
    new(): {}

    /** click handlers */
    handle: ((...args: Args) => RuntimeFiber<Exit.Exit<A, E>, never>) & {
      effect: (...args: Args) => Effect.Effect<A, E, R>
      promise: (...args: Args) => Promise<A>
    }

    // // TODO: if we keep them, it would probably be nicer as an option api, deciding the return value like in Atom?
    // /** @experimental */
    // compose: (...args: Args) => Effect.Effect<Exit.Exit<A, E>, R>
    // /** @experimental */
    // compose2: (...args: Args) => Effect.Effect<A, E, R>
    // /**
    //  * @experimental
    //  * captures the current span and returns an Effect that when run will execute the command
    //  */
    // handleEffect: (...args: Args) => Effect.Effect<RuntimeFiber<Exit.Exit<A, E>, never>>
    // /**
    //  * @experimental
    //  */
    // exec: (...args: Args) => Effect.Effect<Exit.Exit<A, E>, never, Exclude<R, CommandContext>>
  }

  type CommandOutHelper<
    Args extends Array<unknown>,
    Eff extends Effect.Effect<any, any, any>,
    Id extends string,
    I18nKey extends string
  > = CommandOut<
    Args,
    Effect.Effect.Success<Eff>,
    Effect.Effect.Error<Eff>,
    Effect.Effect.Context<Eff>,
    Id,
    I18nKey
  >

  export type Gen<RT, Id extends string, I18nKey extends string> = {
    <
      Eff extends YieldWrap<Effect.Effect<any, any, RT | CommandContext | `Commander.Command.${Id}.state`>>,
      AEff,
      Args extends Array<unknown>
    >(
      body: (...args: Args) => Generator<Eff, AEff, never>
    ): CommandOut<
      Args,
      AEff,
      [Eff] extends [never] ? never
        : [Eff] extends [YieldWrap<Effect.Effect<infer _A, infer E, infer _R>>] ? E
        : never,
      [Eff] extends [never] ? never
        : [Eff] extends [YieldWrap<Effect.Effect<infer _A, infer _E, infer R>>] ? R
        : never,
      Id,
      I18nKey
    >
    <
      Eff extends YieldWrap<Effect.Effect<any, any, any>>,
      AEff,
      Args extends Array<unknown>,
      A extends Effect.Effect<any, any, RT | CommandContext | `Commander.Command.${Id}.state`>
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
        >,
        ...args: NoInfer<Args>
      ) => A
    ): CommandOutHelper<Args, A, Id, I18nKey>
    <
      Eff extends YieldWrap<Effect.Effect<any, any, any>>,
      AEff,
      Args extends Array<unknown>,
      A,
      B extends Effect.Effect<any, any, RT | CommandContext | `Commander.Command.${Id}.state`>
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
        >,
        ...args: NoInfer<Args>
      ) => A,
      b: (_: A, ...args: NoInfer<Args>) => B
    ): CommandOutHelper<Args, B, Id, I18nKey>
    <
      Eff extends YieldWrap<Effect.Effect<any, any, any>>,
      AEff,
      Args extends Array<unknown>,
      A,
      B,
      C extends Effect.Effect<any, any, RT | CommandContext | `Commander.Command.${Id}.state`>
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
        >,
        ...args: NoInfer<Args>
      ) => A,
      b: (_: A, ...args: NoInfer<Args>) => B,
      c: (_: B, ...args: NoInfer<Args>) => C
    ): CommandOutHelper<Args, C, Id, I18nKey>
    <
      Eff extends YieldWrap<Effect.Effect<any, any, any>>,
      AEff,
      Args extends Array<unknown>,
      A,
      B,
      C,
      D extends Effect.Effect<any, any, RT | CommandContext | `Commander.Command.${Id}.state`>
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
        >,
        ...args: NoInfer<Args>
      ) => A,
      b: (_: A, ...args: NoInfer<Args>) => B,
      c: (_: B, ...args: NoInfer<Args>) => C,
      d: (_: C, ...args: NoInfer<Args>) => D
    ): CommandOutHelper<Args, D, Id, I18nKey>
    <
      Eff extends YieldWrap<Effect.Effect<any, any, any>>,
      AEff,
      Args extends Array<unknown>,
      A,
      B,
      C,
      D,
      E extends Effect.Effect<any, any, RT | CommandContext | `Commander.Command.${Id}.state`>
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
        >,
        ...args: NoInfer<Args>
      ) => A,
      b: (_: A, ...args: NoInfer<Args>) => B,
      c: (_: B, ...args: NoInfer<Args>) => C,
      d: (_: C, ...args: NoInfer<Args>) => D,
      e: (_: D, ...args: NoInfer<Args>) => E
    ): CommandOutHelper<Args, E, Id, I18nKey>
    <
      Eff extends YieldWrap<Effect.Effect<any, any, any>>,
      AEff,
      Args extends Array<unknown>,
      A,
      B,
      C,
      D,
      E,
      F extends Effect.Effect<any, any, RT | CommandContext | `Commander.Command.${Id}.state`>
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
        >,
        ...args: NoInfer<Args>
      ) => A,
      b: (_: A, ...args: NoInfer<Args>) => B,
      c: (_: B, ...args: NoInfer<Args>) => C,
      d: (_: C, ...args: NoInfer<Args>) => D,
      e: (_: D, ...args: NoInfer<Args>) => E,
      f: (_: E, ...args: NoInfer<Args>) => F
    ): CommandOutHelper<Args, F, Id, I18nKey>
    <
      Eff extends YieldWrap<Effect.Effect<any, any, any>>,
      AEff,
      Args extends Array<unknown>,
      A,
      B,
      C,
      D,
      E,
      F,
      G extends Effect.Effect<any, any, RT | CommandContext | `Commander.Command.${Id}.state`>
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
        >,
        ...args: NoInfer<Args>
      ) => A,
      b: (_: A, ...args: NoInfer<Args>) => B,
      c: (_: B, ...args: NoInfer<Args>) => C,
      d: (_: C, ...args: NoInfer<Args>) => D,
      e: (_: D, ...args: NoInfer<Args>) => E,
      f: (_: E, ...args: NoInfer<Args>) => F,
      g: (_: F, ...args: NoInfer<Args>) => G
    ): CommandOutHelper<Args, G, Id, I18nKey>
    <
      Eff extends YieldWrap<Effect.Effect<any, any, any>>,
      AEff,
      Args extends Array<unknown>,
      A,
      B,
      C,
      D,
      E,
      F,
      G,
      H extends Effect.Effect<any, any, RT | CommandContext | `Commander.Command.${Id}.state`>
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
        >,
        ...args: NoInfer<Args>
      ) => A,
      b: (_: A, ...args: NoInfer<Args>) => B,
      c: (_: B, ...args: NoInfer<Args>) => C,
      d: (_: C, ...args: NoInfer<Args>) => D,
      e: (_: D, ...args: NoInfer<Args>) => E,
      f: (_: E, ...args: NoInfer<Args>) => F,
      g: (_: F, ...args: NoInfer<Args>) => G,
      h: (_: G, ...args: NoInfer<Args>) => H
    ): CommandOutHelper<Args, H, Id, I18nKey>
    <
      Eff extends YieldWrap<Effect.Effect<any, any, any>>,
      AEff,
      Args extends Array<unknown>,
      A,
      B,
      C,
      D,
      E,
      F,
      G,
      H,
      I extends Effect.Effect<any, any, RT | CommandContext | `Commander.Command.${Id}.state`>
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
        >,
        ...args: NoInfer<Args>
      ) => A,
      b: (_: A, ...args: NoInfer<Args>) => B,
      c: (_: B, ...args: NoInfer<Args>) => C,
      d: (_: C, ...args: NoInfer<Args>) => D,
      e: (_: D, ...args: NoInfer<Args>) => E,
      f: (_: E, ...args: NoInfer<Args>) => F,
      g: (_: F, ...args: NoInfer<Args>) => G,
      h: (_: G, ...args: NoInfer<Args>) => H,
      i: (_: H, ...args: NoInfer<Args>) => I
    ): CommandOutHelper<Args, I, Id, I18nKey>
  }

  export type NonGen<RT, Id extends string, I18nKey extends string> = {
    <
      Eff extends Effect.Effect<any, any, RT | CommandContext | `Commander.Command.${Id}.state`>,
      Args extends Array<unknown>
    >(
      body: (...args: Args) => Eff
    ): CommandOutHelper<Args, Eff, Id, I18nKey>
    <
      Eff extends Effect.Effect<any, any, RT | CommandContext | `Commander.Command.${Id}.state`>,
      A,
      Args extends Array<unknown>
    >(
      body: (...args: Args) => A,
      a: (_: A, ...args: NoInfer<Args>) => Eff
    ): CommandOutHelper<Args, Eff, Id, I18nKey>
    <
      Eff extends Effect.Effect<any, any, RT | CommandContext | `Commander.Command.${Id}.state`>,
      A,
      B,
      Args extends Array<unknown>
    >(
      body: (...args: Args) => A,
      a: (_: A, ...args: NoInfer<Args>) => B,
      b: (_: B, ...args: NoInfer<Args>) => Eff
    ): CommandOutHelper<Args, Eff, Id, I18nKey>
    <
      Eff extends Effect.Effect<any, any, RT | CommandContext | `Commander.Command.${Id}.state`>,
      A,
      B,
      C,
      Args extends Array<unknown>
    >(
      body: (...args: Args) => A,
      a: (_: A, ...args: NoInfer<Args>) => B,
      b: (_: B, ...args: NoInfer<Args>) => C,
      c: (_: C, ...args: NoInfer<Args>) => Eff
    ): CommandOutHelper<Args, Eff, Id, I18nKey>
    <
      Eff extends Effect.Effect<any, any, RT | CommandContext | `Commander.Command.${Id}.state`>,
      A,
      B,
      C,
      D,
      Args extends Array<unknown>
    >(
      body: (...args: Args) => A,
      a: (_: A, ...args: NoInfer<Args>) => B,
      b: (_: B, ...args: NoInfer<Args>) => C,
      c: (_: C, ...args: NoInfer<Args>) => D,
      d: (_: D, ...args: NoInfer<Args>) => Eff
    ): CommandOutHelper<Args, Eff, Id, I18nKey>
    <
      Eff extends Effect.Effect<any, any, RT | CommandContext | `Commander.Command.${Id}.state`>,
      A,
      B,
      C,
      D,
      E,
      Args extends Array<unknown>
    >(
      body: (...args: Args) => A,
      a: (_: A, ...args: NoInfer<Args>) => B,
      b: (_: B, ...args: NoInfer<Args>) => C,
      c: (_: C, ...args: NoInfer<Args>) => D,
      d: (_: D, ...args: NoInfer<Args>) => E,
      e: (_: E, ...args: NoInfer<Args>) => Eff
    ): CommandOutHelper<Args, Eff, Id, I18nKey>
    <
      Eff extends Effect.Effect<any, any, RT | CommandContext | `Commander.Command.${Id}.state`>,
      A,
      B,
      C,
      D,
      E,
      F,
      Args extends Array<unknown>
    >(
      body: (...args: Args) => A,
      a: (_: A, ...args: NoInfer<Args>) => B,
      b: (_: B, ...args: NoInfer<Args>) => C,
      c: (_: C, ...args: NoInfer<Args>) => D,
      d: (_: D, ...args: NoInfer<Args>) => E,
      e: (_: E, ...args: NoInfer<Args>) => F,
      f: (_: F, ...args: NoInfer<Args>) => Eff
    ): CommandOutHelper<Args, Eff, Id, I18nKey>
    <
      Eff extends Effect.Effect<any, any, RT | CommandContext | `Commander.Command.${Id}.state`>,
      A,
      B,
      C,
      D,
      E,
      F,
      G,
      Args extends Array<unknown>
    >(
      body: (...args: Args) => A,
      a: (_: A, ...args: NoInfer<Args>) => B,
      b: (_: B, ...args: NoInfer<Args>) => C,
      c: (_: C, ...args: NoInfer<Args>) => D,
      d: (_: D, ...args: NoInfer<Args>) => E,
      e: (_: E, ...args: NoInfer<Args>) => F,
      f: (_: F, ...args: NoInfer<Args>) => G,
      g: (_: G, ...args: NoInfer<Args>) => Eff
    ): CommandOutHelper<Args, Eff, Id, I18nKey>
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
      Args extends Array<unknown>
    >(
      body: (...args: Args) => A,
      a: (_: A, ...args: NoInfer<Args>) => B,
      b: (_: B, ...args: NoInfer<Args>) => C,
      c: (_: C, ...args: NoInfer<Args>) => D,
      d: (_: D, ...args: NoInfer<Args>) => E,
      e: (_: E, ...args: NoInfer<Args>) => F,
      f: (_: F, ...args: NoInfer<Args>) => G,
      g: (_: G, ...args: NoInfer<Args>) => H,
      h: (_: H, ...args: NoInfer<Args>) => Eff
    ): CommandOutHelper<Args, Eff, Id, I18nKey>
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
      Args extends Array<unknown>
    >(
      body: (...args: Args) => A,
      a: (_: A, ...args: NoInfer<Args>) => B,
      b: (_: B, ...args: NoInfer<Args>) => C,
      c: (_: C, ...args: NoInfer<Args>) => D,
      d: (_: D, ...args: NoInfer<Args>) => E,
      e: (_: E, ...args: NoInfer<Args>) => F,
      f: (_: F, ...args: NoInfer<Args>) => G,
      g: (_: G, ...args: NoInfer<Args>) => H,
      h: (_: H, ...args: NoInfer<Args>) => I,
      i: (_: H, ...args: NoInfer<Args>) => Eff
    ): CommandOutHelper<Args, Eff, Id, I18nKey>
  }

  export type GenWrap<RT, Id extends string, I18nKey extends string, Args extends Array<unknown>, AEff, EEff, REff> = {
    (): Exclude<REff, RT> extends never ? CommandOut<
        Args,
        AEff,
        EEff,
        REff,
        Id,
        I18nKey
      >
      : MissingDependencies<RT, REff>
    <
      A extends Effect.Effect<any, any, RT | CommandContext | `Commander.Command.${Id}.state`>
    >(
      a: (
        _: Effect.Effect<
          AEff,
          EEff,
          REff
        >,
        ...args: NoInfer<Args>
      ) => A
    ): CommandOutHelper<Args, A, Id, I18nKey>
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
        ...args: NoInfer<Args>
      ) => A,
      b: (_: A, ...args: NoInfer<Args>) => B
    ): CommandOutHelper<Args, B, Id, I18nKey>
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
        ...args: NoInfer<Args>
      ) => A,
      b: (_: A, ...args: NoInfer<Args>) => B,
      c: (_: B, ...args: NoInfer<Args>) => C
    ): CommandOutHelper<Args, C, Id, I18nKey>
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
        ...args: NoInfer<Args>
      ) => A,
      b: (_: A, ...args: NoInfer<Args>) => B,
      c: (_: B, ...args: NoInfer<Args>) => C,
      d: (_: C, ...args: NoInfer<Args>) => D
    ): CommandOutHelper<Args, D, Id, I18nKey>
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
        ...args: NoInfer<Args>
      ) => A,
      b: (_: A, ...args: NoInfer<Args>) => B,
      c: (_: B, ...args: NoInfer<Args>) => C,
      d: (_: C, ...args: NoInfer<Args>) => D,
      e: (_: D, ...args: NoInfer<Args>) => E
    ): CommandOutHelper<Args, E, Id, I18nKey>
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
        ...args: NoInfer<Args>
      ) => A,
      b: (_: A, ...args: NoInfer<Args>) => B,
      c: (_: B, ...args: NoInfer<Args>) => C,
      d: (_: C, ...args: NoInfer<Args>) => D,
      e: (_: D, ...args: NoInfer<Args>) => E,
      f: (_: E, ...args: NoInfer<Args>) => F
    ): CommandOutHelper<Args, F, Id, I18nKey>
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
        ...args: NoInfer<Args>
      ) => A,
      b: (_: A, ...args: NoInfer<Args>) => B,
      c: (_: B, ...args: NoInfer<Args>) => C,
      d: (_: C, ...args: NoInfer<Args>) => D,
      e: (_: D, ...args: NoInfer<Args>) => E,
      f: (_: E, ...args: NoInfer<Args>) => F,
      g: (_: F, ...args: NoInfer<Args>) => G
    ): CommandOutHelper<Args, G, Id, I18nKey>
    <A, B, C, D, E, F, G, H extends Effect.Effect<any, any, RT | CommandContext | `Commander.Command.${Id}.state`>>(
      a: (
        _: Effect.Effect<
          AEff,
          EEff,
          REff
        >,
        ...args: NoInfer<Args>
      ) => A,
      b: (_: A, ...args: NoInfer<Args>) => B,
      c: (_: B, ...args: NoInfer<Args>) => C,
      d: (_: C, ...args: NoInfer<Args>) => D,
      e: (_: D, ...args: NoInfer<Args>) => E,
      f: (_: E, ...args: NoInfer<Args>) => F,
      g: (_: F, ...args: NoInfer<Args>) => G,
      h: (_: G, ...args: NoInfer<Args>) => H
    ): CommandOutHelper<Args, H, Id, I18nKey>
    <A, B, C, D, E, F, G, H, I extends Effect.Effect<any, any, RT | CommandContext | `Commander.Command.${Id}.state`>>(
      a: (
        _: Effect.Effect<
          AEff,
          EEff,
          REff
        >,
        ...args: NoInfer<Args>
      ) => A,
      b: (_: A, ...args: NoInfer<Args>) => B,
      c: (_: B, ...args: NoInfer<Args>) => C,
      d: (_: C, ...args: NoInfer<Args>) => D,
      e: (_: D, ...args: NoInfer<Args>) => E,
      f: (_: E, ...args: NoInfer<Args>) => F,
      g: (_: F, ...args: NoInfer<Args>) => G,
      h: (_: G, ...args: NoInfer<Args>) => H,
      i: (_: H, ...args: NoInfer<Args>) => I
    ): CommandOutHelper<Args, I, Id, I18nKey>
  }

  export type NonGenWrap<RT, Id extends string, I18nKey extends string, Args extends Array<unknown>, AEff, EEff, REff> =
    {
      (): Exclude<REff, RT> extends never ? CommandOutHelper<Args, Effect.Effect<AEff, EEff, REff>, Id, I18nKey>
        : MissingDependencies<RT, REff>
      <
        Eff extends Effect.Effect<any, any, RT | CommandContext | `Commander.Command.${Id}.state`>,
        Args extends Array<unknown>
      >(
        a: (
          _: Effect.Effect<
            AEff,
            EEff,
            REff
          >,
          ...args: NoInfer<Args>
        ) => Eff
      ): CommandOutHelper<Args, Eff, Id, I18nKey>
      <
        Eff extends Effect.Effect<any, any, RT | CommandContext | `Commander.Command.${Id}.state`>,
        B,
        Args extends Array<unknown>
      >(
        a: (
          _: Effect.Effect<
            AEff,
            EEff,
            REff
          >,
          ...args: NoInfer<Args>
        ) => B,
        b: (_: B, ...args: NoInfer<Args>) => Eff
      ): CommandOutHelper<Args, Eff, Id, I18nKey>
      <
        Eff extends Effect.Effect<any, any, RT | CommandContext | `Commander.Command.${Id}.state`>,
        B,
        C,
        Args extends Array<unknown>
      >(
        a: (
          _: Effect.Effect<
            AEff,
            EEff,
            REff
          >,
          ...args: NoInfer<Args>
        ) => B,
        b: (_: B, ...args: NoInfer<Args>) => C,
        c: (_: C, ...args: NoInfer<Args>) => Eff
      ): CommandOutHelper<Args, Eff, Id, I18nKey>
      <
        Eff extends Effect.Effect<any, any, RT | CommandContext | `Commander.Command.${Id}.state`>,
        B,
        C,
        D,
        Args extends Array<unknown>
      >(
        a: (
          _: Effect.Effect<
            AEff,
            EEff,
            REff
          >,
          ...args: NoInfer<Args>
        ) => B,
        b: (_: B, ...args: NoInfer<Args>) => C,
        c: (_: C, ...args: NoInfer<Args>) => D,
        d: (_: D, ...args: NoInfer<Args>) => Eff
      ): CommandOutHelper<Args, Eff, Id, I18nKey>
      <
        Eff extends Effect.Effect<any, any, RT | CommandContext | `Commander.Command.${Id}.state`>,
        B,
        C,
        D,
        E,
        Args extends Array<unknown>
      >(
        a: (
          _: Effect.Effect<
            AEff,
            EEff,
            REff
          >,
          ...args: NoInfer<Args>
        ) => B,
        b: (_: B, ...args: NoInfer<Args>) => C,
        c: (_: C, ...args: NoInfer<Args>) => D,
        d: (_: D, ...args: NoInfer<Args>) => E,
        e: (_: E, ...args: NoInfer<Args>) => Eff
      ): CommandOutHelper<Args, Eff, Id, I18nKey>
      <
        Eff extends Effect.Effect<any, any, RT | CommandContext | `Commander.Command.${Id}.state`>,
        B,
        C,
        D,
        E,
        F,
        Args extends Array<unknown>
      >(
        a: (
          _: Effect.Effect<
            AEff,
            EEff,
            REff
          >,
          ...args: NoInfer<Args>
        ) => B,
        b: (_: B, ...args: NoInfer<Args>) => C,
        c: (_: C, ...args: NoInfer<Args>) => D,
        d: (_: D, ...args: NoInfer<Args>) => E,
        e: (_: E, ...args: NoInfer<Args>) => F,
        f: (_: F, ...args: NoInfer<Args>) => Eff
      ): CommandOutHelper<Args, Eff, Id, I18nKey>
      <
        Eff extends Effect.Effect<any, any, RT | CommandContext | `Commander.Command.${Id}.state`>,
        B,
        C,
        D,
        E,
        F,
        G,
        Args extends Array<unknown>
      >(
        a: (
          _: Effect.Effect<
            AEff,
            EEff,
            REff
          >,
          ...args: NoInfer<Args>
        ) => B,
        b: (_: B, ...args: NoInfer<Args>) => C,
        c: (_: C, ...args: NoInfer<Args>) => D,
        d: (_: D, ...args: NoInfer<Args>) => E,
        e: (_: E, ...args: NoInfer<Args>) => F,
        f: (_: F, ...args: NoInfer<Args>) => G,
        g: (_: G, ...args: NoInfer<Args>) => Eff
      ): CommandOutHelper<Args, Eff, Id, I18nKey>
      <
        Eff extends Effect.Effect<any, any, RT | CommandContext | `Commander.Command.${Id}.state`>,
        B,
        C,
        D,
        E,
        F,
        G,
        H,
        Args extends Array<unknown>
      >(
        a: (
          _: Effect.Effect<
            AEff,
            EEff,
            REff
          >,
          ...args: NoInfer<Args>
        ) => B,
        b: (_: B, ...args: NoInfer<Args>) => C,
        c: (_: C, ...args: NoInfer<Args>) => D,
        d: (_: D, ...args: NoInfer<Args>) => E,
        e: (_: E, ...args: NoInfer<Args>) => F,
        f: (_: F, ...args: NoInfer<Args>) => G,
        g: (_: G, ...args: NoInfer<Args>) => H,
        h: (_: H, ...args: NoInfer<Args>) => Eff
      ): CommandOutHelper<Args, Eff, Id, I18nKey>
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
        Args extends Array<unknown>
      >(
        a: (
          _: Effect.Effect<
            AEff,
            EEff,
            REff
          >,
          ...args: NoInfer<Args>
        ) => B,
        b: (_: B, ...args: NoInfer<Args>) => C,
        c: (_: C, ...args: NoInfer<Args>) => D,
        d: (_: D, ...args: NoInfer<Args>) => E,
        e: (_: E, ...args: NoInfer<Args>) => F,
        f: (_: F, ...args: NoInfer<Args>) => G,
        g: (_: G, ...args: NoInfer<Args>) => H,
        h: (_: H, ...args: NoInfer<Args>) => I,
        i: (_: H, ...args: NoInfer<Args>) => Eff
      ): CommandOutHelper<Args, Eff, Id, I18nKey>
    }
}

type ErrorRenderer<E, Args extends readonly any[]> = (e: E, action: string, ...args: Args) => string | undefined

const renderErrorMaker = I18n.use(
  ({ intl }) =>
  <E, Args extends readonly any[]>(action: string, errorRenderer?: ErrorRenderer<E, Args>) =>
  (e: E, ...args: Args): string => {
    if (errorRenderer) {
      const m = errorRenderer(e, action, ...args)
      if (m !== undefined) {
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
        NotFoundError: (e) => {
          return intl.formatMessage({ id: "handle.not_found" }, { type: e.type, id: e.id })
        },
        ParseError: (e) => {
          console.warn(e.toString())
          return intl.formatMessage({ id: "validation.failed" })
        }
      }),
      Match.orElse((e) => `${e.message ?? e._tag ?? e}`)
    )
  }
)

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
      onSome: (e) =>
        S.is(OperationFailure)(e)
          ? {
            level: "warn" as const,
            message: intl.formatMessage(
                { id: "handle.with_warnings" },
                { action }
              ) + e.message
              ? "\n" + e.message
              : ""
          }
          : `${
            intl.formatMessage(
              { id: "handle.with_errors" },
              { action }
            )
          }:\n` + renderError(action, errorRenderer)(e, ...args)
    })
  })

export const CommanderStatic = {
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
      errorRenderer?: ErrorRenderer<E, Args>
      onWaiting?: null | undefined | string | ((action: string, ...args: Args) => string | null | undefined)
      onSuccess?: null | undefined | string | ((a: A, action: string, ...args: Args) => string | null | undefined)
    }
  ) =>
  (
    self: Effect.Effect<A, E, R>,
    ...args: Args
  ) =>
    Effect.gen(function*() {
      const cc = yield* CommandContext
      const { intl } = yield* I18n
      const withToast = yield* WithToast
      const customWaiting = cc.namespaced("waiting")
      const hasCustomWaiting = !!intl.messages[customWaiting]
      const customSuccess = cc.namespaced("success")
      const hasCustomSuccess = !!intl.messages[customSuccess]
      const customFailure = cc.namespaced("failure")
      const hasCustomFailure = !!intl.messages[customFailure]
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
              options?.errorRenderer
            )
          })(_, ...args)
      )
    })
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

const getStateValues = <const I18nKey extends string, State extends IntlRecord | undefined>(
  options?: FnOptions<I18nKey, State>
): ComputedRef<State> => {
  const state_ = options?.state
  const state = !state_ ? computed(() => undefined as State) : typeof state_ === "function"
    ? computed(state_)
    : state_
  return state
}

// class preserves JSDoc throughout..
export class CommanderImpl<RT> {
  private runFork: <A, E>(
    effect: Effect.Effect<A, E, RT>,
    options?: Runtime.RunForkOptions
  ) => RuntimeFiber<A, E>

  constructor(private readonly rt: Runtime.Runtime<RT>, private readonly intl: I18n) {
    this.runFork = Runtime.runFork(this.rt)
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
    }, options?.state)
    const context = CommandContext.of({
      ...makeBaseInfo(id, options),
      action,
      state: options?.state
    })

    return context
  }

  readonly makeCommand = <
    const Id extends string,
    const State extends IntlRecord | undefined,
    const I18nKey extends string = Id
  >(
    id_: Id | { id: Id },
    options?: FnOptions<I18nKey, State>,
    errorDef?: Error
  ) => {
    const id = typeof id_ === "string" ? id_ : id_.id
    const state = getStateValues(options)

    return Object.assign(
      <Args extends ReadonlyArray<unknown>, A, E, R extends RT | CommandContext | `Commander.Command.${Id}.state`>(
        handler: (...args: Args) => Effect.Effect<A, E, R>
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
        const stateTag = Context.GenericTag<typeof key, State>(key)

        const makeContext_ = () => this.makeContext(id, { ...options, state: state?.value })
        const initialContext = makeContext_()
        const action = computed(() => makeContext_().action)

        const errorReporter = <A, E, R>(self: Effect.Effect<A, E, R>) =>
          self.pipe(
            Effect.tapErrorCause(
              Effect.fnUntraced(function*(cause) {
                if (Cause.isInterruptedOnly(cause)) {
                  console.info(`Interrupted while trying to ${id}`)
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

        const [result, exec] = asResult(theHandler)

        const waiting = computed(() => result.value.waiting)

        const handle = Object.assign((...args: Args) => {
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

          const command = currentState.pipe(Effect.flatMap((state) =>
            Effect.withSpan(
              exec(...args),
              id,
              {
                captureStackTrace,
                attributes: {
                  input: args,
                  state,
                  action: initialContext.action,
                  id: initialContext.id,
                  i18nKey: initialContext.i18nKey
                }
              }
            )
          ))

          return this.runFork(command)
        }, { action })

        const handleEffect = Object.assign((...args: Args) => {
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

          const command = Effect.withSpan(
            exec(...args),
            id,
            { captureStackTrace }
          )

          return Effect.currentSpan.pipe(
            Effect.option,
            Effect.map((span) =>
              this.runFork(Option.isSome(span) ? command.pipe(Effect.withParentSpan(span.value)) : command)
            )
          )
        }, { action, state })

        const compose = Object.assign((...args: Args) => {
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

          const command = Effect.withSpan(
            exec(...args),
            id,
            { captureStackTrace }
          )

          return command
        }, { action })

        const compose2 = Object.assign((...args: Args) => {
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

          const command = Effect.withSpan(
            exec(...args).pipe(Effect.flatten),
            id,
            { captureStackTrace }
          )

          return command
        }, { action })

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
          /** reactive */
          waiting,
          /** reactive */
          action,

          handle,

          /** experimental */
          handleEffect,
          /** experimental */
          compose,
          /** experimental */
          compose2,
          /** experimental */
          exec
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
    const I18nKey extends string = Id
  >(
    id: Id | { id: Id },
    options?: FnOptions<I18nKey, State>
  ): Commander.Gen<RT, Id, I18nKey> & Commander.NonGen<RT, Id, I18nKey> & {
    state: Context.Tag<`Commander.Command.${Id}.state`, State>
  } =>
    Object.assign(
      (
        fn: any,
        ...combinators: any[]
      ): any => {
        // we capture the definition stack here, so we can append it to later stack traces
        const limit = Error.stackTraceLimit
        Error.stackTraceLimit = 2
        const errorDef = new Error()
        Error.stackTraceLimit = limit

        return this.makeCommand(id, options, errorDef)(
          Effect.fnUntraced(
            // fnUntraced only supports generators as first arg, so we convert to generator if needed
            isGeneratorFunction(fn) ? fn : function*(...args) {
              return yield* fn(...args)
            },
            ...combinators as [any]
          ) as any
        )
      },
      makeBaseInfo(typeof id === "string" ? id : id.id, options),
      {
        state: Context.GenericTag<`Commander.Command.${Id}.state`, State>(
          `Commander.Command.${typeof id === "string" ? id : id.id}.state`
        )
      }
    )

  /** @experimental */
  alt2: <
    const Id extends string,
    MutArgs extends Array<unknown>,
    MutA,
    MutE,
    MutR,
    const I18nKey extends string = Id
  >(
    id:
      | Id
      | { id: Id; mutate: (...args: MutArgs) => Effect.Effect<MutA, MutE, MutR> }
      | ((...args: MutArgs) => Effect.Effect<MutA, MutE, MutR>) & { id: Id },
    options?: FnOptions<I18nKey, IntlRecord>
  ) =>
    & Commander.CommandContextLocal<Id, I18nKey>
    & (<Args extends Array<unknown>, A, E, R extends RT | CommandContext | `Commander.Command.${Id}.state`>(
      handler: (
        ctx: Effect.fn.Gen & Effect.fn.NonGen & Commander.CommandContextLocal<Id, I18nKey> & {
          // todo: only if we passed in one
          mutate: (...args: MutArgs) => Effect.Effect<MutA, MutE, MutR>
        }
      ) => (...args: Args) => Effect.Effect<A, E, R>
    ) => Commander.CommandOut<Args, A, E, R, Id, I18nKey>) = (
      _id,
      options?
    ) => {
      const isObject = typeof _id === "object" || typeof _id === "function"
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

  /** @experimental */
  alt = this.makeCommand as unknown as <const Id extends string, const I18nKey extends string = Id>(
    id: Id,
    customI18nKey?: I18nKey
  ) =>
    & Commander.CommandContextLocal<Id, I18nKey>
    & (<Args extends Array<unknown>, A, E, R extends RT | CommandContext | `Commander.Command.${Id}.state`>(
      handler: (...args: Args) => Effect.Effect<A, E, R>
    ) => Commander.CommandOut<Args, A, E, R, Id, I18nKey>)

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
    Args extends Array<unknown>,
    A,
    E,
    R,
    const State extends IntlRecord = IntlRecord,
    I18nKey extends string = Id
  >(
    mutation:
      | { mutate: (...args: Args) => Effect.Effect<A, E, R>; id: Id }
      | ((...args: Args) => Effect.Effect<A, E, R>) & { id: Id },
    options?: FnOptions<I18nKey, State>
  ): Commander.CommanderWrap<RT, Id, I18nKey, State, Args, A, E, R> =>
    Object.assign(
      (
        ...combinators: any[]
      ): any => {
        // we capture the definition stack here, so we can append it to later stack traces
        const limit = Error.stackTraceLimit
        Error.stackTraceLimit = 2
        const errorDef = new Error()
        Error.stackTraceLimit = limit

        const mutate = "mutate" in mutation ? mutation.mutate : mutation

        return this.makeCommand(mutation.id, options, errorDef)(
          Effect.fnUntraced(
            // fnUntraced only supports generators as first arg, so we convert to generator if needed
            isGeneratorFunction(mutate) ? mutate : function*(...args: Args) {
              return yield* mutate(...args)
            },
            ...combinators as [any]
          ) as any
        )
      },
      makeBaseInfo(mutation.id, options),
      {
        state: Context.GenericTag<`Commander.Command.${Id}.state`, State>(
          `Commander.Command.${mutation.id}.state`
        )
      }
    )
}

// @effect-diagnostics-next-line missingEffectServiceDependency:off
export class Commander extends Effect.Service<Commander>()("Commander", {
  dependencies: [WithToast.Default, Confirm.Default],
  effect: Effect.gen(function*() {
    const i18n = yield* I18n
    return <RT>(rt: Runtime.Runtime<RT>) => new CommanderImpl(rt, i18n)
  })
}) {}

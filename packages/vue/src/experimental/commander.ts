/* eslint-disable @typescript-eslint/no-explicit-any */
import { asResult, reportRuntimeError } from "@effect-app/vue"
import { reportMessage } from "@effect-app/vue/errorReporter"
import { type Result } from "@effect-atom/atom/Result"
import { Cause, Context, Effect, type Exit, flow, Match, Option, Runtime, S } from "effect-app"
import { SupportedErrors } from "effect-app/client"
import { OperationFailure, OperationSuccess } from "effect-app/Operations"
import { type RuntimeFiber } from "effect/Fiber"
import { type NoInfer } from "effect/Types"
import { isGeneratorFunction, type YieldWrap } from "effect/Utils"
import { computed, reactive } from "vue"
import { Confirm } from "./confirm.js"
import { I18n } from "./intl.js"
import { WithToast } from "./withToast.js"

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

/**
 * Shorthand of @see wrapEmit to wrap emit calls for OmegaForm form submission callback
 */
export const wrapEmitSubmit = <A>(
  emit: EmitWithCallback<A, "submit">
) => {
  const submit = wrapEmit(emit, "submit")
  return ({ value }: { value: A }) => submit(value)
}

export declare namespace Commander {
  export interface CommandProps<A, E, Name extends string> {
    name: Name
    action: string
    result: Result<A, E>
    waiting: boolean
  }

  export interface CommandOut<Args extends Array<any>, A, E, R, Name extends string> extends CommandProps<A, E, Name> {
    /** click handlers */
    handle: (...args: Args) => RuntimeFiber<Exit.Exit<A, E>, never>

    // TODO: if we keep them, it would probably be nicer as an option api, deciding the return value like in Atom?
    /** @experimental */
    compose: (...args: Args) => Effect.Effect<Exit.Exit<A, E>, R>
    /** @experimental */
    compose2: (...args: Args) => Effect.Effect<A, E, R>
    /**
     * @experimental
     * captures the current span and returns an Effect that when run will execute the command
     */
    handleEffect: (...args: Args) => Effect.Effect<RuntimeFiber<Exit.Exit<A, E>, never>>
    /**
     * @experimental
     */
    exec: (...args: Args) => Effect.Effect<Exit.Exit<A, E>, never, Exclude<R, CommandContext>>
  }

  type CommandOutHelper<Args extends Array<any>, Eff extends Effect.Effect<any, any, any>, Name extends string> =
    CommandOut<
      Args,
      Effect.Effect.Success<Eff>,
      Effect.Effect.Error<Eff>,
      Effect.Effect.Context<Eff>,
      Name
    >

  export type Gen<RT, Name extends string> = {
    <Eff extends YieldWrap<Effect.Effect<any, any, RT | CommandContext>>, AEff, Args extends Array<any>>(
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
      Name
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
        >,
        ...args: NoInfer<Args>
      ) => A
    ): CommandOutHelper<Args, A, Name>
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
        >,
        ...args: NoInfer<Args>
      ) => A,
      b: (_: A, ...args: NoInfer<Args>) => B
    ): CommandOutHelper<Args, B, Name>
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
        >,
        ...args: NoInfer<Args>
      ) => A,
      b: (_: A, ...args: NoInfer<Args>) => B,
      c: (_: B, ...args: NoInfer<Args>) => C
    ): CommandOutHelper<Args, C, Name>
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
        >,
        ...args: NoInfer<Args>
      ) => A,
      b: (_: A, ...args: NoInfer<Args>) => B,
      c: (_: B, ...args: NoInfer<Args>) => C,
      d: (_: C, ...args: NoInfer<Args>) => D
    ): CommandOutHelper<Args, D, Name>
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
        >,
        ...args: NoInfer<Args>
      ) => A,
      b: (_: A, ...args: NoInfer<Args>) => B,
      c: (_: B, ...args: NoInfer<Args>) => C,
      d: (_: C, ...args: NoInfer<Args>) => D,
      e: (_: D, ...args: NoInfer<Args>) => E
    ): CommandOutHelper<Args, E, Name>
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
        >,
        ...args: NoInfer<Args>
      ) => A,
      b: (_: A, ...args: NoInfer<Args>) => B,
      c: (_: B, ...args: NoInfer<Args>) => C,
      d: (_: C, ...args: NoInfer<Args>) => D,
      e: (_: D, ...args: NoInfer<Args>) => E,
      f: (_: E, ...args: NoInfer<Args>) => F
    ): CommandOutHelper<Args, F, Name>
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
        >,
        ...args: NoInfer<Args>
      ) => A,
      b: (_: A, ...args: NoInfer<Args>) => B,
      c: (_: B, ...args: NoInfer<Args>) => C,
      d: (_: C, ...args: NoInfer<Args>) => D,
      e: (_: D, ...args: NoInfer<Args>) => E,
      f: (_: E, ...args: NoInfer<Args>) => F,
      g: (_: F, ...args: NoInfer<Args>) => G
    ): CommandOutHelper<Args, G, Name>
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
    ): CommandOutHelper<Args, H, Name>
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
    ): CommandOutHelper<Args, I, Name>
  }

  export type NonGen<RT, Name extends string> = {
    <Eff extends Effect.Effect<any, any, RT | CommandContext>, Args extends Array<any>>(
      body: (...args: Args) => Eff
    ): CommandOutHelper<Args, Eff, Name>
    <Eff extends Effect.Effect<any, any, RT | CommandContext>, A, Args extends Array<any>>(
      body: (...args: Args) => A,
      a: (_: A, ...args: NoInfer<Args>) => Eff
    ): CommandOutHelper<Args, Eff, Name>
    <Eff extends Effect.Effect<any, any, RT | CommandContext>, A, B, Args extends Array<any>>(
      body: (...args: Args) => A,
      a: (_: A, ...args: NoInfer<Args>) => B,
      b: (_: B, ...args: NoInfer<Args>) => Eff
    ): CommandOutHelper<Args, Eff, Name>
    <Eff extends Effect.Effect<any, any, RT | CommandContext>, A, B, C, Args extends Array<any>>(
      body: (...args: Args) => A,
      a: (_: A, ...args: NoInfer<Args>) => B,
      b: (_: B, ...args: NoInfer<Args>) => C,
      c: (_: C, ...args: NoInfer<Args>) => Eff
    ): CommandOutHelper<Args, Eff, Name>
    <Eff extends Effect.Effect<any, any, RT | CommandContext>, A, B, C, D, Args extends Array<any>>(
      body: (...args: Args) => A,
      a: (_: A, ...args: NoInfer<Args>) => B,
      b: (_: B, ...args: NoInfer<Args>) => C,
      c: (_: C, ...args: NoInfer<Args>) => D,
      d: (_: D, ...args: NoInfer<Args>) => Eff
    ): CommandOutHelper<Args, Eff, Name>
    <Eff extends Effect.Effect<any, any, RT | CommandContext>, A, B, C, D, E, Args extends Array<any>>(
      body: (...args: Args) => A,
      a: (_: A, ...args: NoInfer<Args>) => B,
      b: (_: B, ...args: NoInfer<Args>) => C,
      c: (_: C, ...args: NoInfer<Args>) => D,
      d: (_: D, ...args: NoInfer<Args>) => E,
      e: (_: E, ...args: NoInfer<Args>) => Eff
    ): CommandOutHelper<Args, Eff, Name>
    <Eff extends Effect.Effect<any, any, RT | CommandContext>, A, B, C, D, E, F, Args extends Array<any>>(
      body: (...args: Args) => A,
      a: (_: A, ...args: NoInfer<Args>) => B,
      b: (_: B, ...args: NoInfer<Args>) => C,
      c: (_: C, ...args: NoInfer<Args>) => D,
      d: (_: D, ...args: NoInfer<Args>) => E,
      e: (_: E, ...args: NoInfer<Args>) => F,
      f: (_: F, ...args: NoInfer<Args>) => Eff
    ): CommandOutHelper<Args, Eff, Name>
    <Eff extends Effect.Effect<any, any, RT | CommandContext>, A, B, C, D, E, F, G, Args extends Array<any>>(
      body: (...args: Args) => A,
      a: (_: A, ...args: NoInfer<Args>) => B,
      b: (_: B, ...args: NoInfer<Args>) => C,
      c: (_: C, ...args: NoInfer<Args>) => D,
      d: (_: D, ...args: NoInfer<Args>) => E,
      e: (_: E, ...args: NoInfer<Args>) => F,
      f: (_: F, ...args: NoInfer<Args>) => G,
      g: (_: G, ...args: NoInfer<Args>) => Eff
    ): CommandOutHelper<Args, Eff, Name>
    <Eff extends Effect.Effect<any, any, RT | CommandContext>, A, B, C, D, E, F, G, H, Args extends Array<any>>(
      body: (...args: Args) => A,
      a: (_: A, ...args: NoInfer<Args>) => B,
      b: (_: B, ...args: NoInfer<Args>) => C,
      c: (_: C, ...args: NoInfer<Args>) => D,
      d: (_: D, ...args: NoInfer<Args>) => E,
      e: (_: E, ...args: NoInfer<Args>) => F,
      f: (_: F, ...args: NoInfer<Args>) => G,
      g: (_: G, ...args: NoInfer<Args>) => H,
      h: (_: H, ...args: NoInfer<Args>) => Eff
    ): CommandOutHelper<Args, Eff, Name>
    <Eff extends Effect.Effect<any, any, RT | CommandContext>, A, B, C, D, E, F, G, H, I, Args extends Array<any>>(
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
    ): CommandOutHelper<Args, Eff, Name>
  }

  export type GenWrap<RT, Name extends string, Args extends Array<any>, AEff, EEff, REff> = {
    (): CommandOut<
      Args,
      AEff,
      EEff,
      REff, // TODO: only allowed to be RT | CommandContext
      Name
    >
    <
      A extends Effect.Effect<any, any, RT | CommandContext>
    >(
      a: (
        _: Effect.Effect<
          AEff,
          EEff,
          REff
        >,
        ...args: NoInfer<Args>
      ) => A
    ): CommandOutHelper<Args, A, Name>
    <
      A,
      B extends Effect.Effect<any, any, RT | CommandContext>
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
    ): CommandOutHelper<Args, B, Name>
    <
      A,
      B,
      C extends Effect.Effect<any, any, RT | CommandContext>
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
    ): CommandOutHelper<Args, C, Name>
    <
      A,
      B,
      C,
      D extends Effect.Effect<any, any, RT | CommandContext>
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
    ): CommandOutHelper<Args, D, Name>
    <
      A,
      B,
      C,
      D,
      E extends Effect.Effect<any, any, RT | CommandContext>
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
    ): CommandOutHelper<Args, E, Name>
    <
      A,
      B,
      C,
      D,
      E,
      F extends Effect.Effect<any, any, RT | CommandContext>
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
    ): CommandOutHelper<Args, F, Name>
    <
      A,
      B,
      C,
      D,
      E,
      F,
      G extends Effect.Effect<any, any, RT | CommandContext>
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
    ): CommandOutHelper<Args, G, Name>
    <A, B, C, D, E, F, G, H extends Effect.Effect<any, any, RT | CommandContext>>(
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
    ): CommandOutHelper<Args, H, Name>
    <A, B, C, D, E, F, G, H, I extends Effect.Effect<any, any, RT | CommandContext>>(
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
    ): CommandOutHelper<Args, I, Name>
  }

  export type NonGenWrap<RT, Name extends string, Args extends Array<any>, AEff, EEff, REff> = {
    (): CommandOutHelper<Args, Effect.Effect<AEff, EEff, REff>, Name>
    <Eff extends Effect.Effect<any, any, RT | CommandContext>, Args extends Array<any>>(
      a: (
        _: Effect.Effect<
          AEff,
          EEff,
          REff
        >,
        ...args: NoInfer<Args>
      ) => Eff
    ): CommandOutHelper<Args, Eff, Name>
    <Eff extends Effect.Effect<any, any, RT | CommandContext>, B, Args extends Array<any>>(
      a: (
        _: Effect.Effect<
          AEff,
          EEff,
          REff
        >,
        ...args: NoInfer<Args>
      ) => B,
      b: (_: B, ...args: NoInfer<Args>) => Eff
    ): CommandOutHelper<Args, Eff, Name>
    <Eff extends Effect.Effect<any, any, RT | CommandContext>, B, C, Args extends Array<any>>(
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
    ): CommandOutHelper<Args, Eff, Name>
    <Eff extends Effect.Effect<any, any, RT | CommandContext>, B, C, D, Args extends Array<any>>(
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
    ): CommandOutHelper<Args, Eff, Name>
    <Eff extends Effect.Effect<any, any, RT | CommandContext>, B, C, D, E, Args extends Array<any>>(
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
    ): CommandOutHelper<Args, Eff, Name>
    <Eff extends Effect.Effect<any, any, RT | CommandContext>, B, C, D, E, F, Args extends Array<any>>(
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
    ): CommandOutHelper<Args, Eff, Name>
    <Eff extends Effect.Effect<any, any, RT | CommandContext>, B, C, D, E, F, G, Args extends Array<any>>(
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
    ): CommandOutHelper<Args, Eff, Name>
    <Eff extends Effect.Effect<any, any, RT | CommandContext>, B, C, D, E, F, G, H, Args extends Array<any>>(
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
    ): CommandOutHelper<Args, Eff, Name>
    <Eff extends Effect.Effect<any, any, RT | CommandContext>, B, C, D, E, F, G, H, I, Args extends Array<any>>(
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
    ): CommandOutHelper<Args, Eff, Name>
  }
}

// @effect-diagnostics-next-line missingEffectServiceDependency:off
export class Commander extends Effect.Service<Commander>()("Commander", {
  dependencies: [WithToast.Default, Confirm.Default],
  effect: Effect.gen(function*() {
    const { intl } = yield* I18n
    const withToast = yield* WithToast
    const { confirm, confirmOrInterrupt } = yield* Confirm

    const makeCommand = <RT>(runtime: Runtime.Runtime<RT>) => {
      const runFork = Runtime.runFork(runtime)
      return (actionName: string, errorDef?: Error) =>
      <Args extends ReadonlyArray<any>, A, E, R extends RT | CommandContext>(
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

        const action = intl.formatMessage({
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
              }, Effect.uninterruptible)
            )
          )

        const theHandler = flow(
          handler,
          // all must be within the Effect.fn to fit within the Span
          Effect.provideService(CommandContext, context),
          (_) => Effect.annotateCurrentSpan({ action }).pipe(Effect.zipRight(_)),
          errorReporter
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

          const command = Effect.withSpan(
            exec(...args),
            actionName,
            { captureStackTrace }
          )

          return runFork(command)
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
            actionName,
            { captureStackTrace }
          )

          return Effect.currentSpan.pipe(
            Effect.option,
            Effect.map((span) =>
              runFork(Option.isSome(span) ? command.pipe(Effect.withParentSpan(span.value)) : command)
            )
          )
        }, { action })

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
            actionName,
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
            actionName,
            { captureStackTrace }
          )

          return command
        }, { action })

        return reactive({
          name: actionName,
          result,
          waiting,
          action,
          handle,
          handleEffect,
          compose,
          compose2,
          exec
        })
      }
    }

    return {
      /** @experimental */
      takeOver:
        <Args extends any[], A, E, R, const Name extends string>(command: Commander.CommandOut<Args, A, E, R, Name>) =>
        (...args: Args) => {
          // we capture the call site stack here
          const limit = Error.stackTraceLimit
          Error.stackTraceLimit = 2
          const errorCall = new Error()
          const localErrorDef = new Error()
          Error.stackTraceLimit = limit

          // TODO
          const errorDef = localErrorDef

          let cache: false | string = false
          const captureStackTrace = () => {
            // in case of an error, we want to append the definition stack to the call site stack,
            // so we can see where the handler was defined too

            if (cache !== false) {
              return cache
            }
            if (errorCall.stack) {
              const stackDef = errorDef.stack!.trim().split("\n")
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

          return Effect.gen(function*() {
            const ctx = yield* CommandContext
            ctx.action = command.action
            return yield* command.exec(...args).pipe(
              Effect.flatten,
              Effect.withSpan(
                command.action,
                { captureStackTrace }
              )
            )
          })
        },

      /** Version of @see confirmOrInterrupt that automatically includes the action name in the default messages */
      confirmOrInterrupt: Effect.fnUntraced(function*(
        message: string | undefined = undefined
      ) {
        const context = yield* CommandContext
        yield* confirmOrInterrupt(
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
        return yield* confirm(
          message
            ?? intl.formatMessage(
              { id: "handle.confirmation" },
              { action: context.action }
            )
        )
      }),
      /** Version of withDefaultToast that automatically includes the action name in the default messages and uses intl */
      withDefaultToast: <A, E, R, Args extends ReadonlyArray<unknown>>(
        options?: {
          errorRenderer?: (e: E, ...args: Args) => string | undefined
          onWaiting?: null
          onSuccess?: null
        }
      ) =>
      (
        self: Effect.Effect<A, E, R>,
        ...args: Args
      ) =>
        Effect.gen(function*() {
          const cc = yield* CommandContext

          function renderError(e: E, ...args: Args): string {
            if (options?.errorRenderer) {
              const m = options.errorRenderer(e, ...args)
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
                  return intl.formatMessage({ id: "validation.failed" })
                }
              }),
              Match.orElse((e) => `${e.message ?? e._tag ?? e}`)
            )
          }

          return yield* self.pipe(
            (_) =>
              withToast<A, E, Args, R>({
                onWaiting: options?.onWaiting === null ? null : intl.formatMessage(
                  { id: "handle.waiting" },
                  { action: cc.action }
                ),
                onSuccess: options?.onSuccess === null
                  ? null
                  : (a, ..._args) =>
                    intl.formatMessage({ id: "handle.success" }, { action: cc.action })
                    + (S.is(OperationSuccess)(a) && a.message ? "\n" + a.message : ""),
                onFailure: (o, ...args) =>
                  Option.match(o, {
                    onNone: () =>
                      intl.formatMessage(
                        { id: "handle.unexpected_error2" },
                        {
                          action: cc.action,
                          error: "" // TODO consider again Cause.pretty(cause), // will be reported to Sentry/Otel anyway.. and we shouldn't bother users with error dumps?
                        }
                      ),
                    onSome: (e) =>
                      S.is(OperationFailure)(e)
                        ? {
                          level: "warn",
                          message: intl.formatMessage(
                              { id: "handle.with_warnings" },
                              { action: cc.action }
                            ) + e.message
                            ? "\n" + e.message
                            : ""
                        }
                        : `${
                          intl.formatMessage(
                            { id: "handle.with_errors" },
                            { action: cc.action }
                          )
                        }:\n` + renderError(e, ...args)
                  })
              })(_, ...args)
          )
        }),
      /**
       * Define a Command for handling user actions with built-in error reporting and state management.
       *
       * @param actionName The internal identifier for the action. Used as a tracing span and to lookup
       *                   the user-facing name via internationalization (`action.${actionName}`).
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
       *
       * **User Feedback**: Use the `withDefaultToast` helper for status notifications, or render
       * the `result` inline for custom UI feedback.
       */
      fn: <RT>(runtime: Runtime.Runtime<RT>) => {
        const make = makeCommand(runtime)
        return <const Name extends string>(actionName: Name): Commander.Gen<RT, Name> & Commander.NonGen<RT, Name> =>
        (
          fn: any,
          ...combinators: any[]
        ): any => {
          // we capture the definition stack here, so we can append it to later stack traces
          const limit = Error.stackTraceLimit
          Error.stackTraceLimit = 2
          const errorDef = new Error()
          Error.stackTraceLimit = limit

          return make(actionName, errorDef)(
            Effect.fnUntraced(
              // fnUntraced only supports generators as first arg, so we convert to generator if needed
              isGeneratorFunction(fn) ? fn : function*(...args) {
                return yield* fn(...args)
              },
              ...combinators as [any]
            ) as any
          )
        }
      },

      /** @experimental */
      alt: makeCommand as unknown as <RT>(runtime: Runtime.Runtime<RT>) => <const Name extends string>(
        actionName: Name
      ) => <Args extends Array<any>, A, E, R extends RT | CommandContext>(
        handler: (...args: Args) => Effect.Effect<A, E, R>
      ) => Commander.CommandOut<Args, A, E, R, Name>,

      /** @experimental */
      wrap: <RT>(runtime: Runtime.Runtime<RT>) => {
        const make = makeCommand(runtime)
        return <const Name extends string, Args extends Array<any>, A, E, R>(
          mutation: { mutate: (...args: Args) => Effect.Effect<A, E, R>; name: Name }
        ): Commander.GenWrap<RT, Name, Args, A, E, R> & Commander.NonGenWrap<RT, Name, Args, A, E, R> =>
        (
          ...combinators: any[]
        ): any => {
          // we capture the definition stack here, so we can append it to later stack traces
          const limit = Error.stackTraceLimit
          Error.stackTraceLimit = 2
          const errorDef = new Error()
          Error.stackTraceLimit = limit

          return make(mutation.name, errorDef)(
            Effect.fnUntraced(
              // fnUntraced only supports generators as first arg, so we convert to generator if needed
              isGeneratorFunction(mutation.mutate) ? mutation.mutate : function*(...args: Args) {
                return yield* mutation.mutate(...args)
              },
              ...combinators as [any]
            ) as any
          )
        }
      }
    }
  })
}) {}

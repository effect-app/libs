/* eslint-disable @typescript-eslint/no-explicit-any */
import { asResult, type MissingDependencies, reportRuntimeError } from "@effect-app/vue"
import { reportMessage } from "@effect-app/vue/errorReporter"
import { type Result } from "@effect-atom/atom/Result"
import { Cause, Context, Effect, type Exit, flow, Match, Option, Runtime, S } from "effect-app"
import { SupportedErrors } from "effect-app/client"
import { OperationFailure, OperationSuccess } from "effect-app/Operations"
import { wrapEffect } from "effect-app/utils"
import { id, type RuntimeFiber } from "effect/Fiber"
import { type NoInfer } from "effect/Types"
import { isGeneratorFunction, type YieldWrap } from "effect/Utils"
import { type FormatXMLElementFn, type PrimitiveType } from "intl-messageformat"
import { computed, type ComputedRef, reactive, ref } from "vue"
import { CommandContext } from "./commander.js"
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
  disableSharedWaiting?: boolean
}

type FnOptionsInternal<I18nCustomKey extends string> = {
  i18nCustomKey?: I18nCustomKey | undefined
  state?: IntlRecord | undefined
}

export declare namespace Commander2 {
  export type CommanderBase<RT, Id extends string, I18nKey extends string, State extends IntlRecord | undefined> =
    & Gen<RT, Id, I18nKey, State>
    & NonGen<RT, Id, I18nKey, State>
    & CommandContextLocal<Id, I18nKey>
    & {
      state: Context.Tag<`Commander.Command.${Id}.state`, State>
    }

  export type CommanderFn<RT, Id extends string, I18nKey extends string, State extends IntlRecord | undefined> =
    CommanderBase<RT, Id, I18nKey, State>

  export type CommanderWrap<
    RT,
    Id extends string,
    I18nCustomKey extends string,
    State extends IntlRecord | undefined,
    I extends any[],
    A,
    E,
    R
  > =
    & CommandContextLocal<Id, I18nCustomKey>
    & GenWrap<RT, Id, I18nCustomKey, I, A, E, R, State>
    & NonGenWrap<RT, Id, I18nCustomKey, I, A, E, R, State>
    & {
      state: Context.Tag<`Commander.Command.${Id}.state`, State>
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
    result: Result<A, E>
    /** reactive */
    waiting: boolean
    /** reactive */
    state: ComputedRef<State>
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
    handle: ((arg: Arg) => RuntimeFiber<Exit.Exit<A, E>, never>) & {
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
    // handleEffect: (arg: Arg) => Effect.Effect<RuntimeFiber<Exit.Exit<A, E>, never>>
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

  type CommandOutHelper<
    Arg,
    Eff extends Effect.Effect<any, any, any>,
    Id extends string,
    I18nKey extends string,
    State extends IntlRecord | undefined
  > = CommandOut<
    Arg,
    Effect.Effect.Success<Eff>,
    Effect.Effect.Error<Eff>,
    Effect.Effect.Context<Eff>,
    Id,
    I18nKey,
    State
  >

  export type Gen<RT, Id extends string, I18nKey extends string, State extends IntlRecord | undefined> = {
    <
      Eff extends YieldWrap<Effect.Effect<any, any, RT | CommandContext | `Commander.Command.${Id}.state`>>,
      AEff,
      Arg
    >(
      body: (arg: Arg) => Generator<Eff, AEff, never>
    ): CommandOut<
      Arg,
      AEff,
      [Eff] extends [never] ? never
        : [Eff] extends [YieldWrap<Effect.Effect<infer _A, infer E, infer _R>>] ? E
        : never,
      [Eff] extends [never] ? never
        : [Eff] extends [YieldWrap<Effect.Effect<infer _A, infer _E, infer R>>] ? R
        : never,
      Id,
      I18nKey,
      State
    >
    <
      Eff extends YieldWrap<Effect.Effect<any, any, any>>,
      AEff,
      Arg,
      A extends Effect.Effect<any, any, RT | CommandContext | `Commander.Command.${Id}.state`>
    >(
      body: (arg: Arg, ctx: CommandContextLocal2<Id, I18nKey, State>) => Generator<Eff, AEff, never>,
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
        arg: NoInfer<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => A
    ): CommandOutHelper<Arg, A, Id, I18nKey, State>
    <
      Eff extends YieldWrap<Effect.Effect<any, any, any>>,
      AEff,
      Arg,
      A,
      B extends Effect.Effect<any, any, RT | CommandContext | `Commander.Command.${Id}.state`>
    >(
      body: (arg: Arg, ctx: CommandContextLocal2<Id, I18nKey, State>) => Generator<Eff, AEff, never>,
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
        arg: NoInfer<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => A,
      b: (_: A, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => B
    ): CommandOutHelper<Arg, B, Id, I18nKey, State>
    <
      Eff extends YieldWrap<Effect.Effect<any, any, any>>,
      AEff,
      Arg,
      A,
      B,
      C extends Effect.Effect<any, any, RT | CommandContext | `Commander.Command.${Id}.state`>
    >(
      body: (arg: Arg, ctx: CommandContextLocal2<Id, I18nKey, State>) => Generator<Eff, AEff, never>,
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
        arg: NoInfer<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => A,
      b: (_: A, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => B,
      c: (_: B, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => C
    ): CommandOutHelper<Arg, C, Id, I18nKey, State>
    <
      Eff extends YieldWrap<Effect.Effect<any, any, any>>,
      AEff,
      Arg,
      A,
      B,
      C,
      D extends Effect.Effect<any, any, RT | CommandContext | `Commander.Command.${Id}.state`>
    >(
      body: (arg: Arg, ctx: CommandContextLocal2<Id, I18nKey, State>) => Generator<Eff, AEff, never>,
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
        arg: NoInfer<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => A,
      b: (_: A, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => B,
      c: (_: B, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => C,
      d: (_: C, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => D
    ): CommandOutHelper<Arg, D, Id, I18nKey, State>
    <
      Eff extends YieldWrap<Effect.Effect<any, any, any>>,
      AEff,
      Arg,
      A,
      B,
      C,
      D,
      E extends Effect.Effect<any, any, RT | CommandContext | `Commander.Command.${Id}.state`>
    >(
      body: (arg: Arg, ctx: CommandContextLocal2<Id, I18nKey, State>) => Generator<Eff, AEff, never>,
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
        arg: NoInfer<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => A,
      b: (_: A, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => B,
      c: (_: B, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => C,
      d: (_: C, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => D,
      e: (_: D, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => E
    ): CommandOutHelper<Arg, E, Id, I18nKey, State>
    <
      Eff extends YieldWrap<Effect.Effect<any, any, any>>,
      AEff,
      Arg,
      A,
      B,
      C,
      D,
      E,
      F extends Effect.Effect<any, any, RT | CommandContext | `Commander.Command.${Id}.state`>
    >(
      body: (arg: Arg, ctx: CommandContextLocal2<Id, I18nKey, State>) => Generator<Eff, AEff, never>,
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
        arg: NoInfer<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => A,
      b: (_: A, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => B,
      c: (_: B, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => C,
      d: (_: C, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => D,
      e: (_: D, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => E,
      f: (_: E, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => F
    ): CommandOutHelper<Arg, F, Id, I18nKey, State>
    <
      Eff extends YieldWrap<Effect.Effect<any, any, any>>,
      AEff,
      Arg,
      A,
      B,
      C,
      D,
      E,
      F,
      G extends Effect.Effect<any, any, RT | CommandContext | `Commander.Command.${Id}.state`>
    >(
      body: (arg: Arg, ctx: CommandContextLocal2<Id, I18nKey, State>) => Generator<Eff, AEff, never>,
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
        arg: NoInfer<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => A,
      b: (_: A, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => B,
      c: (_: B, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => C,
      d: (_: C, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => D,
      e: (_: D, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => E,
      f: (_: E, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => F,
      g: (_: F, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => G
    ): CommandOutHelper<Arg, G, Id, I18nKey, State>
    <
      Eff extends YieldWrap<Effect.Effect<any, any, any>>,
      AEff,
      Arg,
      A,
      B,
      C,
      D,
      E,
      F,
      G,
      H extends Effect.Effect<any, any, RT | CommandContext | `Commander.Command.${Id}.state`>
    >(
      body: (arg: Arg, ctx: CommandContextLocal2<Id, I18nKey, State>) => Generator<Eff, AEff, never>,
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
        arg: NoInfer<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => A,
      b: (_: A, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => B,
      c: (_: B, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => C,
      d: (_: C, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => D,
      e: (_: D, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => E,
      f: (_: E, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => F,
      g: (_: F, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => G,
      h: (_: G, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => H
    ): CommandOutHelper<Arg, H, Id, I18nKey, State>
    <
      Eff extends YieldWrap<Effect.Effect<any, any, any>>,
      AEff,
      Arg,
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
      body: (arg: Arg, ctx: CommandContextLocal2<Id, I18nKey, State>) => Generator<Eff, AEff, never>,
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
        arg: NoInfer<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => A,
      b: (_: A, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => B,
      c: (_: B, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => C,
      d: (_: C, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => D,
      e: (_: D, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => E,
      f: (_: E, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => F,
      g: (_: F, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => G,
      h: (_: G, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => H,
      i: (_: H, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => I
    ): CommandOutHelper<Arg, I, Id, I18nKey, State>
  }

  export type NonGen<RT, Id extends string, I18nKey extends string, State extends IntlRecord | undefined> = {
    <
      Eff extends Effect.Effect<any, any, RT | CommandContext | `Commander.Command.${Id}.state`>,
      Arg
    >(
      body: (arg: Arg, ctx: CommandContextLocal2<Id, I18nKey, State>) => Eff
    ): CommandOutHelper<Arg, Eff, Id, I18nKey, State>
    <
      Eff extends Effect.Effect<any, any, RT | CommandContext | `Commander.Command.${Id}.state`>,
      A,
      Arg
    >(
      body: (arg: Arg, ctx: CommandContextLocal2<Id, I18nKey, State>) => A,
      a: (_: A, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => Eff
    ): CommandOutHelper<Arg, Eff, Id, I18nKey, State>
    <
      Eff extends Effect.Effect<any, any, RT | CommandContext | `Commander.Command.${Id}.state`>,
      A,
      B,
      Arg
    >(
      body: (arg: Arg, ctx: CommandContextLocal2<Id, I18nKey, State>) => A,
      a: (_: A, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => B,
      b: (_: B, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => Eff
    ): CommandOutHelper<Arg, Eff, Id, I18nKey, State>
    <
      Eff extends Effect.Effect<any, any, RT | CommandContext | `Commander.Command.${Id}.state`>,
      A,
      B,
      C,
      Arg
    >(
      body: (arg: Arg, ctx: CommandContextLocal2<Id, I18nKey, State>) => A,
      a: (_: A, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => B,
      b: (_: B, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => C,
      c: (_: C, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => Eff
    ): CommandOutHelper<Arg, Eff, Id, I18nKey, State>
    <
      Eff extends Effect.Effect<any, any, RT | CommandContext | `Commander.Command.${Id}.state`>,
      A,
      B,
      C,
      D,
      Arg
    >(
      body: (arg: Arg, ctx: CommandContextLocal2<Id, I18nKey, State>) => A,
      a: (_: A, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => B,
      b: (_: B, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => C,
      c: (_: C, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => D,
      d: (_: D, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => Eff
    ): CommandOutHelper<Arg, Eff, Id, I18nKey, State>
    <
      Eff extends Effect.Effect<any, any, RT | CommandContext | `Commander.Command.${Id}.state`>,
      A,
      B,
      C,
      D,
      E,
      Arg
    >(
      body: (arg: Arg, ctx: CommandContextLocal2<Id, I18nKey, State>) => A,
      a: (_: A, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => B,
      b: (_: B, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => C,
      c: (_: C, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => D,
      d: (_: D, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => E,
      e: (_: E, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => Eff
    ): CommandOutHelper<Arg, Eff, Id, I18nKey, State>
    <
      Eff extends Effect.Effect<any, any, RT | CommandContext | `Commander.Command.${Id}.state`>,
      A,
      B,
      C,
      D,
      E,
      F,
      Arg
    >(
      body: (arg: Arg, ctx: CommandContextLocal2<Id, I18nKey, State>) => A,
      a: (_: A, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => B,
      b: (_: B, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => C,
      c: (_: C, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => D,
      d: (_: D, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => E,
      e: (_: E, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => F,
      f: (_: F, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => Eff
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
      Arg
    >(
      body: (arg: Arg, ctx: CommandContextLocal2<Id, I18nKey, State>) => A,
      a: (_: A, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => B,
      b: (_: B, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => C,
      c: (_: C, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => D,
      d: (_: D, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => E,
      e: (_: E, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => F,
      f: (_: F, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => G,
      g: (_: G, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => Eff
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
      Arg
    >(
      body: (arg: Arg, ctx: CommandContextLocal2<Id, I18nKey, State>) => A,
      a: (_: A, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => B,
      b: (_: B, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => C,
      c: (_: C, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => D,
      d: (_: D, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => E,
      e: (_: E, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => F,
      f: (_: F, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => G,
      g: (_: G, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => H,
      h: (_: H, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => Eff
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
      Arg
    >(
      body: (arg: Arg, ctx: CommandContextLocal2<Id, I18nKey, State>) => A,
      a: (_: A, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => B,
      b: (_: B, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => C,
      c: (_: C, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => D,
      d: (_: D, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => E,
      e: (_: E, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => F,
      f: (_: F, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => G,
      g: (_: G, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => H,
      h: (_: H, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => I,
      i: (_: H, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => Eff
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
        arg: NoInfer<Arg>,
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
        arg: NoInfer<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => A,
      b: (_: A, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => B
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
        arg: NoInfer<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => A,
      b: (_: A, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => B,
      c: (_: B, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => C
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
        arg: NoInfer<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => A,
      b: (_: A, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => B,
      c: (_: B, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => C,
      d: (_: C, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => D
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
        arg: NoInfer<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => A,
      b: (_: A, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => B,
      c: (_: B, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => C,
      d: (_: C, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => D,
      e: (_: D, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => E
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
        arg: NoInfer<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => A,
      b: (_: A, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => B,
      c: (_: B, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => C,
      d: (_: C, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => D,
      e: (_: D, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => E,
      f: (_: E, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => F
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
        arg: NoInfer<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => A,
      b: (_: A, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => B,
      c: (_: B, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => C,
      d: (_: C, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => D,
      e: (_: D, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => E,
      f: (_: E, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => F,
      g: (_: F, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => G
    ): CommandOutHelper<Arg, G, Id, I18nKey, State>
    <A, B, C, D, E, F, G, H extends Effect.Effect<any, any, RT | CommandContext | `Commander.Command.${Id}.state`>>(
      a: (
        _: Effect.Effect<
          AEff,
          EEff,
          REff
        >,
        arg: NoInfer<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => A,
      b: (_: A, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => B,
      c: (_: B, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => C,
      d: (_: C, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => D,
      e: (_: D, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => E,
      f: (_: E, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => F,
      g: (_: F, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => G,
      h: (_: G, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => H
    ): CommandOutHelper<Arg, H, Id, I18nKey, State>
    <A, B, C, D, E, F, G, H, I extends Effect.Effect<any, any, RT | CommandContext | `Commander.Command.${Id}.state`>>(
      a: (
        _: Effect.Effect<
          AEff,
          EEff,
          REff
        >,
        arg: NoInfer<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => A,
      b: (_: A, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => B,
      c: (_: B, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => C,
      d: (_: C, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => D,
      e: (_: D, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => E,
      f: (_: E, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => F,
      g: (_: F, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => G,
      h: (_: G, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => H,
      i: (_: H, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => I
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
        arg: NoInfer<Arg>,
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
        arg: NoInfer<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => B,
      b: (_: B, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => Eff
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
        arg: NoInfer<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => B,
      b: (_: B, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => C,
      c: (_: C, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => Eff
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
        arg: NoInfer<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => B,
      b: (_: B, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => C,
      c: (_: C, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => D,
      d: (_: D, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => Eff
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
        arg: NoInfer<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => B,
      b: (_: B, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => C,
      c: (_: C, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => D,
      d: (_: D, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => E,
      e: (_: E, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => Eff
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
        arg: NoInfer<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => B,
      b: (_: B, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => C,
      c: (_: C, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => D,
      d: (_: D, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => E,
      e: (_: E, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => F,
      f: (_: F, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => Eff
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
        arg: NoInfer<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => B,
      b: (_: B, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => C,
      c: (_: C, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => D,
      d: (_: D, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => E,
      e: (_: E, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => F,
      f: (_: F, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => G,
      g: (_: G, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => Eff
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
        arg: NoInfer<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => B,
      b: (_: B, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => C,
      c: (_: C, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => D,
      d: (_: D, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => E,
      e: (_: E, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => F,
      f: (_: F, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => G,
      g: (_: G, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => H,
      h: (_: H, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => Eff
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
        arg: NoInfer<Arg>,
        ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>
      ) => B,
      b: (_: B, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => C,
      c: (_: C, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => D,
      d: (_: D, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => E,
      e: (_: E, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => F,
      f: (_: F, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => G,
      g: (_: G, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => H,
      h: (_: H, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => I,
      i: (_: H, arg: NoInfer<Arg>, ctx: CommandContextLocal2<NoInfer<Id>, NoInfer<I18nKey>, NoInfer<State>>) => Eff
    ): CommandOutHelper<Arg, Eff, Id, I18nKey, State>
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
      /**
       * if true, previous toasts with this key will be replaced
       */
      stableToastId?: undefined | true | string | ((id: string, ...args: Args) => true | string | undefined)
      errorRenderer?: ErrorRenderer<E, Args>
      onWaiting?: null | undefined | string | ((id: string, ...args: Args) => string | null | undefined)
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
      const stableToastId = options?.stableToastId
        ? typeof options.stableToastId === "string"
          ? options.stableToastId
          : typeof options.stableToastId === "boolean"
          ? cc.id
          : typeof options.stableToastId === "function"
          ? (...args: Args) => {
            const r = (options.stableToastId as any)(id, ...args)
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
              options?.errorRenderer
            ),
            stableToastId
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
        const context = computed(() => makeContext_())
        const action = computed(() => context.value.action)
        const label = computed(() => context.value.label)

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

        const [result, exec_] = asResult(theHandler)
        // probably could be nice to use a namespaced, computable wait key instead not unlike query invalidation?
        // ["Something.Update", { id }] for instance
        const exec = options?.disableSharedWaiting
          ? exec_
          : Effect
            .fnUntraced(function*(...args: Args) {
              registerWait(id)
              return yield* exec_(...args)
            }, Effect.onExit(() => Effect.sync(() => unregisterWait(id))))

        const waiting = options?.disableSharedWaiting
          ? computed(() => result.value.waiting)
          : computed(() => result.value.waiting || (waitState.value[id] ?? 0) > 0)

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
                  label: initialContext.label,
                  id: initialContext.id,
                  i18nKey: initialContext.i18nKey
                }
              }
            )
          ))

          return this.runFork(command)
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
          /** reactive */
          waiting,
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
    const I18nKey extends string = Id
  >(
    id: Id | { id: Id },
    options?: FnOptions<I18nKey, State>
  ): Commander2.Gen<RT, Id, I18nKey, State> & Commander2.NonGen<RT, Id, I18nKey, State> & {
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
    const I18nKey extends string = Id,
    State extends IntlRecord | undefined = undefined
  >(
    id:
      | Id
      | { id: Id; mutate: (...args: MutArgs) => Effect.Effect<MutA, MutE, MutR> }
      | ((...args: MutArgs) => Effect.Effect<MutA, MutE, MutR>) & { id: Id },
    options?: FnOptions<I18nKey, State>
  ) =>
    & Commander2.CommandContextLocal<Id, I18nKey>
    & (<Args extends Array<unknown>, A, E, R extends RT | CommandContext | `Commander.Command.${Id}.state`>(
      handler: (
        ctx: Effect.fn.Gen & Effect.fn.NonGen & Commander2.CommandContextLocal<Id, I18nKey> & {
          // todo: only if we passed in one
          mutate: (...args: MutArgs) => Effect.Effect<MutA, MutE, MutR>
        }
      ) => (...args: Args) => Effect.Effect<A, E, R>
    ) => Commander2.CommandOut<Args, A, E, R, Id, I18nKey, State>) = (
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
  alt = this.makeCommand as unknown as <
    const Id extends string,
    const I18nKey extends string = Id,
    State extends IntlRecord | undefined = undefined
  >(
    id: Id,
    customI18nKey?: I18nKey
  ) =>
    & Commander2.CommandContextLocal<Id, I18nKey>
    & (<Args extends Array<unknown>, A, E, R extends RT | CommandContext | `Commander.Command.${Id}.state`>(
      handler: (...args: Args) => Effect.Effect<A, E, R>
    ) => Commander2.CommandOut<Args, A, E, R, Id, I18nKey, State>)

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
  ): Commander2.CommanderWrap<RT, Id, I18nKey, State, Args, A, E, R> =>
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

/* eslint-disable @typescript-eslint/no-explicit-any */
import type * as Cause from "effect/Cause"
import type * as Effect from "effect/Effect"
import type * as Either from "effect/Either"
import type * as Option from "effect/Option"
import type { NonEmptyArray } from "effect/ReadonlyArray"
import type { Concurrency, NoInfer } from "effect/Types"
import "./builtin.js"
import type { LazyArg } from "effect/Function"

// we had to put the patches inside effect, for it to work with vite
import "effect/fluentExtensions"

export {}

declare module "effect/Effect" {
  export interface Effect<A, E, R> {
    andThen<A, X, E, R>(
      this: Effect<A, E, R>,
      f: (a: NoInfer<A>) => X
    ): [X] extends [Effect<infer A1, infer E1, infer R1>] ? Effect<A1, E | E1, R | R1>
      : [X] extends [Promise<infer A1>] ? Effect<A1, Cause.UnknownException, R>
      : Effect<X, E, R>

    andThen<A, X, E, R>(
      this: Effect<A, E, R>,
      f: X
    ): [X] extends [Effect<infer A1, infer E1, infer R1>] ? Effect<A1, E | E1, R | R1>
      : [X] extends [Promise<infer A1>] ? Effect<A1, Cause.UnknownException, R>
      : Effect<X, E, R>
    tap<A, X, E, R>(
      this: Effect<A, E, R>,
      f: (a: NoInfer<A>) => X
    ): [X] extends [Effect<infer _A1, infer E1, infer R1>] ? Effect<A, E | E1, R | R1>
      : [X] extends [Promise<infer _A1>] ? Effect<A, Cause.UnknownException | E, R>
      : Effect<A, E, R>
    tap<A, X, E, R>(
      this: Effect<A, E, R>,
      f: X
    ): [X] extends [Effect<infer _A1, infer E1, infer R1>] ? Effect<A, E | E1, R | R1>
      : [X] extends [Promise<infer _A1>] ? Effect<A, Cause.UnknownException | E, R>
      : Effect<A, E, R>
  }
}

declare module "effect/Cause" {
  export interface YieldableError {
    andThen<A, X, E, R>(
      this: Effect.Effect<A, E, R>,
      f: (a: NoInfer<A>) => X
    ): [X] extends [Effect.Effect<infer A1, infer E1, infer R1>] ? Effect.Effect<A1, E | E1, R | R1>
      : [X] extends [Promise<infer A1>] ? Effect.Effect<A1, UnknownException | E, R>
      : Effect.Effect<X, E, R>

    andThen<A, X, E, R>(
      this: Effect.Effect<A, E, R>,
      f: X
    ): [X] extends [Effect.Effect<infer A1, infer E1, infer R1>] ? Effect.Effect<A1, E | E1, R | R1>
      : [X] extends [Promise<infer A1>] ? Effect.Effect<A1, UnknownException | E, R>
      : Effect.Effect<X, E, R>
    tap<A, X, E, R>(
      this: Effect.Effect<A, E, R>,
      f: (a: NoInfer<A>) => X
    ): [X] extends [Effect.Effect<infer _A1, infer E1, infer R1>] ? Effect.Effect<A, E | E1, R | R1>
      : [X] extends [Promise<infer _A1>] ? Effect.Effect<R, UnknownException | E, A>
      : Effect.Effect<A, E, R>
    tap<A, X, E, R>(
      this: Effect.Effect<A, E, R>,
      f: X
    ): [X] extends [Effect.Effect<infer _A1, infer E1, infer R1>] ? Effect.Effect<A, E | E1, R | R1>
      : [X] extends [Promise<infer _A1>] ? Effect.Effect<R, UnknownException | E, A>
      : Effect.Effect<A, E, R>
  }
}

// declare module "effect/Runtime" {
//   export interface Runtime<in R> {
//     /**
//      * Executes the effect using the provided Scheduler or using the global
//      * Scheduler if not provided
//      *
//      * @since 2.0.0
//      * @category execution
//      */
//     runFork<A, E, R>(
//       this: Runtime<R>,
//       self: Effect.Effect<A, E, R>,
//       options?: RunForkOptions
//     ): Fiber.RuntimeFiber<E, A>

//     /**
//      * Executes the effect synchronously returning the exit.
//      *
//      * This method is effectful and should only be invoked at the edges of your
//      * program.
//      *
//      * @since 2.0.0
//      * @category execution
//      */
//     runSyncExit<A, E, R>(this: Runtime<R>, effect: Effect.Effect<A, E, R>): Exit.Exit<E, A>

//     /**
//      * Executes the effect synchronously throwing in case of errors or async boundaries.
//      *
//      * This method is effectful and should only be invoked at the edges of your
//      * program.
//      *
//      * @since 2.0.0
//      * @category execution
//      */
//     runSync<A, E, R>(this: Runtime<R>, effect: Effect.Effect<A, E, R>): A

//     /**
//      * Executes the effect asynchronously, eventually passing the exit value to
//      * the specified callback.
//      *
//      * This method is effectful and should only be invoked at the edges of your
//      * program.
//      *
//      * @since 2.0.0
//      * @category execution
//      */
//     runCallback<A, E, R>(
//       this: Runtime<R>,
//       effect: Effect.Effect<A, E, R>,
//       options?: RunCallbackOptions<E, A> | undefined
//     ): (fiberId?: FiberId.FiberId | undefined, options?: RunCallbackOptions<E, A> | undefined) => void

//     /**
//      * Runs the `Effect`, returning a JavaScript `Promise` that will be resolved
//      * with the value of the effect once the effect has been executed, or will be
//      * rejected with the first error or exception throw by the effect.
//      *
//      * This method is effectful and should only be used at the edges of your
//      * program.
//      *
//      * @since 2.0.0
//      * @category execution
//      */
//     runPromise<A, E, R>(this: Runtime<R>, effect: Effect.Effect<A, E, R>): Promise<A>

//     /**
//      * Runs the `Effect`, returning a JavaScript `Promise` that will be resolved
//      * with the `Exit` state of the effect once the effect has been executed.
//      *
//      * This method is effectful and should only be used at the edges of your
//      * program.
//      *
//      * @since 2.0.0
//      * @category execution
//      */
//     runPromiseExit<A, E, R>(
//       this: Runtime<R>,
//       effect: Effect.Effect<A, E, R>
//     ): Promise<Exit.Exit<E, A>>
//   }
// }

declare module "effect/Option" {
  export interface None<out A> {
    get value(): A | undefined
    andThen<A, B>(this: Option<A>, f: (a: A) => Option<B>): Option<B>
    andThen<A, B>(this: Option<A>, f: Option<B>): Option<B>
    tap<A, _>(this: Option<A>, f: (a: A) => Option<_>): Option<A>
    getOrElse<A, B>(this: Option<A>, onNone: LazyArg<B>): A | B
    map<A, B>(this: Option<A>, f: (a: A) => B): Option<B>
  }
  export interface Some<out A> {
    andThen<A, B>(this: Option<A>, f: (a: A) => Option<B>): Option<B>
    andThen<A, B>(this: Option<A>, f: Option<B>): Option<B>
    tap<A, _>(this: Option<A>, f: (a: A) => Option<_>): Option<A>
    getOrElse<A, B>(this: Option<A>, onNone: LazyArg<B>): A | B
    map<A, B>(this: Option<A>, f: (a: A) => B): Option<B>
  }
}

declare module "effect/Either" {
  export interface Left<out E, out A> {
    andThen<E1, A, E2, B>(this: Either.Either<E1, A>, f: (a: A) => Either.Either<E2, B>): Either.Either<E1 | E2, B>
    andThen<E1, A, E2, B>(this: Either.Either<E1, A>, f: Either.Either<E2, B>): Either.Either<E1 | E2, B>
    map<E, A, B>(this: Either.Either<E, A>, f: (a: A) => B): Either.Either<E, B>
    get right(): A | undefined
  }
  export interface Right<out E, out A> {
    andThen<E1, A, E2, B>(this: Either.Either<E1, A>, f: (a: A) => Either.Either<E2, B>): Either.Either<E1 | E2, B>
    andThen<E1, A, E2, B>(this: Either.Either<E1, A>, f: Either.Either<E2, B>): Either.Either<E1 | E2, B>
    map<E, A, B>(this: Either.Either<E, A>, f: (a: A) => B): Either.Either<E, B>
    get left(): E | undefined
  }
}

declare global {
  // interface Iterable<T> {
  //   forEachEffect<A, B, E, R>(
  //     this: Iterable<A>,
  //     f: (a: A, i: number) => Effect.Effect<B, E, R>,
  //     options?: {
  //       readonly concurrency?: Concurrency | undefined
  //       readonly batching?: boolean | "inherit" | undefined
  //       readonly discard?: false | undefined
  //     }
  //   ): Effect.Effect<Array<B>, E, R>
  //   forEachEffect<A, B, E, R>(
  //     this: Iterable<A>,
  //     f: (a: A, i: number) => Effect.Effect<B, E, R>,
  //     options: {
  //       readonly concurrency?: Concurrency | undefined
  //       readonly batching?: boolean | "inherit" | undefined
  //       readonly discard: true
  //     }
  //   ): Effect.Effect<void, E, R>
  // }

  interface ReadonlyArray<T> {
    get toNonEmpty(): Option.Option<NonEmptyArray<T>>
    findFirstMap<A, B>(this: Iterable<A>, f: (a: A, i: number) => Option.Option<B>): Option.Option<B>
    findFirstMap<A, B extends A>(this: Iterable<A>, refinement: (a: A, i: number) => a is B): Option.Option<B>
    findFirstMap<A>(this: Iterable<A>, predicate: (a: A, i: number) => boolean): Option.Option<A>
    filterMap<A, B>(this: Iterable<A>, f: (a: A, i: number) => Option.Option<B>): Array<B>
    forEachEffect<A, B, E, R>(
      this: Iterable<A>,
      f: (a: A, i: number) => Effect.Effect<B, E, R>,
      options?: {
        readonly concurrency?: Concurrency | undefined
        readonly batching?: boolean | "inherit" | undefined
        readonly discard?: false | undefined
      }
    ): Effect.Effect<Array<B>, E, R>
    forEachEffect<A, B, E, R>(
      this: Iterable<A>,
      f: (a: A, i: number) => Effect.Effect<B, E, R>,
      options: {
        readonly concurrency?: Concurrency | undefined
        readonly batching?: boolean | "inherit" | undefined
        readonly discard: true
      }
    ): Effect.Effect<void, E, R>

    pipe<A, B>(this: A, ab: (a: A) => B): B
    pipe<A, B, C>(this: A, ab: (a: A) => B, bc: (b: B) => C): C
    pipe<A, B, C, D>(this: A, ab: (a: A) => B, bc: (b: B) => C, cd: (c: C) => D): D
    pipe<A, B, C, D, E>(
      this: A,
      ab: (a: A) => B,
      bc: (b: B) => C,
      cd: (c: C) => D,
      de: (d: D) => E
    ): E
    pipe<A, B, C, D, E, F>(
      this: A,
      ab: (a: A) => B,
      bc: (b: B) => C,
      cd: (c: C) => D,
      de: (d: D) => E,
      ef: (e: E) => F
    ): F
    pipe<A, B, C, D, E, F, G>(
      this: A,
      ab: (a: A) => B,
      bc: (b: B) => C,
      cd: (c: C) => D,
      de: (d: D) => E,
      ef: (e: E) => F,
      fg: (f: F) => G
    ): G
    pipe<A, B, C, D, E, F, G, H>(
      this: A,
      ab: (a: A) => B,
      bc: (b: B) => C,
      cd: (c: C) => D,
      de: (d: D) => E,
      ef: (e: E) => F,
      fg: (f: F) => G,
      gh: (g: G) => H
    ): H
    pipe<A, B, C, D, E, F, G, H, I>(
      this: A,
      ab: (a: A) => B,
      bc: (b: B) => C,
      cd: (c: C) => D,
      de: (d: D) => E,
      ef: (e: E) => F,
      fg: (f: F) => G,
      gh: (g: G) => H,
      hi: (h: H) => I
    ): I
    pipe<A, B, C, D, E, F, G, H, I, J>(
      this: A,
      ab: (a: A) => B,
      bc: (b: B) => C,
      cd: (c: C) => D,
      de: (d: D) => E,
      ef: (e: E) => F,
      fg: (f: F) => G,
      gh: (g: G) => H,
      hi: (h: H) => I,
      ij: (i: I) => J
    ): J
    pipe<A, B, C, D, E, F, G, H, I, J, K>(
      this: A,
      ab: (a: A) => B,
      bc: (b: B) => C,
      cd: (c: C) => D,
      de: (d: D) => E,
      ef: (e: E) => F,
      fg: (f: F) => G,
      gh: (g: G) => H,
      hi: (h: H) => I,
      ij: (i: I) => J,
      jk: (j: J) => K
    ): K
    pipe<A, B, C, D, E, F, G, H, I, J, K, L>(
      this: A,
      ab: (a: A) => B,
      bc: (b: B) => C,
      cd: (c: C) => D,
      de: (d: D) => E,
      ef: (e: E) => F,
      fg: (f: F) => G,
      gh: (g: G) => H,
      hi: (h: H) => I,
      ij: (i: I) => J,
      jk: (j: J) => K,
      kl: (k: K) => L
    ): L
    pipe<A, B, C, D, E, F, G, H, I, J, K, L, M>(
      this: A,
      ab: (a: A) => B,
      bc: (b: B) => C,
      cd: (c: C) => D,
      de: (d: D) => E,
      ef: (e: E) => F,
      fg: (f: F) => G,
      gh: (g: G) => H,
      hi: (h: H) => I,
      ij: (i: I) => J,
      jk: (j: J) => K,
      kl: (k: K) => L,
      lm: (l: L) => M
    ): M
    pipe<A, B, C, D, E, F, G, H, I, J, K, L, M, N>(
      this: A,
      ab: (a: A) => B,
      bc: (b: B) => C,
      cd: (c: C) => D,
      de: (d: D) => E,
      ef: (e: E) => F,
      fg: (f: F) => G,
      gh: (g: G) => H,
      hi: (h: H) => I,
      ij: (i: I) => J,
      jk: (j: J) => K,
      kl: (k: K) => L,
      lm: (l: L) => M,
      mn: (m: M) => N
    ): N
    pipe<A, B, C, D, E, F, G, H, I, J, K, L, M, N, O>(
      this: A,
      ab: (a: A) => B,
      bc: (b: B) => C,
      cd: (c: C) => D,
      de: (d: D) => E,
      ef: (e: E) => F,
      fg: (f: F) => G,
      gh: (g: G) => H,
      hi: (h: H) => I,
      ij: (i: I) => J,
      jk: (j: J) => K,
      kl: (k: K) => L,
      lm: (l: L) => M,
      mn: (m: M) => N,
      no: (n: N) => O
    ): O
    pipe<A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P>(
      this: A,
      ab: (a: A) => B,
      bc: (b: B) => C,
      cd: (c: C) => D,
      de: (d: D) => E,
      ef: (e: E) => F,
      fg: (f: F) => G,
      gh: (g: G) => H,
      hi: (h: H) => I,
      ij: (i: I) => J,
      jk: (j: J) => K,
      kl: (k: K) => L,
      lm: (l: L) => M,
      mn: (m: M) => N,
      no: (n: N) => O,
      op: (o: O) => P
    ): P
    pipe<A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q>(
      this: A,
      ab: (a: A) => B,
      bc: (b: B) => C,
      cd: (c: C) => D,
      de: (d: D) => E,
      ef: (e: E) => F,
      fg: (f: F) => G,
      gh: (g: G) => H,
      hi: (h: H) => I,
      ij: (i: I) => J,
      jk: (j: J) => K,
      kl: (k: K) => L,
      lm: (l: L) => M,
      mn: (m: M) => N,
      no: (n: N) => O,
      op: (o: O) => P,
      pq: (p: P) => Q
    ): Q
    pipe<A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q, R>(
      this: A,
      ab: (a: A) => B,
      bc: (b: B) => C,
      cd: (c: C) => D,
      de: (d: D) => E,
      ef: (e: E) => F,
      fg: (f: F) => G,
      gh: (g: G) => H,
      hi: (h: H) => I,
      ij: (i: I) => J,
      jk: (j: J) => K,
      kl: (k: K) => L,
      lm: (l: L) => M,
      mn: (m: M) => N,
      no: (n: N) => O,
      op: (o: O) => P,
      pq: (p: P) => Q,
      qr: (q: Q) => R
    ): R
    pipe<A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q, R, S>(
      this: A,
      ab: (a: A) => B,
      bc: (b: B) => C,
      cd: (c: C) => D,
      de: (d: D) => E,
      ef: (e: E) => F,
      fg: (f: F) => G,
      gh: (g: G) => H,
      hi: (h: H) => I,
      ij: (i: I) => J,
      jk: (j: J) => K,
      kl: (k: K) => L,
      lm: (l: L) => M,
      mn: (m: M) => N,
      no: (n: N) => O,
      op: (o: O) => P,
      pq: (p: P) => Q,
      qr: (q: Q) => R,
      rs: (r: R) => S
    ): S
    pipe<A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q, R, S, T>(
      this: A,
      ab: (a: A) => B,
      bc: (b: B) => C,
      cd: (c: C) => D,
      de: (d: D) => E,
      ef: (e: E) => F,
      fg: (f: F) => G,
      gh: (g: G) => H,
      hi: (h: H) => I,
      ij: (i: I) => J,
      jk: (j: J) => K,
      kl: (k: K) => L,
      lm: (l: L) => M,
      mn: (m: M) => N,
      no: (n: N) => O,
      op: (o: O) => P,
      pq: (p: P) => Q,
      qr: (q: Q) => R,
      rs: (r: R) => S,
      st: (s: S) => T
    ): T
  }
  interface Array<T> {
    get toNonEmpty(): Option.Option<NonEmptyArray<T>>
    findFirstMap<A, B>(this: Iterable<A>, f: (a: A, i: number) => Option.Option<B>): Option.Option<B>
    findFirstMap<A, B extends A>(this: Iterable<A>, refinement: (a: A, i: number) => a is B): Option.Option<B>
    findFirstMap<A>(this: Iterable<A>, predicate: (a: A, i: number) => boolean): Option.Option<A>
    filterMap<A, B>(this: Iterable<A>, f: (a: A, i: number) => Option.Option<B>): Array<B>
    forEachEffect<A, B, E, R>(
      this: Iterable<A>,
      f: (a: A, i: number) => Effect.Effect<B, E, R>,
      options?: {
        readonly concurrency?: Concurrency | undefined
        readonly batching?: boolean | "inherit" | undefined
        readonly discard?: false | undefined
      }
    ): Effect.Effect<Array<B>, E, R>
    forEachEffect<A, B, E, R>(
      this: Iterable<A>,
      f: (a: A, i: number) => Effect.Effect<B, E, R>,
      options: {
        readonly concurrency?: Concurrency | undefined
        readonly batching?: boolean | "inherit" | undefined
        readonly discard: true
      }
    ): Effect.Effect<void, E, R>

    pipe<A, B>(this: A, ab: (a: A) => B): B
    pipe<A, B, C>(this: A, ab: (a: A) => B, bc: (b: B) => C): C
    pipe<A, B, C, D>(this: A, ab: (a: A) => B, bc: (b: B) => C, cd: (c: C) => D): D
    pipe<A, B, C, D, E>(
      this: A,
      ab: (a: A) => B,
      bc: (b: B) => C,
      cd: (c: C) => D,
      de: (d: D) => E
    ): E
    pipe<A, B, C, D, E, F>(
      this: A,
      ab: (a: A) => B,
      bc: (b: B) => C,
      cd: (c: C) => D,
      de: (d: D) => E,
      ef: (e: E) => F
    ): F
    pipe<A, B, C, D, E, F, G>(
      this: A,
      ab: (a: A) => B,
      bc: (b: B) => C,
      cd: (c: C) => D,
      de: (d: D) => E,
      ef: (e: E) => F,
      fg: (f: F) => G
    ): G
    pipe<A, B, C, D, E, F, G, H>(
      this: A,
      ab: (a: A) => B,
      bc: (b: B) => C,
      cd: (c: C) => D,
      de: (d: D) => E,
      ef: (e: E) => F,
      fg: (f: F) => G,
      gh: (g: G) => H
    ): H
    pipe<A, B, C, D, E, F, G, H, I>(
      this: A,
      ab: (a: A) => B,
      bc: (b: B) => C,
      cd: (c: C) => D,
      de: (d: D) => E,
      ef: (e: E) => F,
      fg: (f: F) => G,
      gh: (g: G) => H,
      hi: (h: H) => I
    ): I
    pipe<A, B, C, D, E, F, G, H, I, J>(
      this: A,
      ab: (a: A) => B,
      bc: (b: B) => C,
      cd: (c: C) => D,
      de: (d: D) => E,
      ef: (e: E) => F,
      fg: (f: F) => G,
      gh: (g: G) => H,
      hi: (h: H) => I,
      ij: (i: I) => J
    ): J
    pipe<A, B, C, D, E, F, G, H, I, J, K>(
      this: A,
      ab: (a: A) => B,
      bc: (b: B) => C,
      cd: (c: C) => D,
      de: (d: D) => E,
      ef: (e: E) => F,
      fg: (f: F) => G,
      gh: (g: G) => H,
      hi: (h: H) => I,
      ij: (i: I) => J,
      jk: (j: J) => K
    ): K
    pipe<A, B, C, D, E, F, G, H, I, J, K, L>(
      this: A,
      ab: (a: A) => B,
      bc: (b: B) => C,
      cd: (c: C) => D,
      de: (d: D) => E,
      ef: (e: E) => F,
      fg: (f: F) => G,
      gh: (g: G) => H,
      hi: (h: H) => I,
      ij: (i: I) => J,
      jk: (j: J) => K,
      kl: (k: K) => L
    ): L
    pipe<A, B, C, D, E, F, G, H, I, J, K, L, M>(
      this: A,
      ab: (a: A) => B,
      bc: (b: B) => C,
      cd: (c: C) => D,
      de: (d: D) => E,
      ef: (e: E) => F,
      fg: (f: F) => G,
      gh: (g: G) => H,
      hi: (h: H) => I,
      ij: (i: I) => J,
      jk: (j: J) => K,
      kl: (k: K) => L,
      lm: (l: L) => M
    ): M
    pipe<A, B, C, D, E, F, G, H, I, J, K, L, M, N>(
      this: A,
      ab: (a: A) => B,
      bc: (b: B) => C,
      cd: (c: C) => D,
      de: (d: D) => E,
      ef: (e: E) => F,
      fg: (f: F) => G,
      gh: (g: G) => H,
      hi: (h: H) => I,
      ij: (i: I) => J,
      jk: (j: J) => K,
      kl: (k: K) => L,
      lm: (l: L) => M,
      mn: (m: M) => N
    ): N
    pipe<A, B, C, D, E, F, G, H, I, J, K, L, M, N, O>(
      this: A,
      ab: (a: A) => B,
      bc: (b: B) => C,
      cd: (c: C) => D,
      de: (d: D) => E,
      ef: (e: E) => F,
      fg: (f: F) => G,
      gh: (g: G) => H,
      hi: (h: H) => I,
      ij: (i: I) => J,
      jk: (j: J) => K,
      kl: (k: K) => L,
      lm: (l: L) => M,
      mn: (m: M) => N,
      no: (n: N) => O
    ): O
    pipe<A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P>(
      this: A,
      ab: (a: A) => B,
      bc: (b: B) => C,
      cd: (c: C) => D,
      de: (d: D) => E,
      ef: (e: E) => F,
      fg: (f: F) => G,
      gh: (g: G) => H,
      hi: (h: H) => I,
      ij: (i: I) => J,
      jk: (j: J) => K,
      kl: (k: K) => L,
      lm: (l: L) => M,
      mn: (m: M) => N,
      no: (n: N) => O,
      op: (o: O) => P
    ): P
    pipe<A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q>(
      this: A,
      ab: (a: A) => B,
      bc: (b: B) => C,
      cd: (c: C) => D,
      de: (d: D) => E,
      ef: (e: E) => F,
      fg: (f: F) => G,
      gh: (g: G) => H,
      hi: (h: H) => I,
      ij: (i: I) => J,
      jk: (j: J) => K,
      kl: (k: K) => L,
      lm: (l: L) => M,
      mn: (m: M) => N,
      no: (n: N) => O,
      op: (o: O) => P,
      pq: (p: P) => Q
    ): Q
    pipe<A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q, R>(
      this: A,
      ab: (a: A) => B,
      bc: (b: B) => C,
      cd: (c: C) => D,
      de: (d: D) => E,
      ef: (e: E) => F,
      fg: (f: F) => G,
      gh: (g: G) => H,
      hi: (h: H) => I,
      ij: (i: I) => J,
      jk: (j: J) => K,
      kl: (k: K) => L,
      lm: (l: L) => M,
      mn: (m: M) => N,
      no: (n: N) => O,
      op: (o: O) => P,
      pq: (p: P) => Q,
      qr: (q: Q) => R
    ): R
    pipe<A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q, R, S>(
      this: A,
      ab: (a: A) => B,
      bc: (b: B) => C,
      cd: (c: C) => D,
      de: (d: D) => E,
      ef: (e: E) => F,
      fg: (f: F) => G,
      gh: (g: G) => H,
      hi: (h: H) => I,
      ij: (i: I) => J,
      jk: (j: J) => K,
      kl: (k: K) => L,
      lm: (l: L) => M,
      mn: (m: M) => N,
      no: (n: N) => O,
      op: (o: O) => P,
      pq: (p: P) => Q,
      qr: (q: Q) => R,
      rs: (r: R) => S
    ): S
    pipe<A, B, C, D, E, F, G, H, I, J, K, L, M, N, O, P, Q, R, S, T>(
      this: A,
      ab: (a: A) => B,
      bc: (b: B) => C,
      cd: (c: C) => D,
      de: (d: D) => E,
      ef: (e: E) => F,
      fg: (f: F) => G,
      gh: (g: G) => H,
      hi: (h: H) => I,
      ij: (i: I) => J,
      jk: (j: J) => K,
      kl: (k: K) => L,
      lm: (l: L) => M,
      mn: (m: M) => N,
      no: (n: N) => O,
      op: (o: O) => P,
      pq: (p: P) => Q,
      qr: (q: Q) => R,
      rs: (r: R) => S,
      st: (s: S) => T
    ): T
  }
  interface Set<T> {
    forEachEffect<A, B, E, R>(
      this: Iterable<A>,
      f: (a: A, i: number) => Effect.Effect<B, E, R>,
      options?: {
        readonly concurrency?: Concurrency | undefined
        readonly batching?: boolean | "inherit" | undefined
        readonly discard?: false | undefined
      }
    ): Effect.Effect<Array<B>, E, R>
    forEachEffect<A, B, E, R>(
      this: Iterable<A>,
      f: (a: A, i: number) => Effect.Effect<B, E, R>,
      options: {
        readonly concurrency?: Concurrency | undefined
        readonly batching?: boolean | "inherit" | undefined
        readonly discard: true
      }
    ): Effect.Effect<void, E, R>
  }
  interface ReadonlySet<T> {
    forEachEffect<A, B, E, R>(
      this: Iterable<A>,
      f: (a: A, i: number) => Effect.Effect<B, E, R>,
      options?: {
        readonly concurrency?: Concurrency | undefined
        readonly batching?: boolean | "inherit" | undefined
        readonly discard?: false | undefined
      }
    ): Effect.Effect<Array<B>, E, R>
    forEachEffect<A, B, E, R>(
      this: Iterable<A>,
      f: (a: A, i: number) => Effect.Effect<B, E, R>,
      options: {
        readonly concurrency?: Concurrency | undefined
        readonly batching?: boolean | "inherit" | undefined
        readonly discard: true
      }
    ): Effect.Effect<void, E, R>
  }
  interface Map<K, V> {
    forEachEffect<A, B, E, R>(
      this: Iterable<A>,
      f: (a: A, i: number) => Effect.Effect<B, E, R>,
      options?: {
        readonly concurrency?: Concurrency | undefined
        readonly batching?: boolean | "inherit" | undefined
        readonly discard?: false | undefined
      }
    ): Effect.Effect<Array<B>, E, R>
    forEachEffect<A, B, E, R>(
      this: Iterable<A>,
      f: (a: A, i: number) => Effect.Effect<B, E, R>,
      options: {
        readonly concurrency?: Concurrency | undefined
        readonly batching?: boolean | "inherit" | undefined
        readonly discard: true
      }
    ): Effect.Effect<void, E, R>
  }
  interface ReadonlyMap<K, V> {
    forEachEffect<A, B, E, R>(
      this: Iterable<A>,
      f: (a: A, i: number) => Effect.Effect<B, E, R>,
      options?: {
        readonly concurrency?: Concurrency | undefined
        readonly batching?: boolean | "inherit" | undefined
        readonly discard?: false | undefined
      }
    ): Effect.Effect<Array<B>, E, R>
    forEachEffect<A, B, E, R>(
      this: Iterable<A>,
      f: (a: A, i: number) => Effect.Effect<B, E, R>,
      options: {
        readonly concurrency?: Concurrency | undefined
        readonly batching?: boolean | "inherit" | undefined
        readonly discard: true
      }
    ): Effect.Effect<void, E, R>
  }
}

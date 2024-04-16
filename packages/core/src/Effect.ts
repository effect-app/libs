/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable prefer-destructuring */
// eslint-disable-next-line @typescript-eslint/no-unused-vars

import { Effect, Option, Ref } from "effect"
import * as Def from "effect/Deferred"
import type { Semaphore } from "effect/Effect"
import * as Fiber from "effect/Fiber"
import * as FiberRef from "effect/FiberRef"
import { curry } from "./Function.js"
import { type Context, HashMap } from "./index.js"
import { typedKeysOf } from "./utils.js"

export * from "effect/Effect"

/**
 * @macro traced
 * @tsplus fluent effect/io/Effect flatMapOpt
 */
export function flatMapOption<R, E, A, R2, E2, A2>(
  self: Effect.Effect<Option.Option<A>, E, R>,
  fm: (a: A) => Effect.Effect<A2, E2, R2>
): Effect.Effect<Option.Option<A2>, E | E2, R | R2> {
  return Effect.flatMap(self, (d) =>
    Option.match(d, {
      onNone: () => Effect.sync(() => Option.none()),
      onSome: (_) => Effect.map(fm(_), Option.some)
    }))
}

/**
 * @macro traced
 * @tsplus fluent effect/io/Effect tapOpt
 */
export function tapOption<R, E, A, R2, E2, A2>(
  self: Effect.Effect<Option.Option<A>, E, R>,
  fm: (a: A) => Effect.Effect<A2, E2, R2>
): Effect.Effect<Option.Option<A>, E | E2, R | R2> {
  return Effect.flatMap(self, (d) =>
    Option.match(d, {
      onNone: () => Effect.sync(() => Option.none()),
      onSome: (_) => Effect.map(fm(_), () => Option.some(_))
    }))
}

/**
 * @macro traced
 * @tsplus fluent effect/io/Effect zipRightOpt
 */
export function zipRightOption<R, E, A, R2, E2, A2>(
  self: Effect.Effect<Option.Option<A>, E, R>,
  fm: Effect.Effect<A2, E2, R2>
) {
  return Effect.flatMap(self, (d) =>
    Option.match(d, {
      onNone: () => Effect.sync(() => Option.none()),
      onSome: (_) => Effect.map(fm, () => Option.some(_))
    }))
}

/**
 * @macro traced
 * @tsplus fluent effect/io/Effect mapOpt
 */
export function mapOption<R, E, A, A2>(
  self: Effect.Effect<Option.Option<A>, E, R>,
  fm: (a: A) => A2
): Effect.Effect<Option.Option<A2>, E, R> {
  return Effect.map(self, (d) =>
    Option.match(d, {
      onNone: () => Option.none(),
      onSome: (_) => Option.some(fm(_))
    }))
}

/**
 * Takes [A, B], applies it to a curried Effect function,
 * taps the Effect, returning A.
 */
export function tupleTap<A, B, R, E, C>(
  f: (b: B) => (a: A) => Effect.Effect<C, E, R>
) {
  return (t: readonly [A, B]) => Effect.sync(() => t[0]).pipe(Effect.tap(f(t[1])))
}

/**
 * Takes [A, B], applies it to an Effect function,
 * taps the Effect, returning A.
 */
export function tupleTap_<A, B, R, E, C>(f: (a: A, b: B) => Effect.Effect<C, E, R>) {
  return tupleTap(curry(f))
}

export function ifDiffR<I, R, E, A>(f: (i: I) => Effect.Effect<A, E, R>) {
  return (n: I, orig: I) => ifDiff_(n, orig, f)
}

export function ifDiff_<I, R, E, A>(
  n: I,
  orig: I,
  f: (i: I) => Effect.Effect<A, E, R>
) {
  return n !== orig ? f(n) : Effect.void
}

export function ifDiff<I, R, E, A>(n: I, orig: I) {
  return (f: (i: I) => Effect.Effect<A, E, R>) => ifDiff_(n, orig, f)
}

// NOTE: await extension doesnt work via tsplus somehow
/**
 * @tsplus static effect/io/Deferred.Ops await
 * @tsplus getter effect/io/Deferred await
 */
export const await_ = Def.await

/**
 * Ref has atomic modify support if synchronous, for Effect we need a Semaphore.
 * @tsplus fluent effect/io/Ref modifyWithEffect
 */
export function modifyWithPermitWithEffect<A>(ref: Ref.Ref<A>, semaphore: Semaphore) {
  const withPermit = semaphore.withPermits(1)
  return <R, E, A2>(mod: (a: A) => Effect.Effect<readonly [A2, A], E, R>) =>
    withPermit(
      Effect
        .flatMap(Ref.get(ref), mod)
        .pipe(
          Effect.tap(([, _]) => Ref.set(ref, _)),
          Effect.map(([_]) => _)
        )
    )
}

/**
 * @tsplus getter Iterable joinAll
 * @tsplus static effect/io/Effect.Ops joinAll
 */
export function joinAll<E, A>(fibers: Iterable<Fiber.Fiber<A, E>>): Effect.Effect<readonly A[], E> {
  return Fiber.join(Fiber.all(fibers))
}

export type Service<T> = T extends Effect.Effect<infer S, any, any> ? S
  : T extends Context.Tag<any, infer S> ? S
  : never
export type ServiceR<T> = T extends Effect.Effect<any, any, infer R> ? R
  : T extends Context.Tag<infer R, any> ? R
  : never
export type ServiceE<T> = T extends Effect.Effect<any, infer E, any> ? E : never
export type Values<T> = T extends { [s: string]: infer S } ? Service<S> : never
export type ValuesR<T> = T extends { [s: string]: infer S } ? ServiceR<S> : never
export type ValuesE<T> = T extends { [s: string]: infer S } ? ServiceE<S> : never

/**
 * Due to tsplus unification (tsplus unify tag), when trying to use the Effect type in a type constraint
 * the compiler will cause basically anything to match. as such, use this type instead.
 * ```ts
 * const a = <
 *  SVC extends Record<
 *    string,
 *    ((req: number) => Effect.Effect<any, any, any>) | Effect.Effect<any, any, any>
 *   >
 * >(svc: SVC) => svc
 *
 * const b = a({ str: "" })   // valid, but shouldn't be!
 * ```
 */
export interface EffectUnunified<R, E, A> extends Effect.Effect<R, E, A> {}

export type LowerFirst<S extends PropertyKey> = S extends `${infer First}${infer Rest}` ? `${Lowercase<First>}${Rest}`
  : S
export type LowerServices<T extends Record<string, Context.Tag<any, any> | Effect.Effect<any, any, any>>> = {
  [key in keyof T as LowerFirst<key>]: Service<T[key]>
}

/**
 * @tsplus static effect/io/Effect.Ops allLower
 */
export function allLower<T extends Record<string, Context.Tag<any, any> | Effect.Effect<any, any, any>>>(
  services: T
) {
  return Effect.all(
    typedKeysOf(services).reduce((prev, cur) => {
      const svc = services[cur]
      prev[((cur as string)[0].toLowerCase() + (cur as string).slice(1)) as unknown as LowerFirst<typeof cur>] = svc // "_id" in svc && svc._id === TagTypeId ? svc : svc
      return prev
    }, {} as any),
    { concurrency: "inherit" }
  ) as any as Effect.Effect<LowerServices<T>, ValuesE<T>, ValuesR<T>>
}

/**
 * @tsplus static effect/io/Effect.Ops allLowerWith
 */
export function allLowerWith<T extends Record<string, Context.Tag<any, any> | Effect.Effect<any, any, any>>, A>(
  services: T,
  fn: (services: LowerServices<T>) => A
) {
  return Effect.map(allLower(services), fn)
}

/**
 * @tsplus static effect/io/Effect.Ops allLowerWithEffect
 */
export function allLowerWithEffect<
  T extends Record<string, Context.Tag<any, any> | Effect.Effect<any, any, any>>,
  R,
  E,
  A
>(
  services: T,
  fn: (services: LowerServices<T>) => Effect.Effect<A, E, R>
) {
  return Effect.flatMap(allLower(services), fn)
}

/**
 * Recovers from all errors.
 *
 * @tsplus static effect/io/Effect.Ops catchAllMap
 * @tsplus pipeable effect/io/Effect catchAllMap
 */
export function catchAllMap<E, A2>(f: (e: E) => A2) {
  return <R, A>(self: Effect.Effect<A, E, R>): Effect.Effect<A2 | A, never, R> =>
    Effect.catchAll(self, (err) => Effect.sync(() => f(err)))
}

/**
 * Annotates each log in this scope with the specified log annotation.
 *
 * @tsplus static effect/io/Effect.Ops annotateLogscoped
 */
export function annotateLogscoped(key: string, value: string) {
  return FiberRef
    .get(
      FiberRef
        .currentLogAnnotations
    )
    .pipe(Effect
      .flatMap((annotations) =>
        Effect.suspend(() =>
          FiberRef.currentLogAnnotations.pipe(Effect.locallyScoped(HashMap.set(annotations, key, value)))
        )
      ))
}

/**
 * Annotates each log in this scope with the specified log annotations.
 *
 * @tsplus static effect/io/Effect.Ops annotateLogsScoped
 */
export function annotateLogsScoped(kvps: Record<string, string>) {
  return FiberRef
    .get(
      FiberRef
        .currentLogAnnotations
    )
    .pipe(Effect
      .flatMap((annotations) =>
        Effect.suspend(() =>
          FiberRef.currentLogAnnotations.pipe(
            Effect.locallyScoped(HashMap.fromIterable([...annotations, ...Object.entries(kvps)]))
          )
        )
      ))
}

/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable prefer-destructuring */
// eslint-disable-next-line @typescript-eslint/no-unused-vars

import { type Context, Effect, HashMap, Option, Ref } from "effect"
import * as Def from "effect/Deferred"
import type { Semaphore } from "effect/Effect"
import * as Fiber from "effect/Fiber"
import * as FiberRef from "effect/FiberRef"
import { curry } from "./Function.js"
import { typedKeysOf } from "./utils.js"

export { ServiceStrict as Service } from "effect/Effect"

export * from "effect/Effect"

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
export const await_ = Def.await

/**
 * Ref has atomic modify support if synchronous, for Effect we need a Semaphore.
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

export function joinAll<E, A>(fibers: Iterable<Fiber.Fiber<A, E>>): Effect.Effect<readonly A[], E> {
  return Fiber.join(Fiber.all(fibers))
}

type ServiceA<T> = T extends Effect.Effect<infer S, any, any> ? S
  : T extends Context.Tag<any, infer S> ? S
  : never
type ServiceR<T> = T extends Effect.Effect<any, any, infer R> ? R
  : T extends Context.Tag<infer R, any> ? R
  : never
type ServiceE<T> = T extends Effect.Effect<any, infer E, any> ? E : never
// type Values<T> = T extends { [s: string]: infer S } ? ServiceA<S> : never
type ValuesR<T> = T extends { [s: string]: infer S } ? ServiceR<S> : never
type ValuesE<T> = T extends { [s: string]: infer S } ? ServiceE<S> : never

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
  [key in keyof T as LowerFirst<key>]: ServiceA<T[key]>
}

export function allLower<T extends Record<string, Context.Tag<any, any> | Effect.Effect<any, any, any>>>(
  services: T
) {
  return Effect.all(
    typedKeysOf(services).reduce((prev, cur) => {
      const svc = services[cur]
      prev[((cur as string)[0]!.toLowerCase() + (cur as string).slice(1)) as unknown as LowerFirst<typeof cur>] = svc // "_id" in svc && svc._id === TagTypeId ? svc : svc
      return prev
    }, {} as any),
    { concurrency: "inherit" }
  ) as any as Effect.Effect<LowerServices<T>, ValuesE<T>, ValuesR<T>>
}

export function allLowerWith<T extends Record<string, Context.Tag<any, any> | Effect.Effect<any, any, any>>, A>(
  services: T,
  fn: (services: LowerServices<T>) => A
) {
  return Effect.map(allLower(services), fn)
}

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
 */
export function catchAllMap<E, A2>(f: (e: E) => A2) {
  return <R, A>(self: Effect.Effect<A, E, R>): Effect.Effect<A2 | A, never, R> =>
    Effect.catchAll(self, (err) => Effect.sync(() => f(err)))
}

/**
 * Annotates each log in this scope with the specified log annotation.
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

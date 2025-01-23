import { Chunk, Effect } from "effect"
import type { NonEmptyArray, NonEmptyReadonlyArray } from "effect/Array"
import * as Array from "effect/Array"
import * as T from "effect/Effect"
import type { Predicate } from "./Function.js"
import { dual } from "./Function.js"
import * as Option from "./Option.js"

export const toNonEmptyArray = Option.liftPredicate(Array.isNonEmptyReadonlyArray)

export const isArray: {
  // uses ReadonlyArray here because otherwise the second overload don't work when ROA is involved.
  (self: unknown): self is ReadonlyArray<unknown>
  <T>(self: T): self is Extract<T, ReadonlyArray<any>>
} = Array.isArray

export function NEAFromArray<T>(ar: Array<T>) {
  return ar.length ? Option.some(ar as NonEmptyArray<T>) : Option.none()
}

export function NEROArrayFromArray<T>(ar: ReadonlyArray<T>) {
  return ar.length ? Option.some(ar as NonEmptyReadonlyArray<T>) : Option.none()
}

export const groupByT = dual<
  <A, Key>(
    f: (a: NoInfer<A>) => Key
  ) => (as: ReadonlyArray<A>) => Array<readonly [Key, NonEmptyArray<A>]>,
  <A, Key>(
    as: ReadonlyArray<A>,
    f: (a: A) => Key
  ) => Array<readonly [Key, NonEmptyArray<A>]>
>(2, <A, Key>(
  as: ReadonlyArray<A>,
  f: (a: A) => Key
): Array<readonly [Key, NonEmptyArray<A>]> => {
  const r = new Map<Key, NonEmptyArray<A>>()
  for (const a of as) {
    const k = f(a)
    if (r.has(k)) {
      r.get(k)!.push(a)
    } else {
      r.set(k, [a])
    }
  }
  return [...r.entries()]
})

export function randomElement<A>(a: NonEmptyReadonlyArray<A>): A
export function randomElement<A>(a: ReadonlyArray<A>): A | undefined
export function randomElement<A>(a: ReadonlyArray<A>): A | undefined {
  return a[Math.floor(Math.random() * a.length)]
}

export function filterWith<A>(self: ReadonlyArray<A>, predicates: ReadonlyArray<Predicate<A>>) {
  return self.filter((_) => predicates.every((f) => f(_)))
}

/**
 * Split the `items` array into multiple, smaller chunks of the given `size`.
 */
export function* _chunk_<T>(items_: Iterable<T>, size: number) {
  const items = [...items_]

  while (items.length) {
    yield items.splice(0, size)
  }
}

/**
 * Split the `items` array into multiple, smaller chunks of the given `size`.
 */
export function chunk_<T>(items_: Iterable<T>, size: number) {
  return Chunk.fromIterable(_chunk_(items_, size))
}

export function forEachEffectNA<A, R, E, B>(as: NonEmptyReadonlyArray<A>, f: (a: A) => Effect.Effect<B, E, R>) {
  return Effect.map(T.forEach(as, f), (_) => Option.getOrNull(toNonEmptyArray(_)))
}

export * from "effect/Array"

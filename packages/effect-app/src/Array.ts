import type { NonEmptyArray, NonEmptyReadonlyArray } from "effect/Array"
import * as Array from "effect/Array"
import * as Effect from "effect/Effect"
import { dual, type Predicate } from "./Function.ts"
import * as Option from "./Option.ts"

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

export const groupByTNonEmpty = dual<
  <A, Key>(
    f: (a: NoInfer<A>) => Key
  ) => (as: NonEmptyReadonlyArray<A>) => NonEmptyArray<readonly [Key, NonEmptyArray<A>]>,
  <A, Key>(
    as: NonEmptyReadonlyArray<A>,
    f: (a: A) => Key
  ) => NonEmptyArray<readonly [Key, NonEmptyArray<A>]>
>(2, <A, Key>(
  as: NonEmptyReadonlyArray<A>,
  f: (a: A) => Key
): NonEmptyArray<readonly [Key, NonEmptyArray<A>]> => {
  const r = new Map<Key, NonEmptyArray<A>>()
  for (const a of as) {
    const k = f(a)
    if (r.has(k)) {
      r.get(k)!.push(a)
    } else {
      r.set(k, [a])
    }
  }
  return [...r.entries()] as unknown as NonEmptyArray<readonly [Key, NonEmptyArray<A>]>
})

// const a = [1, 2, 3] as const
// const b = [1, 2, 3]

// const a1 = groupByTNonEmpty(a, (x) => x % 2) // $ExpectType NonEmptyReadonlyArray<readonly [number, NonEmptyArray<number>]>
// const b1 = groupByT(b, (x) => x % 2) // $ExpectType Array<readonly [number, NonEmptyArray<number>]>

export function randomElement<A>(a: NonEmptyReadonlyArray<A>): A
export function randomElement<A>(a: ReadonlyArray<A>): A | undefined
export function randomElement<A>(a: ReadonlyArray<A>): A | undefined {
  return a[Math.floor(Math.random() * a.length)]
}

export function filterWith<A>(self: ReadonlyArray<A>, predicates: ReadonlyArray<Predicate<A>>) {
  return self.filter((_) => predicates.every((f) => f(_)))
}

export function forEachEffectNA<A, R, E, B>(as: NonEmptyReadonlyArray<A>, f: (a: A) => Effect.Effect<B, E, R>) {
  return Effect.map(
    Effect.forEach(as, f),
    (_) => Option.getOrNull(Option.liftPredicate(Array.isReadonlyArrayNonEmpty)(_))
  )
}

export * from "effect/Array"

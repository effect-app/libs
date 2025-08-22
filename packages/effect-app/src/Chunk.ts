import { pipe, type Predicate, type Refinement } from "./Function.js"
import * as Option from "./Option.js"

import * as Chunk from "effect/Chunk"
import { type Equivalence } from "effect/Equivalence"
import * as Array from "./Array.js"

export * from "effect/Chunk"

export const fromIterable = Chunk.fromIterable

export function groupByTChunk_<A, Key extends PropertyKey>(c: Chunk.Chunk<A>, f: (a: A) => Key) {
  return pipe(Chunk.toReadonlyArray(c), Array.groupByT(f), Chunk.fromIterable)
}

/**
 * Returns the first element that satisfies the predicate.
 */
export function findFirstMap<A, B>(
  f: (a: A) => Option.Option<B>
) {
  return (as: Chunk.Chunk<A>) => {
    const ass = Chunk.toReadonlyArray(as)
    const len = ass.length
    for (let i = 0; i < len; i++) {
      const v = f(ass[i]!)
      if (Option.isSome(v)) {
        return v
      }
    }
    return Option.none()
  }
}

export function toArray<T>(c: Chunk.Chunk<T>): T[] {
  return Chunk.toReadonlyArray(c) as T[]
}

/**
 * Remove duplicates from an array, keeping the first occurrence of an element.
 */
export function uniq<A>(E: Equivalence<A>) {
  return (self: Chunk.Chunk<A>): Chunk.Chunk<A> => {
    let out = Chunk.fromIterable([] as A[])
    for (let i = 0; i < self.length; i++) {
      const a = Chunk.unsafeGet(self, i)
      if (!elem(E, a)(out)) {
        out = Chunk.append(out, a)
      }
    }
    return self.length === out.length ? self : out
  }
}

/**
 * Test if a value is a member of an array. Takes a `Equivalence<A>` as a single
 * argument which returns the function to use to search for a value of type `A`
 * in an array of type `Chunk<A>`.
 */
export function elem<A>(E: Equivalence<A>, value: A) {
  return (self: Chunk.Chunk<A>): boolean => {
    for (let i = 0; i < self.length; i++) {
      if (E(Chunk.unsafeGet(self, i), value)) {
        return true
      }
    }
    return false
  }
}

export const ChunkPartition = Chunk.partition

export const findFirstSimple: {
  <A, B extends A>(self: Chunk.Chunk<A>, refinement: Refinement<A, B>): Option.Option<B>
  <A>(self: Chunk.Chunk<A>, predicate: Predicate<A>): Option.Option<A>
} = Chunk.findFirst

export const findLastSimple: {
  <A, B extends A>(self: Chunk.Chunk<A>, refinement: Refinement<A, B>): Option.Option<B>
  <A>(self: Chunk.Chunk<A>, predicate: Predicate<A>): Option.Option<A>
} = Chunk.findLast

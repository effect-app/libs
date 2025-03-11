import { Chunk, type Equivalence } from "effect"

export function toArray<A>(
  gen: Generator<A, void, unknown>
) {
  return Array.from(gen)
}

/**
 * Remove duplicates from an array, keeping the first occurrence of an element.
 */
export function uniq<A>(E: Equivalence.Equivalence<A>) {
  return (self: Chunk.Chunk<A>): Chunk.Chunk<A> => {
    let out = Chunk.fromIterable<A>([])
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
 * Test if a value is a member of an array. Takes a `Equivalence.Equivalence<A>` as a single
 * argument which returns the function to use to search for a value of type `A`
 * in an array of type `Chunk.Chunk<A>`.
 */
export function elem<A>(E: Equivalence.Equivalence<A>, value: A) {
  return (self: Chunk.Chunk<A>): boolean => {
    for (let i = 0; i < self.length; i++) {
      if (E(Chunk.unsafeGet(self, i), value)) {
        return true
      }
    }
    return false
  }
}

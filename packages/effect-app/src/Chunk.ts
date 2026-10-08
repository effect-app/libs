import { pipe } from "./Function.ts"
import * as Option from "./Option.ts"

import * as Chunk from "effect/Chunk"
import * as Array from "./Array.ts"

export * from "effect/Chunk"

export function groupByTChunk_<A, Key extends PropertyKey>(c: Chunk.Chunk<A>, f: (a: A) => Key) {
  return pipe(Chunk.toReadonlyArray(c), Array.groupByT(f), Chunk.fromIterable)
}

/**
 * Returns the first `Some` produced by `f`.
 *
 * Effect's `Chunk.findFirst` takes a predicate, not an `Option`-returning function.
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

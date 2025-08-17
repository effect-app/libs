import { type Equivalence, Option, type Order } from "effect"
import type { NonEmptyReadonlyArray } from "effect/Array"
import { flow, pipe } from "./Function.js"
import { filter_, filterMap, filterMap_, fromArray as fromArrayOriginal, insert as insertOriginal, insert_ as insert_Original, map, map_, reduce, reduce_, remove, remove_, type Set, toArray as toArrayOriginal } from "./Set.js"

export interface NonEmptyBrand {
  readonly NonEmpty: unique symbol
}

export type NonEmptySet<A> = Set<A> & NonEmptyBrand

function make_<A>(ord: Order.Order<A>, eq_?: Equivalence.Equivalence<A>) {
  const eq = eq_
    ?? ((x, y) => ord(x, y) === 0)

  const fromArray_ = fromArrayOriginal(eq)
  const fromArray = flow(fromArray_, fromSet)
  const fromNonEmptyArray = (arr: NonEmptyReadonlyArray<A>) => fromArray_(arr) as NonEmptySet<A>
  const concat_ = (set: NonEmptySet<A>, it: Iterable<A>) => fromArray([...set, ...it])
  const insert__ = insertOriginal(eq)
  const insert: (a: A) => (set: NonEmptySet<A>) => NonEmptySet<A> = insert__ as any
  const insert_: (set: NonEmptySet<A>, a: A) => NonEmptySet<A> = insert_Original as any

  function replace_(set: NonEmptySet<A>, a: A) {
    return (pipe(filter_(set, (x) => !eq(x, a)), insert__(a)) as NonEmptySet<A>)
  }

  const toArray__ = toArrayOriginal(ord)

  function toArray(s: NonEmptySet<A>) {
    return toArray__(s) as NonEmptyReadonlyArray<A>
  }

  const remove__ = remove(eq)
  const filterMap__ = filterMap(eq)

  return {
    insert,
    insert_,
    remove: (a: A) => flow(remove__(a), fromSet),
    remove_: flow(remove_(eq), fromSet),
    reduce: reduce(ord),
    reduce_: reduce_(ord),
    replace: (a: A) => (set: NonEmptySet<A>) => replace_(set, a),
    replace_,
    toArray,
    fromArray,
    fromNonEmptyArray,
    from: (it: Iterable<A>) => fromArray([...it]),
    of: (a: A) => new Set<A>([a]) as unknown as NonEmptySet<A>,
    concat_,
    concat: (it: Iterable<A>) => (set: NonEmptySet<A>) => concat_(set, it),

    // A and B the same, useful when editing elements.
    map: map(eq) as unknown as <A>(
      f: (x: A) => A
    ) => (set: NonEmptySet<A>) => NonEmptySet<A>,
    map_: map_(eq) as unknown as <A>(
      set: NonEmptySet<A>,
      f: (x: A) => A
    ) => NonEmptySet<A>,
    filterMap: (f: (a: A) => Option.Option<A>) => flow(filterMap__<A>((a) => f(a)), fromSet),
    filterMap_: flow(filterMap_(eq), fromSet)
  }
  // TODO: extend
}

class Wrapper<A> {
  wrapped(ord: Order.Order<A>, eq?: Equivalence.Equivalence<A>) {
    return make_(ord, eq)
  }
}

export interface NonEmptySetSchemaExtensions<A> extends ReturnType<Wrapper<A>["wrapped"]> {}

export const make: <A>(
  ord: Order.Order<A>,
  eq?: Equivalence.Equivalence<A>
) => NonEmptySetSchemaExtensions<A> = make_

export function fromSet<A>(set: Set<A>) {
  if (set.size > 0) {
    return Option.some(set as NonEmptySet<A>)
  } else {
    return Option.none()
  }
}

// TODO
export * from "./Set.js"

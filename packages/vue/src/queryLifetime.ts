import type * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import * as Atom from "effect/unstable/reactivity/Atom"

/**
 * Per-query observer count + invalidation flag. Lives on the family atom so
 * invalidate can mark stale and refetch only when someone is looking
 * (TanStack refetchType: "active").
 */
export interface QueryLifetime {
  observers: number
  invalidated: boolean
}

const lifetimes = new WeakMap<Atom.Atom<any>, QueryLifetime>()

const rootOf = (atom: Atom.Atom<any>): Atom.Atom<any> => {
  let target = atom
  while (target.initialValueTarget !== undefined) {
    target = target.initialValueTarget
  }
  return target
}

export const queryLifetimeOf = (atom: Atom.Atom<any>): QueryLifetime | undefined =>
  lifetimes.get(rootOf(atom)) ?? lifetimes.get(atom)

export const attachQueryLifetime = <A, E>(
  atom: Atom.Atom<AsyncResult.AsyncResult<A, E>>
): QueryLifetime => {
  const existing = queryLifetimeOf(atom)
  if (existing !== undefined) return existing
  const created: QueryLifetime = { observers: 0, invalidated: false }
  lifetimes.set(rootOf(atom), created)
  lifetimes.set(atom, created)
  return created
}

/**
 * Count this subscription as an observer of `family`. On remount, consume a
 * pending invalidation and refresh the family atom.
 */
export const observeQueryAtom = <A, E>(
  family: Atom.Atom<AsyncResult.AsyncResult<A, E>>
): Atom.Atom<AsyncResult.AsyncResult<A, E>> => {
  const life = attachQueryLifetime(family)
  return Atom.transform(family, (get) => {
    life.observers++
    get.addFinalizer(() => {
      life.observers = Math.max(0, life.observers - 1)
    })
    if (life.invalidated) {
      life.invalidated = false
      get.refresh(family)
    }
    return get(family)
  }, { initialValueTarget: family })
}

/**
 * Idle queries with a lifetime are marked stale. Queries that still have
 * observers (or have no lifetime, e.g. ad-hoc registry mounts of a raw
 * effect atom) are refetched now.
 */
export const atomsToRefetch = <A, E>(
  atoms: ReadonlyArray<Atom.Atom<AsyncResult.AsyncResult<A, E>>>
): ReadonlyArray<Atom.Atom<AsyncResult.AsyncResult<A, E>>> => {
  const active: Array<Atom.Atom<AsyncResult.AsyncResult<A, E>>> = []
  for (const atom of atoms) {
    const life = queryLifetimeOf(atom)
    if (life === undefined || life.observers > 0) active.push(atom)
    else life.invalidated = true
  }
  return active
}

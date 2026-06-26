import { DataDependencies } from "effect-app/client"
import * as Hash from "effect/Hash"

// Maps a live query's reactivity key (its full `[...queryKey, input]` key) to the
// data dependencies it read while fetching. Populated when the query handler resolves and
// cleared when the query atom is GC'd, so the set mirrors the live query atoms (mounted or
// cached-within-ttl) — the atom equivalent of the former tanstack query cache.
type Entry = { readonly key: ReadonlyArray<unknown>; readonly reads: DataDependencies.DataDependencies }
const readDependencies = new Map<number, Entry>()

export const setQueryReadDependencies = (
  key: ReadonlyArray<unknown>,
  reads: DataDependencies.DataDependencies
) => {
  const h = Hash.hash(key)
  if (!DataDependencies.isNonEmpty(reads)) readDependencies.delete(h)
  else readDependencies.set(h, { key, reads })
}

export const clearQueryReadDependencies = (key: ReadonlyArray<unknown>) => {
  readDependencies.delete(Hash.hash(key))
}

/**
 * Reactivity keys of every live query whose recorded read-dependencies intersect this
 * mutation's `writeDependencies`. Returned keys are passed to `invalidateAndAwait`, refreshing
 * exactly those queries.
 */
export const getDerivedInvalidationKeys = (
  writeDependencies: DataDependencies.DataDependencies
): ReadonlyArray<ReadonlyArray<unknown>> => {
  if (!DataDependencies.isNonEmpty(writeDependencies)) return []
  const keys: Array<ReadonlyArray<unknown>> = []
  for (const { key, reads } of readDependencies.values()) {
    if (DataDependencies.intersects(reads, writeDependencies)) keys.push(key)
  }
  return keys
}

import { DataDependencies } from "effect-app/client"
import * as MutableHashMap from "effect/MutableHashMap"
import * as Option from "effect/Option"

// Maps a live query's reactivity key (its full `[...queryKey, input]` key) to the
// data dependencies it read while fetching. Populated when the query handler resolves and
// cleared when the query atom is GC'd, so the set mirrors the live query atoms (mounted or
// cached-within-ttl) — the atom equivalent of the former tanstack query cache.
type Entry = { readonly key: ReadonlyArray<unknown>; readonly reads: DataDependencies.DataDependencies }
const readDependencies = MutableHashMap.empty<ReadonlyArray<unknown>, Entry>()
export type QueryInvalidationMode = "await" | "soft"
type InvalidationModeEntry = { awaitSubscribers: number; softSubscribers: number }
const invalidationModes = MutableHashMap.empty<ReadonlyArray<unknown>, InvalidationModeEntry>()

export const registerQueryInvalidationMode = (
  key: ReadonlyArray<unknown>,
  mode: QueryInvalidationMode
): () => void => {
  const entry = Option.getOrUndefined(MutableHashMap.get(invalidationModes, key))
    ?? { awaitSubscribers: 0, softSubscribers: 0 }
  if (mode === "soft") entry.softSubscribers++
  else entry.awaitSubscribers++
  MutableHashMap.set(invalidationModes, key, entry)
  let active = true
  return () => {
    if (!active) return
    active = false
    if (mode === "soft") entry.softSubscribers--
    else entry.awaitSubscribers--
    if (
      entry.awaitSubscribers === 0
      && entry.softSubscribers === 0
      && Option.getOrUndefined(MutableHashMap.get(invalidationModes, key)) === entry
    ) MutableHashMap.remove(invalidationModes, key)
  }
}

export const getQueryInvalidationMode = (key: ReadonlyArray<unknown>): QueryInvalidationMode => {
  const entry = Option.getOrUndefined(MutableHashMap.get(invalidationModes, key))
  return entry !== undefined && entry.awaitSubscribers === 0 && entry.softSubscribers > 0 ? "soft" : "await"
}

export const setQueryReadDependencies = (
  key: ReadonlyArray<unknown>,
  reads: DataDependencies.DataDependencies
) => {
  if (!DataDependencies.isNonEmpty(reads)) MutableHashMap.remove(readDependencies, key)
  else MutableHashMap.set(readDependencies, key, { key, reads })
}

export const clearQueryReadDependencies = (key: ReadonlyArray<unknown>) => {
  MutableHashMap.remove(readDependencies, key)
}

export const getQueryReadDependencies = (
  key: ReadonlyArray<unknown>
): DataDependencies.DataDependencies =>
  Option.getOrUndefined(MutableHashMap.get(readDependencies, key))?.reads ?? DataDependencies.empty()

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
  for (const { key, reads } of MutableHashMap.values(readDependencies)) {
    if (DataDependencies.intersects(reads, writeDependencies)) keys.push(key)
  }
  return keys
}

export const partitionInvalidationKeys = (
  keys: ReadonlyArray<ReadonlyArray<unknown>>
): {
  readonly awaitKeys: ReadonlyArray<ReadonlyArray<unknown>>
  readonly softKeys: ReadonlyArray<ReadonlyArray<unknown>>
} => {
  const awaitKeys: Array<ReadonlyArray<unknown>> = []
  const softKeys: Array<ReadonlyArray<unknown>> = []
  for (const key of keys) {
    if (getQueryInvalidationMode(key) === "soft") softKeys.push(key)
    else awaitKeys.push(key)
  }
  return { awaitKeys, softKeys }
}

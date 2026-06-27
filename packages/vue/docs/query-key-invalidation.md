# Query-key invalidation semantics

How the Atom query engine reproduces TanStack Query's **hierarchical (namespace) invalidation**, and where it intentionally differs.

## The behavior we must match

TanStack `queryClient.invalidateQueries({ queryKey: K })` defaults to `exact: false`:
**K matches every query whose key has K as a prefix.**

```
invalidate ["A","B"]  ->  matches ["A","B"], ["A","B","C"], ["A","B",input], ...
invalidate ["A","B","C"]  ->  does NOT match ["A","B"]   (K longer than the key)
```

Two requirements: don't invalidate **more** than TanStack would, and don't invalidate **less**.

## How the Atom engine does it

TanStack stores each full key and runs a prefix compare at invalidation time. The Atom
engine inverts that: each query **pre-registers all prefixes of its full key**, and
invalidation does an exact structural-hash lookup.

- Full key: `fullKey = [...baseKey, input]` where `baseKey = makeQueryKey(self)` is the
  hierarchical, input-independent namespace (e.g. `["$Project","$Configuration","get"]`).
- On mount, the query atom registers `prefixesOf(fullKey)` — every non-empty prefix:

  ```
  ["$Project","$Configuration","get", input]
    registers:
      ["$Project"]
      ["$Project","$Configuration"]
      ["$Project","$Configuration","get"]
      ["$Project","$Configuration","get", input]
  ```

  See `buildQueryFamily` → `prefixesOf` → `factory.withReactivity` in
  [`src/atomQuery.ts`](../src/atomQuery.ts) (registration around L416-424).
- Invalidation hashes K and fires the handlers registered under that exact hash
  (`Reactivity.invalidate` → `keysToHashes` in
  `repos/effect/packages/effect/src/unstable/reactivity/Reactivity.ts`).

### Why this equals TanStack's match set

```
K matches a query
  <=> K equals one of that query's registered prefixes
  <=> K is a prefix of the query's full key
```

That is exactly TanStack's `exact:false` rule.

- **Not too much** — `invalidate ["A","B"]` hits only queries whose full key starts with
  `["A","B"]`. An over-specific K (longer than a query's key) matches nothing in both
  systems, because a query never registers a prefix longer than itself.
- **Not too little** — a short namespace `["A"]` reaches every query under it, because
  each registered the `["A"]` prefix. The mutation default `getQueryKey`
  (e.g. `["$Project"]`, `defaultGetQueryKey` in [`src/mutate.ts`](../src/mutate.ts)) is
  always a leading prefix of `baseKey`, so default namespace invalidation reaches all
  inputs and sub-resources.

## Why multiple keys must be registered

This is the crux. A single exact-key registration would only fire when invalidation used
that exact key — losing TanStack's "parent namespace invalidates all children" behavior.
Registering **every prefix** is what restores hierarchical reach under an exact-lookup
mechanism. Drop a prefix and that namespace level stops invalidating its children
(invalidates too little); register a key that isn't a prefix and it invalidates unrelated
queries (too much).

## Hashing consistency (register ↔ invalidate)

Both sides route through `keysToHashes`, which hashes **each element** of the keys array:

- Registration: `withReactivity(reactivityKeys)` → `registerUnsafe` — `reactivityKeys` is a
  list of prefix-arrays, each hashed via `Hash.hash`.
- Invalidation: mutations pass `ReadonlyArray<ReadonlyArray<unknown>>` — a *list of
  key-arrays* (`buildInvalidateCache` in [`src/mutate.ts`](../src/mutate.ts)) — so each
  element is a full namespaced array, matching the registration shape.

The await-tracking map (`keyAtoms` in `atomQuery.ts`) keys on the same `Hash.hash(key)`, so
`invalidateAndAwait` resolves once exactly the matched live queries have settled.

## Intentional differences / caveats

1. **Hash-only matching, no equality fallback.** TanStack compares keys with
   `partialDeepEqual`. The Atom path keys its handler map purely on `Hash.hash` with no
   tiebreak. A hash collision between two distinct keys would cross-invalidate
   (over-invalidate). Probability is low (array hashes combine element hashes) but it is
   the one real semantic divergence from TanStack's exact compare. Same applies to
   `keyAtoms` and `uniqueKeys`.
2. **Input is one opaque trailing element** (`[...baseKey, input]`). You can invalidate at
   any namespace granularity but not *within* an input (no "all inputs where
   status=active"). TanStack with the same key shape behaves identically — parity, just a
   granularity ceiling.
3. **O(depth) registrations per live query** (depth+1 prefixes, in both the reactivity
   handler map and `keyAtoms`). Negligible at typical depths of 2-4.
4. **Reaches only "alive" atoms** (mounted, or cached within `idleTTL`). `setIdleTTL` is
   applied last in the atom chain so cached-but-unmounted queries stay registered and are
   still hit; a query GC'd past idle TTL is gone and refetches fresh on next mount anyway —
   matching TanStack `gcTime` semantics.

## Verdict

Sound. The prefix-registration faithfully reproduces TanStack's hierarchical invalidation
in both directions (not too much, not too little). The only behavioral gap is the
theoretical hash-collision case in caveat 1.

---
"@effect-app/vue": patch
"effect-app": patch
---

`queryInvalidation` / `invalidatesQueries` accept shorthand entries (per-mutation, Command, client-level `QueryInvalidation<M>` maps, and server-side `Req.Command` `invalidatesQueries` callbacks).

Each entry returned may now be:

- a raw query key (`string[]`)
- an RPC handler (`{ id, options? }`) — its query key is derived via `makeQueryKey`
- the existing `{ filters, options }` raw tanstack-query invalidation

```ts
queryInvalidation: (queryKey) => [
  queryKey,
  GetMe,
  PackListIndex
]
```

equivalent to:

```ts
queryInvalidation: (queryKey) => [
  { filters: { queryKey } },
  { filters: { queryKey: makeQueryKey(GetMe) } },
  { filters: { queryKey: makeQueryKey(PackListIndex) } }
]
```

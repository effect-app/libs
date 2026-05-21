---
"@effect-app/vue": patch
---

`queryInvalidation` accept shorthand entries.

Each entry returned from `queryInvalidation` may now be:

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

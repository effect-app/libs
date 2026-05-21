---
"effect-app": patch
---

`InvalidationSet.add` accepts RPC handler shorthand.

Server-side handlers may now pass an RPC handler object directly to
`InvalidationSet.add`; its query key is derived via `makeQueryKey`. Raw
`InvalidationKey` arrays continue to work.

```ts
// before
yield* Invalidation.InvalidationSet.use(_ => _.add(makeQueryKey(UserRsc.GetMe)))

// after
yield* Invalidation.InvalidationSet.use(_ => _.add(UserRsc.GetMe))
```

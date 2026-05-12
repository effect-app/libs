---
"@effect-app/vue": minor
---

Default mutation invalidation now scopes to the action's full namespace instead of the parent.

For `Foo/Bar.SaveItems` we previously invalidated `["$Foo"]` (every query under `Foo/*`); now we invalidate `["$Foo","$Bar"]` (only queries under `Foo/Bar`). This avoids accidentally refetching unrelated sibling groups when one group mutates.

If you relied on cross-group invalidation (e.g. `Project/Configuration.save` refreshing `Project/Other.list`), opt in explicitly via the `queryInvalidation` mutation option or emit the appropriate keys server-side through `InvalidationSet`.

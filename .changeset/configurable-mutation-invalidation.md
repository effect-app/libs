---
"@effect-app/vue": minor
---

Make the default mutation invalidation heuristic configurable.

The built-in default is unchanged (collapse one namespace level: `Foo/Bar.x` invalidates `["$Foo"]`, `Foo/Bar/Baz.x` invalidates `["$Foo","$Bar"]`). Client projects can now override it globally:

```ts
import { makeQueryKey, setDefaultGetQueryKey } from "@effect-app/vue"

// invalidate the full namespace of the action (no parent collapse)
setDefaultGetQueryKey((h) => {
  const key = makeQueryKey(h)
  const ns = key.filter((_) => _.startsWith("$"))
  if (!ns.length) throw new Error("empty query key for: " + h.id)
  return ns
})
```

Call at app bootstrap. Pass `undefined` to restore the built-in default. Per-mutation overrides via the existing `queryInvalidation` option still take precedence.

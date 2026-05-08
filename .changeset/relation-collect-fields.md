---
"@effect-app/infra": minor
---

Add `collectFields`/`collectDistinctFields` to `relation()` DSL for collecting values from multiple fields of relation items into a single flattened array.

Example: given `T = { a: boolean, items: { x: string, y: string, z: number }[] }[]`, you can now collect all distinct `x` and `y` values into a single `string[]`:

```ts
relation("items").collectDistinctFields(["x", "y"])
```

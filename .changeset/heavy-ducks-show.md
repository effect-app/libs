---
"@effect-app/infra": patch
---

Add `relation(...).length()` computed projection — emits `ARRAY_LENGTH` on Cosmos / `arrayLength` on SQL / native `.length` on Memory. Cheaper than `relation.count()` for unconditional array sizing (no subquery scan, just metadata read).

```ts
projectComputed(
  S.Struct({ id: S.String, packageCount: S.NonNegativeInt }),
  computed({ packageCount: relation<OrderEnc>("packages").length() })
)
```

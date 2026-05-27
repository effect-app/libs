---
"effect-app": patch
---

Reduce schema type complexity by exposing explicit interfaces for branded string and number schemas.

Each branded constant in `Schema/strings.ts`, `Schema/moreStrings.ts`, and `Schema/numbers.ts` now has a named interface (e.g. `NonEmptyStringSchema`, `StringIdSchema`, `PositiveIntSchema`, `UrlSchema`) annotating its `export const`. Mirrors the pattern used in `effect/Schema` itself — TypeScript reports the interface name instead of expanding the full pipe/brand/extension chain, which shrinks inferred types in consumer code and speeds up type display.

No runtime or API surface changes; `brandedStringId` now returns `BrandedStringIdSchema<Id>` (same shape as before, just named).

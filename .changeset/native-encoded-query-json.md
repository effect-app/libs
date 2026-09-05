---
"effect-app": minor
"@effect-app/infra": minor
"@effect-app/vue-components": minor
---

Stop forcing Date/Map/Set Encoded shapes to JSON.

`Schema.Date` / `ReadonlySet` / `ReadonlyMap` now keep native Encoded types (`Date`, `Set`, `Map`). Use `DateFromString`, `ReadonlySetFromArray`, and `ReadonlyMapFromArray` when the Encoded form must be JSON. The query DSL accepts those native values, including array ops (`includes` / `in` / `includes-any`) on `Date[]` and `ReadonlySet` fields. Memory, Disk, SQL, and Cosmos convert Encoded Date/Map/Set through `Schema.toCodecJson` on write/read; query parameters and defaults lower the same way from the store schema. App types such as DateOnly stay native Encoded and JSON-lower via that schema — not a type registry.

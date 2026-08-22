---
"effect-app": minor
"@effect-app/infra": minor
"@effect-app/vue-components": minor
---

Stop forcing Date/Map/Set Encoded shapes to JSON.

`Schema.Date` / `ReadonlySet` / `ReadonlyMap` now keep native Encoded types (`Date`, `Set`, `Map`). Use `DateFromString`, `ReadonlySetFromArray`, and `ReadonlyMapFromArray` when the Encoded form must be JSON. The query DSL accepts those native values, including array ops (`includes` / `in` / `includes-any`) on `Date[]` and `ReadonlySet` fields. Memory, Disk, SQL, and Cosmos convert Encoded Date/Map/Set through `Schema.toCodecJson` on write/read; query parameters are lowered the same way.

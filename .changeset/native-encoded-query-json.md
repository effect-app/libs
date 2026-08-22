---
"effect-app": minor
"@effect-app/infra": minor
"@effect-app/vue-components": minor
---

Stop forcing Date/Map/Set Encoded shapes to JSON.

`Schema.Date` / `ReadonlySet` / `ReadonlyMap` now keep native Encoded types (`Date`, `Set`, `Map`). Use `DateFromString`, `ReadonlySetFromArray`, and `ReadonlyMapFromArray` when the Encoded form must be JSON. The query DSL accepts those native values, including array ops (`includes` / `in` / `includes-any`) on `Date[]` and `ReadonlySet` fields. Document-store adapters convert them with `Schema.toCodecJson` (Date → ISO string, Set → array, Map → entries). Repository persistence also round-trips through `toCodecJson` so JSON stores stay compatible.

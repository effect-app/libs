---
"effect-app": minor
"@effect-app/infra": minor
"@effect-app/vue": minor
"@effect-app/vue-components": minor
---

Remove effect-app helpers that Effect already provides, and add `migrateEffectAppSource` to rewrite call sites.

Deleted aliases and wrappers now live in Effect: `String.capitalize` / `uncapitalize`, `Struct.keys`, `Record.values`, `Record.filter` for `dropUndefined`, `absurd`, `Tuple.make`, `Option.isSome`, `Option.liftPredicate` for non-empty arrays and `fromBool`, `Array.chunksOf`, `Chunk.findFirst` / `findLast` / `partition` / `containsWith`, `Array.dedupeWith`, `Effect.annotateLogsScoped`, `Deferred.await`, `Effect.fromOption`, `Result.fromOption`, and `DateTime.add` / `subtract`. `Schema.DateValid` was an alias of `Schema.Date`. The date-fns calendar wrappers and the `date-fns` dependency are gone.

`effect-app/migration/nativeEffect` exports the replacement table and `migrateEffectAppSource(source)`, which rewrites those imports in one file. Helpers that are not the same operation stay: `groupByT` (any key, entry list), `randomElement`, `findFirstMap`, and the schema constructors that add construction defaults.

`Chunk.containsWith` calls the equivalence as `(needle, element)`. The old `elem` called it as `(element, needle)`, so only a symmetric equivalence is unchanged. `DateTime.add` and `subtract` use UTC calendar parts; the date-fns wrappers used the local calendar. `Record.values` expects one value type, so a mapped type whose value depends on its key should use `Object.values`.

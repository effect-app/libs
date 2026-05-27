---
"effect-app": patch
---

Fix schema interface widening regression introduced in 4.0.0-beta.255 (changeset `olive-onions-lose`).

The original refactor annotated branded schema constants with interfaces extending `S.Codec<A, primitive> & WithDefaults<...>`. That widened the underlying `BrandedSchema<...>` chain and dropped phantom slots (`Iso`, `~type.make.in`, `~type.parameters`, `Rebuild`, etc.) that downstream combinators read. In consumer projects this surfaced as `DecodingServices` / `EncodingServices` leaking as `unknown` — for example `Q.project(schema, "project")` failing with `Type 'unknown' is not assignable to type 'never'`, and RPC handler / generator-return shape mismatches against `Effect<any, ..., CurrentSettings | ...>`.

Each `*Schema` interface now extends the concrete underlying chain (e.g. `BrandedSchema<S.NonEmptyString, NonEmptyString64>`) and adds a call signature for `withDefaultMake` (and an explicit `withConstructorDefault` field for the numeric and `StringId` schemas). The runtime values are unchanged and the type-display improvement is preserved.

Affected: `NonEmptyString*`, `Min3String255`, `StringId`, `Url`, `PositiveInt`, `NonNegativeInt`, `Int`, `PositiveNumber`, `NonNegativeNumber`, and `brandedStringId`.

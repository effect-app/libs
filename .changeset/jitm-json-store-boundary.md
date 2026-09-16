---
"effect-app": minor
"@effect-app/infra": minor
---

`jitM` runs at the store boundary as JSON → JSON, before the `toCodecJson(toEncoded(schema))` decode; repositories decode the Encoded shape only.

`jitM` used to be applied by the repository _after_ the store had already decoded the document, and was typed `(pm: Encoded) => Encoded` - a lie, since jitMs are written against the stored JSON and `Encoded` holds native `Date`/`Map`/`Set` values.

The read pipeline is now: raw JSON document → merge `defaultValues` (unchanged: they only fill _absent_ keys, so an explicitly stored `null` reaches `jitM`) → `jitM` (JSON → JSON) → decode `Schema.toCodecJson(Schema.toEncoded(schema))` → Encoded. The repository then decodes Encoded → the domain type with `schema` and no longer applies `jitM` at all. Because `jitM` now runs before any schema decode sees the document, it can repair legacy shapes including explicit `null`s.

- `StoreConfig.jitM?: (json: JsonRecord) => JsonRecord` is new, where `JsonRecord` (exported from `effect-app/Store`) is `{ readonly [key: string]: Schema.Json }`. It is not applied on the write/encode path, and never receives `_etag`.
- `RepositoryOptions.jitM` changes type from `(pm: Encoded) => Encoded` to `(json: JsonRecord) => JsonRecord` and is forwarded into the store config.
- **Migrating a jitM:** it now receives and must return JSON. A `Date` field arrives as an ISO string (return a string, not a `Date`), a `ReadonlySet` as an array, a `ReadonlyMap` as an array of `[key, value]` pairs. Field access is index-signature based (`json["x"]`) rather than typed property access.
- The JSON→Encoded decode stays strict: a document `jitM` does not repair fails at the store boundary instead of being read back half-decoded.
- `ValidationError.jitMResult` is deprecated: `validateSample` only ever sees the store's output, so it is identical to `rawData`.

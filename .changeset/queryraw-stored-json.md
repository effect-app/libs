---
"effect-app": patch
"@effect-app/infra": patch
---

Memory, SQLite, and Postgres `Store.queryRaw` now run over stored JSON documents, not Encoded rows. `Repository.queryRaw` already applies `toCodecJson` to the projector output, so native Encoded `Date` / `Map` / `Set` values no longer fail `Expected JSON value`. Cosmos was already JSON and is unchanged.

Memory projectors that assumed native Encoded `Date` / `Map` / `Set` values now see the stored JSON form (ISO strings, arrays).

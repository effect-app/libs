---
"effect-app": minor
"@effect-app/infra": minor
---

Query maps as JSON arrays of `[key, value]` tuples.

`where("meta", "hasKey" | "hasValue" | "hasKeyValue", ...)` (and `not*` / `*-any` / `*-all` variants) filter `ReadonlyMap` fields. Memory, Disk, SQLite, Postgres, and Cosmos compile those ops against the encoded tuple array.

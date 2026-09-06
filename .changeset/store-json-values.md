---
"effect-app": minor
"@effect-app/infra": minor
---

JSON stores lower native Encoded values (Date, Map, Set, and app types such as DateOnly) through the store's document schema.

`makeRepo` already passes that schema. Adapters encode documents, query parameters, and defaults with `Schema.toCodecJson(toEncoded(schema))` at the field path. No type registry. Schemaless stores still lower Date/Map/Set structurally.

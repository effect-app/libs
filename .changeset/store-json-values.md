---
"effect-app": minor
"@effect-app/infra": minor
---

App schemas can plug native Encoded values into JSON stores without baking them into effect-app.

`StoreConfig.jsonValues` and `JsonValues` (a Context service) take schemas whose Encoded form is a native value (DateOnly, branded money, …). Query params and schemaless documents lower through `Schema.toCodecJson(toEncoded(schema))`. Date/Map/Set stay built in. Use `registerJsonSchema` for process-wide registration.

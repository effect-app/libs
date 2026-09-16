---
"@effect-app/infra": patch
---

Stop re-encoding store `defaultValues` in Cosmos and SQL query builders.

Stores already JSON-lower `defaultValues` at construction. A second schema encode of an ISO `Date` string throws `Expected a valid Date`, which failed `filter({ select: [id] })` even when the select path never decoded a document.

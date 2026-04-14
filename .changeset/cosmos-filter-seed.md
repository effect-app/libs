---
"@effect-app/infra": patch
---

Fix CosmosDB store `filter` to trigger namespace seeding on first access. Previously, if `filter` was the first operation called on a namespace, seed data was never created.

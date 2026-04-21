---
"@effect-app/infra": patch
---

Add per-namespace seeding to SQL (SQLite/PostgreSQL) and CosmosDB store adapters. Previously only the `primary` namespace was seeded at initialization; now each namespace is lazily seeded on first access using `Effect.cached` to guarantee at-most-once execution. Primary namespace continues to seed eagerly on initialization. CosmosDB uses namespace-specific marker documents for backward compatibility.

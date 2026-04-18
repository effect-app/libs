---
"@effect-app/infra": minor
---

Add RepositoryRegistry service that tracks all repositories by modelName, with `seedNamespace` to seed all registered repos in parallel and `entries` to inspect the registry.

Make non-primary namespace seeding explicit: Store and Repository now expose `seedNamespace` instead of auto-seeding on access. Primary namespace is still seeded eagerly on initialization.

SQL stores: table creation (`CREATE TABLE IF NOT EXISTS`) is now part of `seedNamespace` instead of running eagerly at store construction, ensuring tables for non-primary namespaces are only created when explicitly seeded.

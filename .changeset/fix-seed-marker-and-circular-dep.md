---
"@effect-app/infra": patch
---

Fix store seeding: break circular dependency where bulkSet re-entered seedNamespace, and add explicit seed markers to SQL/Pg stores using a dedicated `__seed__` namespace.

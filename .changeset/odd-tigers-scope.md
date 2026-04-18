---
"@effect-app/infra": patch
---

SQL and Pg stores now scope seed migration records by namespace and table name in shared databases to avoid cross-namespace seed collisions.

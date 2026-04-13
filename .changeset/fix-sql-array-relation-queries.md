---
"@effect-app/infra": patch
---

Fix SQL `whereSome`/`whereEvery` array relation queries using `EXISTS` with `json_each` (SQLite) / `jsonb_array_elements` (Pg).

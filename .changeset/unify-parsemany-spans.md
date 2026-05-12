---
"@effect-app/infra": patch
---

Unify `parseMany` span variants under a single span name. The four prior spans (`parseMany`, `parseMany2`, `parseManyProject`, `parseManyCollect`) now all emit as `parseMany` with `app.entity` and `app.query.mode` attributes (`"transform" | "project" | "collect"`). Reuses the same attribute key already set on the parent `Repository.query` span for consistency. `parseManyProject`/`parseManyCollect` previously lacked `app.entity` — now included.

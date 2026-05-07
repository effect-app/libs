---
"@effect-app/infra": patch
---

Repository owns OTel span topology; store adapters annotate db.* semconv attrs on the current span instead of opening their own child spans. Eliminates 1-1 nested span chains (e.g. `Repository.query` → `Cosmos.filter`). Adds `annotateDb` helper alongside `withDbSpan` in `otel.ts`. Repo public ops (`find`, `all`, `query`, `queryRaw`, `mapped.*`) get explicit `Repository.<op>` spans; internal codec steps (`encodeMany`, `parseMany`, `parseMany2`) keep bare names. `validateSample` opens per-iteration sub-spans to prevent attribute clobber. Adds WeakMap decoder cache for `parseMany2` schemas.

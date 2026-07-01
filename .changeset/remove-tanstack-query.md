---
"@effect-app/vue": minor
"@effect-app/e2e": patch
---

Remove the TanStack query engine and its patch, leaving the Atom engine as the only query backend.

- Drop `@tanstack/vue-query` / `@tanstack/query-core` dependencies and the `patches/@tanstack__query-core.patch`.
- Delete `packages/vue/src/internal/tanstackQuery.ts` (`makeTanstackQuery`, `makeTanstackQueryClient`, `makeTanstackQueryInvalidator`, `makeTanstackQueryCacheUpdater`).
- `makeClient` no longer accepts `legacyQueryEngine` (always Atom) and no longer returns `tanstackQueryClient`. The `MakeClientOptions` interface is removed.
- `QueryImpl` no longer takes a `legacyUseQuery` override; `.query()` / `.suspense()` now always run on the Atom engine alongside `.atom()` / `.family()` / `.queryNew()` / `.suspenseNew()`.
- Tests that exercised the tanstack path are dropped or converted to the Atom path (query-span, suspense-regression structural sharing, dependency-invalidation matrix, e2e repo invalidation).

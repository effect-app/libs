---
"effect-app": patch
"@effect-app/infra": patch
"@effect-app/cli": patch
"@effect-app/vue": patch
"@effect-app/vue-components": patch
---

Update Effect packages to `4.0.0-beta.83` (from `beta.74`): `effect`, `@effect/platform-node`, `@effect/platform-browser`, `@effect/sql-sqlite-node`, `@effect/atom-vue`, `@effect/vitest`.

Adapt the infra workflow engines to beta.83 API changes:

- `Schema.Defect` is now a constructor function — use `S.Defect()` when building the deferred-exit codec (the bare constant no longer produces a usable schema and crashed `toType`).
- `Workflow` exposes its name as `_tag` instead of `name`. `WorkflowEngineSqlite`/`WorkflowEngineCosmos` now key the registry, codec caches, and persisted `workflow_name` off `workflow._tag`, fixing crash-recovery (stale-lease re-drive previously registered under an `undefined` key and never matched).

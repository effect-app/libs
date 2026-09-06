---
"@effect-app/vue-components": patch
"effect-app": patch
"@effect-app/infra": patch
"@effect-app/cli": patch
"@effect-app/vue": patch
---

Update effect packages to `4.0.0-rc.112` (from `beta.107`): `effect`, `@effect/platform-node`, `@effect/platform-browser`, `@effect/atom-vue`, `@effect/sql-sqlite-node`, `@effect/vitest`. Sync `repos/effect` subtree from `Effect-TS/effect` at `effect@4.0.0-rc.112`.

API adaptations for rc.112:

- cluster encoded driver `resetAddress` → batched `resetAddresses`
- Cosmos `unprocessedMessages` honors optional `limit` / `addresses` (only claimed rows are returned)
- Service Bus `Runners.make` supplies `codecFor` for schema-aware RPC serialization
- `pnpm subtree:effect` passes `--url https://github.com/Effect-TS/effect.git` (published CLI still defaults to effect-smol)

---
"@effect-app/eslint-shared-config": patch
"@effect-app/eslint-codegen-model": patch
"@effect-app/vue": patch
---

Cleanup after tsgolint + oxlint-codegen-plugin migration:
- Wire `@effect-app/eslint-codegen-model/oxlint` via `jsPlugins` object form (`{ name: "codegen", specifier: ... }`) so the `codegen/codegen` rule key resolves.
- Drop `eslint-plugin-codegen` dep, patch, and `augmentedConfig` helper — codegen now runs through oxlint.
- Break cyclic workspace dep between `eslint-codegen-model` and `eslint-shared-config`; remove dead `eslint.config.mjs` from `eslint-codegen-model`.
- Switch `@effect-app/vue` to `baseConfig` (no `.vue` files in `src`).

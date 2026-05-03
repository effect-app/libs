---
"@effect-app/eslint-shared-config": patch
"@effect-app/eslint-codegen-model": patch
"@effect-app/vue": patch
"@effect-app/vue-components": patch
---

Cleanup after tsgolint + oxlint-codegen-plugin migration:
- Wire `@effect-app/eslint-codegen-model/oxlint` via `jsPlugins` object form (`{ name: "codegen", specifier: ... }`) so the `codegen/codegen` rule key resolves.
- Drop `eslint-plugin-codegen` dep, patch, and `augmentedConfig` helper — codegen now runs through oxlint.
- Break cyclic workspace dep between `eslint-codegen-model` and `eslint-shared-config`; remove dead `eslint.config.mjs` from `eslint-codegen-model`.
- Switch `@effect-app/vue` to oxlint-only (no `.vue` files in `src`); drop its ESLint config and `eslint-shared-config` devDep.
- Restore `@typescript-eslint` plugin and rules in shared `baseConfig` so inline `eslint-disable @typescript-eslint/...` directives resolve in `@effect-app/vue-components` (the only remaining ESLint consumer, for `.vue` files).
- Add `globals.browser` to `vueConfig` so browser globals (`window`, `console`, `URL`, etc.) resolve.

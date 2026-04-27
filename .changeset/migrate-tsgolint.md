---
"@effect-app/eslint-shared-config": minor
"effect-app": patch
"@effect-app/cli": patch
"@effect-app/infra": patch
"@effect-app/vue": patch
"@effect-app/vue-components": patch
---

Replace typescript-eslint with oxlint-tsgolint for type-aware lint. Drop ESLint entirely from non-vue packages (cli, effect-app, infra) — they now use only `oxlint --type-aware`. Vue packages keep ESLint to run `@effect-app/no-await-effect` (no tsgolint equivalent) via `@typescript-eslint/parser` + `vue-eslint-parser`.

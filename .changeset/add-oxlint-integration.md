---
"@effect-app/eslint-shared-config": minor
---

Add oxlint integration: run oxlint before ESLint, with `eslint-plugin-oxlint` disabling ESLint rules already covered by oxlint. Add repo-root `.oxlintrc.json` with shared rule config. Update `lint`/`lint-fix` scripts in cli, effect-app, and infra packages.

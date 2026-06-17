---
"@effect-app/eslint-codegen-model": patch
---

Migrate `glob` 8 → 11. Use the named `globSync` export (glob 11 dropped the default export, which broke loading the package as an ESM oxlint plugin), and drop the stale `@types/glob` (glob 11 ships its own types). Also clears the package's pre-existing implicit-`any` typecheck errors.

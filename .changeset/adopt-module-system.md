---
"effect-app": patch
"infra": patch
"@effect-app/vue": patch
"@effect-app/vue-components": patch
---

Adopt module system from effect-smol: replace barrel imports with specific submodule imports (`import * as X from "effect-app/X"` / `import * as X from "effect/X"`). Remove `export * from "effect"` barrel from effect-app index.

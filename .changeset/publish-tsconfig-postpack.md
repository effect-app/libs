---
"@effect-app/cli": patch
"@effect-app/eslint-codegen-model": patch
"@effect-app/infra": patch
"@effect-app/vue": patch
"effect-app": patch
---

Move release tsconfig flattening from publish to pack lifecycle so package configs are restored before registry upload/auth can fail.

---
"@effect-app/eslint-codegen-model": patch
---

Fix `toCamelCase`/`toPascalCase` in barrel preset to preserve case boundaries. Mixed-case input like `AnCamelCase` was collapsed to `Ancamelcase` because the word splitter only matched contiguous alphanumerics. Now splits on case transitions (matching prior `lodash.camelCase` + `startCase` behavior).

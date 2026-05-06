---
"@effect-app/eslint-shared-config": patch
---

Add shared oxlintrc.json base config. Consumers extend via `"extends": ["./node_modules/@effect-app/eslint-shared-config/src/oxlintrc.json"]`. Note: oxlint does not merge `ignorePatterns` — repeat the base patterns and add project-specific ones.

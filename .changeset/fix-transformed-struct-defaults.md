---
"@effect-app/vue-components": patch
---

Fix defaultsValueFromSchema for transformed struct schemas (e.g. decodeTo) in unions. Walk the AST properly instead of relying on schema-level .fields/.from chains.

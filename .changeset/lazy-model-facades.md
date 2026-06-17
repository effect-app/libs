---
"effect-app": patch
"@effect-app/eslint-codegen-model": patch
---

Add generated opaque model facades that expose static Type, Encoded, Make, and Schema declarations without leaking the private struct schema type to downstream project references.

---
"effect-app": patch
"@effect-app/vue": patch
---

Update request helper typing and runtime invocation to rely on schema `.make` instead of class constructors, avoiding `new`-based assumptions for request schemas.

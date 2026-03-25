---
"effect-app": patch
---

Update `Effect.allLower` to call `svc.asEffect()` when available, ensuring service entries are normalized before `Effect.all` evaluation.

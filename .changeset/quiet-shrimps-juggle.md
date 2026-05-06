---
"effect-app": patch
"@effect-app/infra": patch
"@effect-app/cli": patch
---

Refactor eligible schema classes and tagged classes to Opaque schemas, and migrate constructor call sites to use `.make` for those models.

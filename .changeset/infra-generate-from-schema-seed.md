---
"@effect-app/infra": patch
---

`generateFromSchema` advances its seed on every call, so successive samples differ (deterministic across runs) instead of always returning the same value.

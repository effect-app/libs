---
"effect-app": patch
---

Improve repository schema encode/decode telemetry for event-loop tail analysis.

- widen `app.schema.{encode,decode}.duration` histogram buckets into multi-second stalls
- count `app.schema.slow` (duration ≥ 100ms) with `app.entity` / operation attributes for alertable rates
- annotate spans with `app.schema.slow` and, on encode, `app.entity.state` from the first item's `_tag`

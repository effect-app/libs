---
"effect-app": patch
"@effect-app/infra": patch
"@effect-app/vue": patch
"@effect-app/vue-components": patch
---

Tag-aware `ProjectableFromDomain` for `projectComputed`: projection Encoded fields must exist on the matching domain tagged state (or be computed). Prevents Overview.List SchemaErrors when cancel states omit workflow lock fields like `activeRequest`.

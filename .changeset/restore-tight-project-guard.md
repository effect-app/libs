---
"effect-app": patch
"@effect-app/infra": patch
"@effect-app/vue": patch
"@effect-app/vue-components": patch
---

Restore tag-aware `ProjectableGuard` on `project()` (revert the view-DTO paper-over). Projections must be domain-derived per tagged state.

---
"@effect-app/vue": patch
---

Remove automatic namespace invalidation for commands. Query invalidation is now driven solely by server-provided keys or explicit `queryInvalidation` options.

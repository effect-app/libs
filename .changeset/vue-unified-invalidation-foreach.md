---
"@effect-app/vue": patch
---

Merge client and server-driven cache invalidation keys into a single `Effect.forEach` pass so server keys always run regardless of whether client targets are empty or custom invalidation options are used.

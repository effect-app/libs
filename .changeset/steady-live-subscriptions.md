---
"@effect-app/vue": patch
---

Keep live queries subscribed across successive repository writes: dispatch each write/reset to a snapshot of current registrations, skipping ones removed or replaced mid-dispatch. Live queries now also honor `invalidation: "soft"`.

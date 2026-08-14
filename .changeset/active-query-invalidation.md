---
"@effect-app/vue": minor
---

Invalidate only mounted queries (TanStack `refetchType: "active"`). Idle `gcTime` entries are marked stale and refetch on remount. `invalidateAndAwait` still waits for observed refetches to finish.

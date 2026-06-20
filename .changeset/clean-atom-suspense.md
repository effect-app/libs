---
"@effect-app/vue": patch
---

Fix atom-query suspense cleanup so per-observer wrappers unsubscribe on unmount while cached query atoms keep their idle TTL.

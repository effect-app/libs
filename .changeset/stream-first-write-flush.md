---
"@effect-app/vue": patch
---

Flush stream mutation write-deps once when the first write arrives, then again on settlement. Long-running streams can refresh queries like GetActiveJob without invalidating list queries on every subsequent item write.

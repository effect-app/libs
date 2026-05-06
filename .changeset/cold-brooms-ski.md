---
"@effect-app/vue": patch
---

Improve `deepToRaw` to support any root input type, correctly unwrap refs/computed values, and preserve collection/date shapes (`Array`, `Map`, `Set`, `Date`) while deeply removing Vue reactivity wrappers.

---
"effect-app": patch
---

`Email` and `PhoneNumber` carry native `arbitraryConstraint` patterns, so `effect/unstable/arbitrary` (and `generateFromSchema`) can sample them instead of exhausting rejection sampling on their `refine` guards.

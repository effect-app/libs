---
"@effect-app/vue-components": patch
---

Localize `S.isBetween` validation failures: the violated side now maps to the `validation.number.min` / `validation.number.max` messages instead of falling back to the English default formatter. Also fixes the inverted `isExclusive` flag on the min/max messages for `isGreaterThan[OrEqualTo]` / `isLessThan[OrEqualTo]` (inclusive checks now say "at least/at most", strict ones "greater/less than").

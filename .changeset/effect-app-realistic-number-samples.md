---
"effect-app": patch
---

`PositiveNumber` and `NonNegativeNumber` bound native Arbitrary generation to at most 1,000,000 (`arbitraryConstraint` on their existing checks), so generated fixtures no longer overflow derived totals to `Infinity`. Validation and JSON Schema output are unchanged.

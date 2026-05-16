---
"effect-app": patch
---

Distinguish `Date` and `DateValid` in JSON Schema output.

- `Date` now emits identifier `DateOrInvalid` with description noting the value may be invalid.
- `DateValid` now emits its own annotated string (identifier `Date`) with description stating a valid ISO 8601 date is required.

---
"@effect-app/infra": patch
---

Add configurable `fakeMailAddress` to `SendgridConfig`. Supports `{i}` placeholder for unique addresses, e.g. `"test+{i}@example.com"`.

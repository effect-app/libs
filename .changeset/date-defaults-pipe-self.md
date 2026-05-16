---
"effect-app": patch
---

Fix `Date` / `DateValid` default helpers to pipe from their own schema.

`withConstructorDefault` and `withDecodingDefaultType` on `DateValid` previously piped from `DateFromString`, dropping the `isDateValid()` check (and, after the recent identifier split, the `DateValid` annotations) from the resulting defaulted schema. Both `Date` and `DateValid` now use `extendM` so the helpers attach to the underlying schema (`DateFromString` / `DateValidFromString`).

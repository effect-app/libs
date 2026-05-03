---
"@effect-app/vue": patch
---

`mutate.wrap` on stream handlers now works the same as on command/query handlers: it can be called without arguments or with only combinators, with the underlying stream handler pre-baked in.

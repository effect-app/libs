---
"effect-app": patch
---

Allow Struct and TaggedStruct make helpers to omit input when every constructor field is optional or defaulted, and preserve widening copy typings through a lighter named public type to improve TypeScript editor responsiveness.
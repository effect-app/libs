---
"effect-app": patch
"@effect-app/infra": patch
---

Remove pick/omit customizations from Class/TaggedClass/Struct/TaggedStruct. Use `Struct.pick(X.fields, [...])` from `effect-app` instead.

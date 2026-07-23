---
"effect-app": patch
---

Add `Schema.dropConstructorDefault`, a `Struct.Lambda` that clears a field's `withConstructorDefault`. Compose it with `Struct.omit`/`Struct.map` when deriving a partial-update schema from a "create" schema, so omitted fields' constructor defaults don't resurrect themselves in `.make(...)` output.

Also, `makeExactOptional` now drops constructor defaults automatically, matching this behavior.

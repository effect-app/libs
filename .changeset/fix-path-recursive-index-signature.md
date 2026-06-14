---
"effect-app": patch
---

Fix `TS2589: Type instantiation is excessively deep and possibly infinite` when querying models that embed `Schema.Defect()` (or any field encoded as `Json`).

The query path type `Path<T>` (used by `Q.where`/`Q.and`/`Q.order` to type dotted field paths) recursed through object types with no termination for self-referential ones. Under effect `4.0.0-beta.83`, `Schema.Defect()` encodes as `Json`, whose `JsonObject = { readonly [x: string]: Json }` index signature made `Path` descend forever, blowing past TypeScript's instantiation limit on any model with such a field (e.g. carrier-error states carrying `raw: Schema.Defect()`).

`Path` now threads a `Seen` set of already-entered object types and stops before re-entering one, so self-referential types terminate (the field itself stays a valid leaf path; only the unbounded descent is cut). Finite models are unaffected.

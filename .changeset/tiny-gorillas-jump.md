---
"effect-app": patch
---

Rename the Class/TaggedClass relaxed declaration option to `strict` (default `false`) and apply it to `Class`, `TaggedClass`, `ExtendedClass`, and `ExtendedTaggedClass`.

When `strict: true`, class decoding keeps strict class-level declaration behavior; by default, decoding remains relaxed and preserves field-level schema errors.
---
"effect-app": patch
---

Fix `Schema.TaggedUnion(...).tags` extraction for class-based members (for example `TaggedClass`) by using a local AST sentinel walker instead of relying on internal effect APIs.

Add tests covering:
- `TaggedUnion` with `encodeKeys`-wrapped members
- `TaggedUnion` with `TaggedClass` members

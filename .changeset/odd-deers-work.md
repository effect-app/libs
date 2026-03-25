---
"effect-app": patch
---

Change `Schema.Class` and `Schema.TaggedClass` wrappers to default constructor options to `{ disableValidation: true }`.

This avoids strict class identifier validation by default when constructing wrapper classes (for example passing a compatible view class), while keeping existing behavior when explicit options are provided.

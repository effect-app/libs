---
"effect-app": patch
---

Preserve field-level schema decode errors for relaxed Class and TaggedClass declarations so decode failures report nested constraints (for example min-length violations) instead of only a generic class-type mismatch.
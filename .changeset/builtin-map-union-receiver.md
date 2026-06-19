---
"effect-app": patch
---

Fix the global `Array`/`ReadonlyArray.map` override breaking union-of-array receivers. The previous `this: NonEmptyArray`/`NonEmptyReadonlyArray` overload was selected-then-rejected on a union receiver (e.g. `(readonly A[] | readonly B[]).map(...)`), raising TS2684. Replaced with a single conditional-return signature (`this extends NonEmpty… ? NonEmpty<U> : U[]`) that preserves NonEmpty refinement without a `this` parameter, so union-array `.map` calls type-check again.

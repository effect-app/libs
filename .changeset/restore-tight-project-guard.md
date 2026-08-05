---
"effect-app": patch
"@effect-app/infra": patch
"@effect-app/vue": patch
"@effect-app/vue-components": patch
---

Keep tag-aware `ProjectableGuard` on both `project()` and `projectComputed` (no loose key-only paper-over).

Hardening:

- single-literal tags allow dual same-tag domain variants (KeysOfUnion of matched members)
- multi-tag / string tags still require keys on every matched member
- optional projection/domain keys checked by key presence only (not optional-assignability)

Call sites must project domain-owned fields per tagged state.

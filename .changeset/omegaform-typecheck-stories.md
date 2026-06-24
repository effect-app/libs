---
"@effect-app/vue-components": patch
---

Typecheck the OmegaForm Storybook stories (previously outside `tsconfig` scope) and migrate them off removed/renamed Schema APIs surfaced by it: `.withDefault` → `.withConstructorDefault`, error-filter `{ path, message }` → `{ path, issue }`, dropped deprecated `overrideDefaultValues`, and an `OmegaAutoGenMeta` type argument. Internal only — no change to the published API.

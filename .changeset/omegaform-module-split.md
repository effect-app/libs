---
"@effect-app/vue-components": patch
---

Refactor `OmegaForm` into focused modules and switch validation to a form-level `onDynamic` validator with `revalidateLogic()` so cross-field checks re-validate on every input change. `OmegaFormStuff.ts` is gone, split into `meta/{types,checks,createMeta,walker,defaults,redacted}.ts`, `validation/localized.ts`, `errors.ts`, `hocs.ts`, `inputs.ts`, `submit.ts`, `persistency.ts`, and `types.ts`; `useOmegaForm.ts` is orchestration-only.

Restored localization parity for `S.Email` (matched via the refine's `identifier` annotation) and for `S.Literals` / `S.Array(S.Literals(...))` (via an AST pre-pass that stamps `validation.not_a_valid` so Effect's formatter — which bypasses both hooks for `AnyOf` issues — picks them up through `findMessage`).

Behavior tweaks worth noting: per-field standard-schema validators are removed in favor of one form-level dynamic validator; `OmegaInput`'s `:key="fieldKey"` re-mount is gone; the post-change `errorMap.onSubmit` reset is gone (relies on TanStack revalidation); JSON-schema-derived annotations are no longer merged into `FieldMeta`. Public exports are preserved.

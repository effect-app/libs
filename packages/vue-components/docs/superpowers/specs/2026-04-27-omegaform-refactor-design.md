# OmegaForm Refactor — Design

**Status:** approved
**Date:** 2026-04-27
**Scope:** `packages/vue-components/src/components/OmegaForm/`

## Goal

Decompose two oversized files (`OmegaFormStuff.ts` 1447 lines, `useOmegaForm.ts` 1022 lines) into focused modules, slim the schema-meta extraction by removing redundancy and dead workarounds, and centralize validation onto a single form-level schema. Public API (the surface exported from `index.ts`) does not change.

## Non-goals

- No new features.
- No change to which UI kits are supported (Vuetify autodetect remains).
- No persistency-format change. Stored payloads remain compatible.
- No migration off TanStack Form.

## Decisions (already settled in brainstorming)

1. **One schema, form-level, localized.** The form-level submit validator is built with `toLocalizedStandardSchemaV1(formCompatibleSchema, trans)`. Per-field schema construction in `OmegaInput.vue` is deleted. TanStack revalidates the form-level schema on every change after a failed submit (its default behavior, our option iii).
2. **Validation timing = TanStack default (option iii).** Validate on submit; revalidate live after first submit attempt. No bespoke clearing or re-mount logic.
3. **Drop `getJsonSchemaAnnotation`.** No replacement. Constraints belong on the schema; per-input format/pattern overrides ride on `<form.Input>` props.
4. **Drop `originalCodec` / `fieldAstByPath` / `attachOriginalCodecs`.** Their only consumer was the per-field validator.
5. **Decompose by concern, flat module layout** (Approach 1 from brainstorming).

## Phase 0 — Characterization tests (write first, run green, then refactor)

These pin the current behavior so the refactor doesn't drift. Each test goes under `__tests__/OmegaForm/` unless noted.

1. `Meta.test.ts` — port the schema from `stories/OmegaForm/Meta.vue`. Snapshot the full meta record (root + nested struct + nullable struct, all six combinations of `S.String` / `S.Finite` / `S.NullOr` / `S.UndefinedOr` / `S.NullishOr`).
2. `test-defaults.test.ts` _(file at `__tests__/`)_ — exercise `defaultsValueFromSchema`:
   - `withConstructorDefault(Effect.succeed(...))` extraction
   - `withDecodingDefault` on optional keys
   - Nullable → `null`, undefined → `undefined`, primitives → `""` / `false`
   - Recursive struct + recursive union merge
   - Interaction with the `record` parameter (existing values preserved)
3. `test-redacted-meta.test.ts` extension — extend the existing `RedactedMeta.test.ts` to cover `toFormSchema` rewrites for `S.NullOr(S.Redacted(...))`, `S.UndefinedOr(S.Redacted(...))`, `S.NullishOr(S.Redacted(...))`, plain `S.Redacted`.
4. `validation-localization.test.ts` — feed `makeStandardSchemaV1Hooks` a stub `trans` and assert message ID + values for each leaf/check case. Also assert that `generateMetaFromSchema(S.Struct({ x: S.Email })).meta.x?.format === "email"` (this pins the v4 annotation-based email detection introduced in Phase 2):
   - Leaf: `MissingKey`, `InvalidType` (string / email / number / boolean / object / fallback), `InvalidValue`, `UnexpectedKey`, `Forbidden`, `OneOf`
   - Check: `isMinLength` (1 → `validation.empty`; N → `validation.string.minLength`), `isMaxLength`, `isInt`, `isGreaterThanOrEqualTo` (0 → positive; N → min, isExclusive: true), `isGreaterThan` (0 → positive; N → min, isExclusive: false), `isLessThanOrEqualTo`, `isLessThan`
   - Annotation overrides: `message`, `messageMissingKey`, `messageUnexpectedKey`
5. `submit-effect.test.ts` — instantiate a form, exercise:
   - `handleSubmitEffect()` succeeds with `void` for valid input
   - `handleSubmitEffect()` succeeds with `void` even when validation fails (no error channel without `checkErrors`)
   - `handleSubmitEffect({ checkErrors: true })` fails with `FormErrors<From>` when validation fails
   - `tanstackFormOptions.onSubmit` receives the **decoded** `To`, not raw `From` (assert via a transform-bearing schema)
   - `onSubmit` returning a `Promise`, an `Effect.Effect`, and a `Fiber` all complete to the same observable result
6. `submit-error-clear.test.ts` — characterize the **current** errorMap-clearing watcher (lines 988–1004 of `useOmegaForm.ts`): submit with invalid union → both branch fields show errors → type into one field → both fields' `onSubmit` errors clear. **This test is rewritten in Phase 3** to reflect the new (TanStack-default) behavior; keeping it as a characterization test means the change is visible in the diff.
7. `default-values-priority.test.ts` _(optional)_ — assert the resolution order `tanstack > persistency > schema` and a custom `defaultValuesPriority` override; assert `deepMerge` treats arrays as values, not as merged.
8. `tagged-union-nested.test.ts` — characterize `stories/OmegaForm/FormTaggedUnion.vue`:
   - `S.NullOr(S.Union([S.TaggedStruct("A", { a, common }), S.TaggedStruct("B", { b, common })]))` nested inside a parent struct
   - `meta["union._tag"]` = `{ type: "select", members: ["A", "B"], required: false }` (parent is nullable → `_tag` is non-required)
   - Flat `meta` contains `union.a`, `union.b`, `union.common`
   - `unionMeta["A"]` contains `a` and `common`, no `b`; `unionMeta["B"]` contains `b` and `common`, no `a`
   - Sibling `aString` field is unaffected
9. `tagged-union-root.test.ts` — characterize `stories/OmegaForm/RootLevelTaggedUnion.vue`, including the divergent-shared-field case:
   - Root-level `S.Union([S.TaggedStruct("A", { a: NonEmptyString255, common: NonEmptyString255 }), S.TaggedStruct("B", { b: Finite, nullableB: NullOr(Finite), common: NullOr(String) })])`
   - `_tag` at flat root: `{ type: "select", members: ["A", "B"], required: true }`
   - `unionMeta["A"].common`: `{ required: true, type: "string", nullableOrUndefined: false, minLength: 1, maxLength: 255 }`
   - `unionMeta["B"].common`: `{ required: false, type: "string", nullableOrUndefined: "null" }`
   - `unionMeta["B"].nullableB`: `{ required: false, type: "number", nullableOrUndefined: "null" }`
   - `unionMeta["A"].b` undefined, `unionMeta["B"].a` undefined
   - Pin current flat `meta.common` resolution (last-write-wins via `Object.assign`)
   - `defaultsValueFromSchema(schema)` honors `withConstructorDefault(Effect.succeed(NonEmptyString255("aaaa")))` on branch A's `a`
10. `tagged-union-legacy-warning.test.ts` _(optional)_ — spy on `console.warn`, build a form with `S.Struct({ _tag: S.Literal("X"), ... })`, assert the deprecation warning fires exactly once. Build a second form with the same tag value, assert no second warning (the `legacyTagWarningEmittedFor` set is shared module state).

**Test 6 will need updating in Phase 3.** Tests 1–5 and 7–10 must remain green through every later phase.

`MetaOriginalCodecInvariant.test.ts` is **deleted in Phase 3** along with `originalCodec` itself. No replacement: tests 1, 8, 9 cover the meta shape; test 5 covers the validation pipeline that `originalCodec` used to feed.

## Phase 1 — File decomposition (no behavior change)

Final layout:

```
src/components/OmegaForm/
  meta/
    types.ts            # FieldMeta variants, MetaRecord, BaseFieldMeta
    createMeta.ts       # AST → MetaRecord walker
    defaults.ts         # defaultsValueFromSchema
    redacted.ts         # toFormSchema (Redacted → RedactedFromValue rewrite)
    legacyWarning.ts    # one-shot "use S.TaggedStruct" warning
  validation/
    localized.ts        # makeStandardSchemaV1Hooks + toLocalizedStandardSchemaV1
  persistency.ts        # storage policies, defaultValues priority resolution, deepMerge
  submit.ts             # handleSubmit + handleSubmitEffect, FormErrors, span/Effect pipeline
  errors.ts             # fieldMap registration, useErrorLabel, eHoc, OmegaErrorsInternal wiring
  hocs.ts               # fHoc helper
  types.ts              # OmegaConfig, OmegaFormReturn, OF, OmegaFormApi, FieldPath, NestedKeyOf, CachedFieldApi/State
  index.ts              # public exports (UNCHANGED)
  useOmegaForm.ts       # orchestration only, ~200 lines
  blockDialog.ts        # already isolated, stays as-is
  createUseFormWithCustomInput.ts  # already isolated, stays as-is
  onMountedWithCleanup.ts  # stays as-is
  getOmegaStore.ts         # stays as-is
  useRegisterField.ts      # stays as-is
  *.vue                    # component files unchanged in Phase 1
```

`OmegaFormStuff.ts` is deleted at the end of Phase 1. Its public re-exports continue from `index.ts` via the new module paths.

**Module dependency graph** (acyclic):

```
types.ts                         (no imports)
meta/types.ts                    (no imports)
meta/legacyWarning.ts            (no imports)
meta/redacted.ts                 → effect-app/Schema
meta/createMeta.ts               → meta/types.ts, meta/legacyWarning.ts
meta/defaults.ts                 → effect-app/Schema
validation/localized.ts          → effect-app/Schema
persistency.ts                   → meta/* (for MetaRecord typing only)
submit.ts                        → types.ts, meta/types.ts
errors.ts                        → types.ts, validation/localized.ts (only for trans typing)
hocs.ts                          → vue
useOmegaForm.ts                  → all of the above
```

Each non-`useOmegaForm.ts` file is < 250 lines as a hard target.

**Waiver: `types.ts` exceeds the budget.** The post-Phase-1 `types.ts` lands at ~750 lines, dominated by Volar-expanded `__VLS_*` helper types and the cached `FieldApi` / `FieldState` aliases that work around Volar's deep-instantiation behavior on TanStack vue-form's generic-heavy types. Splitting was considered (e.g. `types/api.ts` for TanStack-derived types, `types/props.ts` for component props) and rejected: Volar's type resolution is sensitive to how files declare-merge with `.vue` SFCs, and a split risks regressing the cached-alias workaround. The file is mostly type passthrough — no logic, no runtime cost — so the readability concern the budget exists to address does not apply. Revisit only if the cached aliases become unnecessary (e.g. after a TanStack vue-form release that makes Volar happy without the workaround).

**Public exports stay identical.** `index.ts` is the only file external code imports from. The internal `OmegaFormStuff` import that some tests use (`__tests__/test-union-meta.test.ts`, `__tests__/migration/schema-v4-migration.test.ts`) gets a one-line redirect to the new path or is updated to import from `./meta/createMeta` / `./meta/defaults` directly. Acceptable churn since these are local tests.

## Phase 2 — Slim `createMeta`

The walker becomes a single recursive function dispatching on AST kind. Target: ~200 lines (down from ~600).

Cases:

- **Struct** (`S.AST.isObjects`): walk `propertySignatures`. For each property, recurse with the property's parent path and inherited `required` / `nullableOrUndefined` flags.
- **Union** (`S.AST.isUnion`): classify once, then handle:
  - All non-null types are `Objects` → discriminated union. Extract `_tag` → produce `{ type: "select", members, required }` for the discriminator. Produce per-tag entries in `unionMeta`. Merge all branch fields into flat `meta` (last-write-wins on shared keys; pinned by test 9).
  - All non-null types are `Literal` → produce `{ type: "select", members: literals, required }`.
  - Single-element non-null union wrapping a `Literal` boolean → unwrap and recurse (current `unwrapSingleLiteralUnion` behavior).
  - One non-null type, others nullish → recurse with that type and `nullableOrUndefined` flag set.
  - Mixed (struct + array, etc.) → recurse on the first non-nullish type with the flag.
- **Array** (`S.AST.isArrays`):
  - Element is a struct → walk element propertySignatures, prefixing path with `parent.field` (no `[index]`; meta keys ignore array indices).
  - Element is primitive or array → produce `{ type: "multiple", members, rest, required, nullableOrUndefined }`.
- **Primitive leaf** (`S.AST.isString` / `isNumber` / `isBoolean` / `isDeclaration` of Date / fallback): produce typed leaf meta. Read filter checks once via `getCheckMetas` and apply min/max/length/int/format mappings.

Helper deletions in this phase:

- `getJsonSchemaAnnotation` — gone.
- `unwrapNestedUnions` collapses into the union case directly (it's a 6-line helper called once).
- `unwrapDeclaration` stays (used in many places).
- `unwrapSingleLiteralUnion` stays for the legacy `S.Struct({ _tag: S.Literal(...) })` deprecation path; deletion is gated on the optional Phase 4 legacy cleanup.

Deferred to Phase 3 (kept together because they share a consumer):

- `attachOriginalCodecs`, `toFieldCodec`, `fieldAstByPath`, the `originalCodec` field on `BaseFieldMeta`, and the per-field schema in `OmegaInput.vue` — all deleted in one commit so the type, the plumbing, and the consumer disappear together. ~80 line saving.

Email format detection: switch from `S.AST.resolveTitle(property) === "Email"` (a string-title hack) to `S.AST.resolveAt<string>("format")(property) === "email"`, the canonical v4 annotation read.

- `S.AST.resolveAt<A>(key)` is publicly exported from `effect/SchemaAST` (v4) — the typed annotation reader. It walks the last check's annotations, falling back to the AST's own annotations.
- Effect-app's `S.Email` already declares `format: "email"` in its annotations (see `packages/effect-app/src/Schema/email.ts:18`), so the swap is a one-line behavior-preserving change that also lets future formats (`"url"`, `"uuid"`, etc.) flow through automatically as effect-app schemas declare them.
- Add a test in `validation-localization.test.ts` (or a new `email-format.test.ts`) using `S.Email` and asserting `meta.x.format === "email"` — this becomes a regression net.

Other v4 first-class annotation reads OmegaForm could surface (e.g., `brands`, `identifier`) are deliberately deferred. They're not needed by current consumers; surfacing them is a separate feature decision, not a refactor concern.

The two existing top-level entry points — `metadataFromAst` for root-level and `createMeta` for nested — collapse into one. Root-level union handling becomes "the recursive function happened to start at a Union AST node" rather than a special case.

Tests 1, 3, 8, 9, 10 must stay green. Test 9 in particular pins both `unionMeta` shape AND flat-`meta` last-write-wins resolution, which is the most likely accidental-change site.

## Phase 3 — Centralize validation, delete the workarounds

Changes in `useOmegaForm.ts` (now ~200 lines after Phase 1):

- Build the form-level validator with `toLocalizedStandardSchemaV1(formCompatibleSchema, trans)`. `trans` comes from `useIntl()` called once at the top of the composable.
- Delete the `errorMap.onSubmit` clearing watcher (was lines 988–1004).
- Delete the dead `// await form.validateAllFields("blur")` line and its comment (line 929–930).

Changes in `OmegaInput.vue`:

- Delete the `schema` computed (which built per-field localized StandardSchema from `meta.originalCodec`).
- Pass `validators` through unchanged from props (no `onSubmit: schema` injection).
- Delete the `fieldKey` computed and the `:key="fieldKey"` binding. Field stays mounted across meta changes.
- Delete the `useIntl()` call (no longer needed; localization is at form level).

Changes in `OmegaInternalInput.vue`:

- Delete the `errorMap.onSubmit` reset in `handleChange` (line 152).
- The error-reading code (`formFieldMeta.value[props.field.name]?.errors`) stays — TanStack still distributes form-level errors onto fields by issue path. Verified via test 6.

Changes in `meta/types.ts` and `meta/createMeta.ts`:

- Delete `originalCodec` from `BaseFieldMeta`.
- Delete `attachOriginalCodecs`, `toFieldCodec`, `fieldAstByPath` from `createMeta` (deferred from Phase 2 so the type, plumbing, and consumer all land in one commit).

Test changes:

- `MetaOriginalCodecInvariant.test.ts` — delete.
- `submit-error-clear.test.ts` (test 6) — rewrite to assert the new behavior: submit-fail → both branch fields show errors → type into one field → that field revalidates against current state, sibling field also revalidates against current state. The watcher's hand-rolled clear is gone; TanStack does it via revalidation.

Tests 1, 2, 3, 4, 5, 7, 8, 9, 10 must stay green.

## Phase 4 — Cleanup

Independent small fixes that fall in scope of the refactor without expanding it:

- Replace the hardcoded German confirm dialog in `blockDialog.ts:26` (`"Es sind ungespeicherte Änderungen vorhanden. Wirklich schließen?"`) with a `trans("form.unsaved_changes_confirm")` lookup. Add a default English message via `formatMessage`'s `defaultMessage`. Add `form.unsaved_changes_confirm` to the German storybook decorator translations.
- Drop the `"deprecated: use defaultValuesPriority"` and `"please use defaultItems instead"` string-typed deprecation fields. They've been deprecated long enough; replace with hard removal. Search `apps/` for usages first; if any, file a follow-up issue and keep them one more cycle.
- Drop the legacy `<slot name="field" />` on `OmegaArray.vue` (line 35–38). Same usage check as above.
- Optionally finish manual `_tag` deprecation by deleting `unwrapSingleLiteralUnion` and the legacy detection branch. Gated behind a separate sweep of consuming apps; not blocking.

Each Phase 4 item is a separate commit. None depend on each other.

## Public API surface

Unchanged. `index.ts` re-exports the same names from new module paths. Verified by:

- Existing `__tests__/OmegaForm/*.ts` continue to pass without imports being touched (where they import from `../src/components/OmegaForm`)
- `__tests__/OmegaForm.test.ts` imports `generateMetaFromSchema, type MetaRecord` from `../src/components/OmegaForm` — still works
- `__tests__/test-union-meta.test.ts` imports from `../src/components/OmegaForm/OmegaFormStuff` — gets updated to the new module path (one-line change per test file)

## Risks and how we catch them

| Risk                                                                                              | Mitigation                                                                                                                         |
| ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Phase 2 changes some edge case in meta shape                                                      | Tests 1, 8, 9 pin the most-used permutations. Storybook visual diff for the Meta, FormTaggedUnion, RootLevelTaggedUnion stories.   |
| Phase 3 changes how errors clear after submit                                                     | Test 6 is rewritten with the new behavior — change is deliberate and reviewed.                                                     |
| Per-field schema deletion breaks an app that relied on TanStack's per-field `validators.onChange` | Per-field validators passed via `<form.Input :validators="...">` still work. Only the auto-injected `onSubmit: schema` is removed. |
| Some app attached a `jsonSchema` annotation expecting it to flow into form behavior               | Loud failure (constraint missing) rather than silent. Release note advising "move constraints onto the schema or use input props." |
| Storybook stories depend on internal imports                                                      | Stories import from `../../src` (the package entry) — unaffected by internal moves.                                                |

## Order of operations

1. Phase 0 tests committed first, all green.
2. Phase 1 moves files, all Phase 0 tests green, public API unchanged. **Single commit per module move** if possible; the `OmegaFormStuff.ts` deletion lands last after every consumer is updated.
3. Phase 2 slimmed `createMeta`, tests 1/3/8/9/10 stay green.
4. Phase 3 deletes `originalCodec`, deletes the workaround watcher, rewrites test 6, removes the per-field schema in `OmegaInput.vue`. `MetaOriginalCodecInvariant.test.ts` is deleted in this commit.
5. Phase 4 cleanup commits, one per item.

Each phase ends with `pnpm test:run` green and a manual smoke check on the four most behavior-loaded stories: Meta, FormTaggedUnion, RootLevelTaggedUnion, ProgrammaticallyHandleSubmitCheckErrors.

## Out of scope (deferred)

- Migrating off TanStack Form
- Decoupling rendering from Vuetify (`OmegaInputVuetify` dispatch via slots / explicit registry)
- Replacing the `jsonSchema` path with an `omega` annotation namespace (only do this if a real need surfaces)
- Surfacing additional v4-native annotations (`brands`, `identifier`) as `FieldMeta` keys — separate feature decision; current consumers don't need them.

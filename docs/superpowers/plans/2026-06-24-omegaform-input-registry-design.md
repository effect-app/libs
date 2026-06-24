# OmegaForm — Typed input registry (design spec)

## Problem

Today, providing a custom input means either:
- the per-instance `#default` slot of `form.Input` (fine for one-offs, no reuse), or
- `omegaConfig.input`, which replaces the **whole** `OmegaInput` and forces you to re-delegate all the machinery (Field wiring, meta, registerField, errors, `fieldType`, `handleChange`) — hence the "zozzeria" wrapper that re-renders `OmegaInputVuetify` while rewriting props.

The leaf renderer (`OmegaInputVuetify`) is hardcoded inside `OmegaInternalInput` and is a closed `v-if` whitelist on `type`. There is no clean, reusable, typed way to say "for this `type`, render this component".

## Goal

A reusable, type-safe extension point that keeps all of `OmegaInternalInput`'s machinery, lets you:
1. register a component for a **new** `type`,
2. **override** a built-in `type`'s renderer,
3. **swap** the whole leaf renderer (different UI library),

and makes a registered custom `type` **TS-valid** (no manual `TypeProps` widening), while an *unregistered* custom `type` is a TS error.

Also folds in a tiny cleanup (point 2): `validators` is forwarded to `OmegaInternalInput` but never read there — remove the redundant forwarding + prop.

## Public API (consumer)

`omegaConfig` (3rd arg of `useOmegaForm`) gains:

```ts
inputs?:   Record<string, Component>  // per-type override/extension
renderer?: Component                  // replaces the default leaf renderer (fallback)
```

Registered components and the renderer receive the **same** contract `OmegaInputVuetify` gets:

```ts
defineProps<VuetifyInputProps<From, Name>>()  // { inputProps, field, state }
// (re-export VuetifyInputProps publicly, possibly aliased OmegaRendererProps)
```

Usage:

```ts
const form = useOmegaForm(
  schema,
  { defaultValues, onSubmit },              // 2nd: tanstack form options
  { inputs: { rating: RatingInput } }       // 3rd: omegaConfig
)
```
```vue
<form.Input name="score" type="rating" />   <!-- TS-valid because "rating" ∈ keyof inputs -->
```

## Resolution chain (runtime)

In `OmegaInternalInput`, one computed:

```
renderComponent = inputs?.[fieldType] ?? renderer ?? (vuetified ? OmegaInputVuetify : undefined)
```

Precedence: `#default` slot (per-instance) → `inputs[fieldType]` (per-type) → `renderer` (whole) → `OmegaInputVuetify` (built-in + catch-all).

`fieldType` is the explicit `type=` or the schema-derived type, so the registry matches both (e.g. `inputs: { string: ... }` overrides every auto-derived string field).

### Behavior cases
- A. nothing configured, built-in type → `OmegaInputVuetify` (unchanged).
- B. new type registered (`{ rating }`, `type="rating"`) → `RatingInput`.
- C. override built-in (`{ select: MySelect }` / `{ string: MyText }`) → custom, by `type=` or auto-derived.
- D. registry present but not for this field → falls back to built-in.
- E. `renderer` set → all types go through it (it wraps + `v-else` OmegaInputVuetify for the rest).
- F. both → `inputs[type] ?? renderer ?? built-in`.
- G. unhandled type, nothing registered → built-in catch-all (text + warn) [from #807].
- H. per-instance `#default` slot → wins over everything.

## Typed registry (the `TypeProps` inference)

`useOmegaForm` infers the allowed `type` union from the keys of `omegaConfig.inputs`:

```ts
export const useOmegaForm = <
  From, To,
  TInputs extends Record<string, Component> = {}
>(
  schema: S.Codec<To, From>,
  tanstackFormOptions?: NoInfer<FormProps<From, To>>,
  omegaConfig?: OmegaConfig<To> & { inputs?: TInputs }
): OmegaFormReturn<From, To, TypePropsFromInputs<TInputs>> => ...
```

where `TypePropsFromInputs<TInputs>` widens `DefaultTypeProps` with `type?: keyof TInputs & string` (no `options` requirement for custom types). `OmegaFormReturn.Input` already threads `TypeProps`, so `<form.Input type="rating">` becomes valid only when `rating ∈ keyof TInputs`.

- Built-in `TypeOverride` types remain valid without registering.
- Overriding a built-in (`inputs.select`) doesn't change the type union (`select` already valid) — only the renderer.
- Unregistered custom type → TS error; runtime still degrades to catch-all (text + warn).

**Risk / hardest part:** preserving the *literal* keys of `inputs` through inference. `omegaConfig?: OmegaConfig<To> & { inputs?: TInputs }` must not widen `TInputs` to `Record<string, Component>`. May need a `const` type param or careful intersection so `{ rating: RatingInput }` infers `TInputs = { rating: ... }` (keys preserved), not `Record<string, Component>`. Validate with a typings test before building the rest.

## Internal changes (4 files)

1. **`types.ts`** — `OmegaConfig<T>`: add `inputs?`, `renderer?` (import `Component` from vue); replace the legacy `input?: any` story (keep working / deprecate separately). `OF<From, To>`: add `inputs?`, `renderer?` so `OmegaInput` can read them off `props.form`.
2. **`useOmegaForm.ts:170`** — attach `inputs: omegaConfig?.inputs`, `renderer: omegaConfig?.renderer` to `formWithExtras` (like `i18nNamespace`). Add the `TInputs` generic + `TypePropsFromInputs`.
3. **`OmegaInput.vue:54`** — forward `inputs: props.form.inputs`, `renderer: props.form.renderer` via `internalInputProps`. (Same edit also removes `validators` here — point 2.)
4. **`OmegaInternalInput.vue`** — declare `inputs?`, `renderer?` props; add `renderComponent` computed; replace the hardcoded `<OmegaInputVuetify v-if="vuetified">` block with `<component :is="renderComponent" v-if="renderComponent" v-bind="{ ...attrsWithoutClass, ...inputProps, class }">` (keep the `#label` slot pass-through). Remove the unused `validators?` prop + its `withDefaults` entry — point 2.

## Out of scope / follow-ups
- Deprecating the coarse `omegaConfig.input` (whole-OmegaInput replacement) — separate.
- `stories/Commands/helpers.ts` `@ts-nocheck` removal (tracked in #807).

## Testing
- Unit: register a type → renders the custom component with `{ inputProps, field, state }`; override a built-in → custom wins; `renderer` set → used for non-registered types; nothing registered → built-in unchanged; per-instance slot still wins.
- Typings test: `type="rating"` valid iff `rating` registered; unregistered/typo → TS error; built-ins always valid.

## Base branch
TBD: from `main` (independent) vs from `omegaform-native-input-types` (fallback already has catch-all/`typeOverrides`). Leaning `main` for an isolated PR; the catch-all is not required for the registry (registered types bypass it).

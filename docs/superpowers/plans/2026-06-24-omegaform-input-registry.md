# OmegaForm Typed Input Registry — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let consumers register custom input components per `type` (and swap the whole leaf renderer) via `omegaConfig`, type-safely, without reimplementing the input pipeline.

**Architecture:** `omegaConfig.inputs` (map `type → Component`) and `omegaConfig.renderer` (whole-renderer override) are attached to the form object and forwarded to `OmegaInternalInput`, which resolves `inputs[fieldType] ?? renderer ?? OmegaInputVuetify` and renders it with the existing `{ inputProps, field, state }` contract. `useOmegaForm` infers the `inputs` keys into `TypeProps` so a registered custom `type` is TS-valid.

**Tech Stack:** Vue 3 `<script setup>` SFCs, TypeScript 6, `@tanstack/vue-form`, Vitest (`@vue/test-utils`, `expectTypeOf`), `effect-app/Schema`.

## Global Constraints
- Package: `@effect-app/vue-components`. Changeset required (`patch`).
- Verify types with `pnpm --filter @effect-app/vue-components check` (vue-tsc, includes stories + src).
- Run tests with `pnpm --filter @effect-app/vue-components test:run <file>`.
- Format touched files: `pnpm exec dprint fmt --config ./dprint.jsonc <paths>` (stories are out of dprint scope).
- Base branch: `main` (has #805's explicit contract). Independent of PR #807.
- Keep the existing per-instance `#default` slot and `omegaConfig.input` working (do not remove).
- Contract type for custom components: `VuetifyInputProps<From, Name>` from `./InputProps` = `{ inputProps, field, state }`.

---

### Task 1: Typed-inference risk gate (`TypeProps` from `inputs` keys)

This is the highest-risk piece — validate it before building the runtime. If the inference cannot be made to work with `const` type params, STOP and switch to the runtime-only fallback (see end of task), then continue with Tasks 2–4 using `inputs?: Record<string, Component>` and no `TypeProps` inference.

**Files:**
- Modify: `src/components/OmegaForm/types.ts` (add `Component` import, `inputs?`/`renderer?` on `OmegaConfig`, `CustomTypeProps`/`TypePropsFor` helpers)
- Modify: `src/components/OmegaForm/useOmegaForm.ts:35-47` (add `const Cfg` type param + return `TypePropsFor<...>`)
- Test: `__tests__/OmegaForm/InputRegistryTypes.test-d.ts` (typings) + `__tests__/OmegaForm/fixtures/registry-typecheck.vue` (vue-tsc smoke)

**Interfaces:**
- Produces: `OmegaConfig<T>.inputs?: Record<string, Component>`, `OmegaConfig<T>.renderer?: Component`; `TypePropsFor<TInputs>`; `useOmegaForm<From, To, const Cfg>(schema, opts?, omegaConfig?: Cfg): OmegaFormReturn<From, To, TypePropsFor<InputsOf<Cfg>>>`.

- [ ] **Step 1: Write the failing typings test**

`__tests__/OmegaForm/InputRegistryTypes.test-d.ts`:
```ts
import { describe, expectTypeOf, it } from "vitest"
import type { TypePropsFor } from "../../src/components/OmegaForm/types"

describe("TypePropsFor", () => {
  it("adds registered keys as allowed `type`", () => {
    type R = TypePropsFor<{ rating: unknown; color: unknown }>
    expectTypeOf<{ type: "rating" }>().toMatchTypeOf<R>()
    expectTypeOf<{ type: "color" }>().toMatchTypeOf<R>()
    // built-ins still allowed
    expectTypeOf<{ type: "select"; options: { title: string; value: unknown }[] }>().toMatchTypeOf<R>()
  })

  it("allows only built-ins when nothing is registered", () => {
    type R = TypePropsFor<{}>
    expectTypeOf<{ type: "select"; options: { title: string; value: unknown }[] }>().toMatchTypeOf<R>()
    // @ts-expect-error "rating" is not a built-in type
    const _bad: R = { type: "rating" }
    void _bad
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @effect-app/vue-components test:run InputRegistryTypes` (and `pnpm --filter @effect-app/vue-components check`)
Expected: FAIL / type error — `TypePropsFor` not exported.

- [ ] **Step 3: Implement the helper types + config fields**

In `src/components/OmegaForm/types.ts`, add to the `vue` import: `Component`. Add the `inputs`/`renderer` fields inside `OmegaConfig<T>` (next to `input?: any`):
```ts
  /** Per-type input components; override/extend the built-in renderer per `type`. */
  inputs?: Record<string, Component>
  /** Replaces the default leaf renderer (the fallback for any non-registered type). */
  renderer?: Component
```
Add near `DefaultTypeProps`:
```ts
export type CustomTypeProps<TInputs> = keyof TInputs extends never ? never
  : {
    type: keyof TInputs & string
    options?: { title: string; value: unknown }[]
  }

export type TypePropsFor<TInputs> = DefaultTypeProps | CustomTypeProps<TInputs>
```

- [ ] **Step 4: Run the typings test to verify it passes**

Run: `pnpm --filter @effect-app/vue-components test:run InputRegistryTypes`
Expected: PASS.

- [ ] **Step 5: Thread inference through `useOmegaForm` + vue-tsc smoke**

Change the signature in `useOmegaForm.ts:35-47`:
```ts
export const useOmegaForm = <
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  From extends Record<PropertyKey, any>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  To extends Record<PropertyKey, any>,
  const Cfg extends OmegaConfig<To> = OmegaConfig<To>
>(
  schema: S.Codec<To, From>,
  tanstackFormOptions?: NoInfer<FormProps<From, To>>,
  omegaConfig?: Cfg
): OmegaFormReturn<From, To, TypePropsFor<Cfg extends { inputs?: infer I } ? I : {}>> => {
```
(import `TypePropsFor` is already in the same file's module.)

Create the vue-tsc smoke `__tests__/OmegaForm/fixtures/registry-typecheck.vue`:
```vue
<template>
  <component :is="form.Form">
    <component :is="form.Input" name="x" type="rating" />
    <!-- @vue-expect-error "unregistered" is not a registered/built-in type -->
    <component :is="form.Input" name="x" type="unregistered" />
  </component>
</template>
<script setup lang="ts">
import * as S from "effect-app/Schema"
import { defineComponent, h } from "vue"
import { useOmegaForm } from "../../../src"

const RatingStub = defineComponent({ setup: () => () => h("div") })
const form = useOmegaForm(S.Struct({ x: S.String }), undefined, { inputs: { rating: RatingStub } })
</script>
```

- [ ] **Step 6: Run `check` to validate the inference end-to-end**

Run: `pnpm --filter @effect-app/vue-components check`
Expected: PASS — `type="rating"` compiles; the `@vue-expect-error` line correctly catches `type="unregistered"`. If vue-tsc instead reports the `@vue-expect-error` as unused (meaning `type="unregistered"` was wrongly accepted) OR errors on `type="rating"`, the inference failed → **abandon the typed path**: revert `useOmegaForm` to its original signature, make `inputs?: Record<string, Component>` the public shape with no inference, delete this fixture, and proceed with Tasks 2–4 (custom `type=` will require manual `TypeProps` widening, documented in the changeset).

- [ ] **Step 7: Commit**

```bash
git add src/components/OmegaForm/types.ts src/components/OmegaForm/useOmegaForm.ts __tests__/OmegaForm/InputRegistryTypes.test-d.ts __tests__/OmegaForm/fixtures/registry-typecheck.vue
git commit -m "feat(vue-components): infer omegaConfig.inputs keys into OmegaForm TypeProps"
```

---

### Task 2: Runtime resolution + rendering

**Files:**
- Modify: `src/components/OmegaForm/types.ts` (add `inputs?`/`renderer?` to `interface OF`)
- Modify: `src/components/OmegaForm/useOmegaForm.ts:170` (attach to `formWithExtras`)
- Modify: `src/components/OmegaForm/OmegaInput.vue:54` (forward via `internalInputProps`)
- Modify: `src/components/OmegaForm/OmegaInternalInput.vue` (declare props, `renderComponent` computed, render `<component :is>`)
- Test: `__tests__/OmegaForm/InputRegistry.test.ts`

**Interfaces:**
- Consumes: `OmegaConfig.inputs/renderer` (Task 1); `VuetifyInputProps<From, Name>`.
- Produces: `OmegaInternalInput` props `inputs?: Record<string, Component>`, `renderer?: Component`; resolution `inputs[fieldType] ?? renderer ?? (vuetified ? OmegaInputVuetify : undefined)`.

- [ ] **Step 1: Write the failing test**

`__tests__/OmegaForm/InputRegistry.test.ts`:
```ts
import { mount } from "@vue/test-utils"
import * as S from "effect-app/Schema"
import { describe, expect, it } from "vitest"
import { defineComponent } from "vue"
import { useOmegaForm } from "../../src/components/OmegaForm"
import OmegaIntlProvider from "../OmegaIntlProvider.vue"

const VTextField = defineComponent({
  props: { modelValue: { type: String, default: "" } },
  emits: ["update:modelValue"],
  template: `<input v-bind="$attrs" :value="modelValue" @input="$emit('update:modelValue', $event.target.value)" />`
})

const RatingInput = defineComponent({
  props: { inputProps: { type: Object, required: true }, field: { type: Object, required: true }, state: { type: Object, required: true } },
  template: `<div data-testid="rating">{{ inputProps.label }}</div>`
})

const mountWith = (omegaConfig: any, type: string, name = "x") =>
  mount({
    components: { OmegaIntlProvider },
    template: `
      <OmegaIntlProvider>
        <component :is="form.Form">
          <component :is="form.Input" :name="'${name}'" :type="'${type}'" />
        </component>
      </OmegaIntlProvider>`,
    setup() {
      const form = useOmegaForm(S.Struct({ x: S.String }), { defaultValues: { x: "" } }, omegaConfig)
      return { form }
    }
  }, { global: { components: { VTextField } } })

describe("OmegaForm input registry", () => {
  it("renders the registered component for a custom type", async () => {
    const wrapper = mountWith({ inputs: { rating: RatingInput } }, "rating")
    await wrapper.vm.$nextTick()
    expect(wrapper.find("[data-testid=\"rating\"]").exists()).toBe(true)
  })

  it("overrides a built-in type when registered", async () => {
    const wrapper = mountWith({ inputs: { string: RatingInput } }, "string")
    await wrapper.vm.$nextTick()
    expect(wrapper.find("[data-testid=\"rating\"]").exists()).toBe(true)
  })

  it("falls back to the built-in renderer when no entry matches", async () => {
    const wrapper = mountWith({ inputs: { rating: RatingInput } }, "string")
    await wrapper.vm.$nextTick()
    expect(wrapper.find("[data-testid=\"rating\"]").exists()).toBe(false)
    expect(wrapper.find("input").exists()).toBe(true)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @effect-app/vue-components test:run InputRegistry`
Expected: FAIL — registered component not rendered (still hits `OmegaInputVuetify`).

- [ ] **Step 3: Add `inputs`/`renderer` to `OF` and attach in `useOmegaForm`**

In `types.ts`, inside `export interface OF<From, To>`, add:
```ts
  inputs?: Record<string, Component>
  renderer?: Component
```
In `useOmegaForm.ts:170`, add to the `Object.assign(form, { ... })` literal:
```ts
    inputs: omegaConfig?.inputs,
    renderer: omegaConfig?.renderer,
```

- [ ] **Step 4: Forward from `OmegaInput`**

In `OmegaInput.vue:54`, extend `internalInputProps`:
```ts
const internalInputProps = computed(() => ({
  label: props.label,
  validators: props.validators,
  type: props.type,
  options: props.options,
  inputs: props.form.inputs,
  renderer: props.form.renderer
}))
```

- [ ] **Step 5: Resolve + render in `OmegaInternalInput`**

In `OmegaInternalInput.vue` script, add `Component` to the vue import, add props to the `defineProps` object:
```ts
    inputs?: Record<string, Component>
    renderer?: Component
```
(and `inputs: undefined, renderer: undefined` to `withDefaults`). After `fieldType` add:
```ts
const renderComponent = computed(() =>
  props.inputs?.[fieldType.value]
  ?? props.renderer
  ?? (vuetified ? OmegaInputVuetify : undefined)
)
```
Replace the `<OmegaInputVuetify v-if="vuetified" ...>` block in the template with:
```vue
<component
  :is="renderComponent"
  v-if="renderComponent"
  v-bind="{ ...attrsWithoutClass, ...inputProps, class: props.inputClass }"
>
  <template
    v-if="$slots.label"
    #label="labelProps"
  >
    <slot
      name="label"
      v-bind="labelProps"
    />
  </template>
</component>
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm --filter @effect-app/vue-components test:run InputRegistry`
Expected: PASS (3/3).

- [ ] **Step 7: Typecheck + commit**

```bash
pnpm --filter @effect-app/vue-components check
git add src/components/OmegaForm/types.ts src/components/OmegaForm/useOmegaForm.ts src/components/OmegaForm/OmegaInput.vue src/components/OmegaForm/OmegaInternalInput.vue __tests__/OmegaForm/InputRegistry.test.ts
git commit -m "feat(vue-components): resolve omegaConfig.inputs/renderer in OmegaInternalInput"
```

---

### Task 3: Export the renderer contract publicly

**Files:**
- Modify: `src/components/OmegaForm/index.ts` (re-export `VuetifyInputProps` as `OmegaRendererProps`)
- Test: extend `__tests__/OmegaForm/InputRegistryTypes.test-d.ts`

**Interfaces:**
- Produces: public `OmegaRendererProps<From, Name>` = `VuetifyInputProps<From, Name>`.

- [ ] **Step 1: Write the failing typings assertion**

Append to `__tests__/OmegaForm/InputRegistryTypes.test-d.ts`:
```ts
import type { OmegaRendererProps } from "../../src/components/OmegaForm"
import type { VuetifyInputProps } from "../../src/components/OmegaForm/InputProps"

it("exposes OmegaRendererProps", () => {
  expectTypeOf<OmegaRendererProps<{ x: string }, "x">>().toEqualTypeOf<VuetifyInputProps<{ x: string }, "x">>()
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @effect-app/vue-components check`
Expected: FAIL — `OmegaRendererProps` not exported.

- [ ] **Step 3: Add the re-export**

In `src/components/OmegaForm/index.ts`, add:
```ts
export type { VuetifyInputProps, VuetifyInputProps as OmegaRendererProps } from "./InputProps"
```

- [ ] **Step 4: Run check to verify it passes**

Run: `pnpm --filter @effect-app/vue-components check`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/OmegaForm/index.ts __tests__/OmegaForm/InputRegistryTypes.test-d.ts
git commit -m "feat(vue-components): export OmegaRendererProps (renderer/registry contract)"
```

---

### Task 4: Remove redundant `validators` forwarding (cleanup, point 2)

`validators` is applied at `OmegaInput` on `form.Field`; `OmegaInternalInput` declares it but never reads it. Remove the redundant forwarding + prop.

**Files:**
- Modify: `src/components/OmegaForm/OmegaInput.vue:54` (drop `validators` from `internalInputProps`)
- Modify: `src/components/OmegaForm/OmegaInternalInput.vue` (drop the `validators?` prop + its `withDefaults` entry; drop the now-unused `FieldValidators` import if unused)
- Test: `__tests__/OmegaForm/InputAttributes.test.ts` already asserts `input.attributes("validators")` is undefined — reuse as the guard.

**Interfaces:**
- Consumes: existing `InputAttributes.test.ts` "does not forward the internal form object…" test (asserts no `validators` DOM attr).

- [ ] **Step 1: Confirm the guard test passes today**

Run: `pnpm --filter @effect-app/vue-components test:run InputAttributes`
Expected: PASS (baseline).

- [ ] **Step 2: Remove the forwarding + prop**

In `OmegaInput.vue:54`, delete the `validators: props.validators,` line from `internalInputProps`.
In `OmegaInternalInput.vue`, delete `validators?: FieldValidators<From>` from `defineProps`, delete `validators: undefined,` from `withDefaults`, and remove `FieldValidators` from the `./types` import if it is no longer referenced.

- [ ] **Step 3: Run typecheck + the guard test**

Run: `pnpm --filter @effect-app/vue-components check && pnpm --filter @effect-app/vue-components test:run InputAttributes`
Expected: PASS — validators still not on the DOM; field validators still applied via `form.Field` (unchanged).

- [ ] **Step 4: Commit**

```bash
git add src/components/OmegaForm/OmegaInput.vue src/components/OmegaForm/OmegaInternalInput.vue
git commit -m "refactor(vue-components): drop redundant validators forwarding to OmegaInternalInput"
```

---

### Task 5: Changeset + a usage story

**Files:**
- Create: `.changeset/omegaform-input-registry.md`
- Create: `stories/OmegaForm/InputRegistry.vue` + register in the stories index (follow the pattern of a sibling story)

- [ ] **Step 1: Write the changeset**

`.changeset/omegaform-input-registry.md`:
```md
---
"@effect-app/vue-components": patch
---

OmegaForm: register custom input components per `type` via `omegaConfig.inputs` (and swap the whole leaf renderer via `omegaConfig.renderer`). Registered components receive the `OmegaRendererProps` contract (`{ inputProps, field, state }`) and a registered key makes `<form.Input type="...">` type-valid. Resolution order: per-instance `#default` slot → `inputs[type]` → `renderer` → built-in. Also drops the redundant `validators` forwarding to the internal input.
```

- [ ] **Step 2: Add a story exercising Cases B + C**

Create `stories/OmegaForm/InputRegistry.vue` mirroring an existing OmegaForm story: a `useOmegaForm(..., {}, { inputs: { rating: RatingInput } })` with `<form.Input type="rating" />` and an overridden built-in. Register it the same way sibling `.vue` stories are wired into the storybook config.

- [ ] **Step 3: Typecheck + build storybook**

Run: `pnpm --filter @effect-app/vue-components check` and (Node ≥22.12) `pnpm --filter @effect-app/vue-components build-storybook`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add .changeset/omegaform-input-registry.md stories/OmegaForm/InputRegistry.vue
git commit -m "docs(vue-components): changeset + story for the input registry"
```

---

## Self-review notes
- Spec coverage: inputs/renderer API (T2), resolution chain + all cases (T2 tests B/C/D; slot precedence H is existing behavior, unchanged; G covered by #807), typed inference (T1), contract export (T3), validators cleanup (T4), changeset+story (T5). ✓
- Risk: T1 Step 6 has an explicit fallback if `const`-param inference fails.
- Type consistency: `TypePropsFor`, `inputs?: Record<string, Component>`, `renderComponent`, `OmegaRendererProps` used consistently across tasks.
- Open: `omegaConfig.input` (legacy whole-OmegaInput swap) left intact; deprecation is a separate follow-up.

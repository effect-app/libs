# OmegaForm Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Decompose `OmegaFormStuff.ts` (1422 lines) and `useOmegaForm.ts` (1022 lines) into focused modules, slim the schema-meta extraction, centralize validation onto a single localized form-level schema, and remove dead workarounds. Public API unchanged.

**Architecture:** Five sequential phases. Phase 0 writes characterization tests against current behavior. Phase 1 splits files by concern (no behavior change). Phase 2 slims `createMeta` and adopts the v4 `format` annotation for email detection. Phase 3 centralizes validation and deletes the per-field schema and the errorMap-clearing workaround. Phase 4 is independent cleanup. Each task makes one self-contained, atomically committable change.

**Tech Stack:**
- TypeScript, Vue 3 (`<script setup>` + `defineComponent`)
- Effect 4.0.0-beta.56 (`effect-app/Schema`, `effect-app` runtime)
- TanStack vue-form
- Vitest + @vue/test-utils (test runner)
- Storybook 10 (manual smoke-check during refactor)

**Working tree note:** All work happens on branch `OmegaFormRefactor` in `/Users/davidedipumpo/Projects/effect-app/libs/packages/vue-components`. Run commands from that directory unless otherwise specified.

**Key file paths (current code):**
- `src/components/OmegaForm/OmegaFormStuff.ts` — 1422 lines, the meta + helper grab-bag.
- `src/components/OmegaForm/useOmegaForm.ts` — 1022 lines, the composable.
- `src/components/OmegaForm/OmegaInput.vue` — currently runs **two** localized per-field schemas via `composeStandardSchemas`.
- `src/components/OmegaForm/OmegaInternalInput.vue` — clears `errorMap.onSubmit` on every change.
- `src/components/OmegaForm/index.ts` — public surface; do **not** widen.
- `__tests__/OmegaIntlProvider.vue` — test harness that provides `useIntl`.
- `__tests__/OmegaForm/*.test.ts` — existing per-feature tests.

**Naming note:** Earlier-session reads of the codebase reflected `originalCodec` / `attachOriginalCodecs` / `toFieldCodec`. The codebase has since renamed these to `originalSchema` / `attachOriginalSchemas` / `toFieldStandardSchema` and added `generateInputStandardSchemaFromFieldMeta` + a `composeStandardSchemas` wrapper in `OmegaInput.vue`. **All of this is what gets deleted in Phase 3.**

**Phase 0 discoveries that updated this plan (2026-04-27 execution):**

1. `makeStandardSchemaV1Hooks` and `toLocalizedStandardSchemaV1` **do not exist** in the current source. The localization currently lives inline inside `generateInputStandardSchemaFromFieldMeta` (`OmegaFormStuff.ts:1139–1273`), which generates per-field schemas, not a single form-level localized schema. Task 1.6 was originally written as a pure extraction; it has been rewritten to *create* the new hook functions while still extracting the existing `generateInputStandardSchemaFromFieldMeta`. The form-level localization the plan intends only materializes in Phase 3 Task 3.1.
2. `unionMeta` is populated **only when the schema's root AST is a Union**. Unions nested inside struct fields (e.g. `S.Struct({ union: S.NullOr(S.Union([...])) })`) leave `unionMeta` empty. Phase 0's `TaggedUnionNested.test.ts` pins this state with `expect(unionMeta["A"]).toBeUndefined()`. Task 2.4 (the union-handling unification) is where this gap is intentionally closed; the Phase 0 assertions are expected to flip there.
3. The legacy `_tag` deprecation warning in `metadataFromAst` is **dead code** — its guard `S.AST.isUnion(tagProp.type)` never matches `S.Struct({ _tag: S.Literal(...) })` in the current effect-app version (which produces a bare `Literal` AST, not a single-element Union). Phase 0's `TaggedUnionLegacyWarning.test.ts` pins the warning is never emitted. Task 1.2 still extracts the warning faithfully as dead code; new Task 4.5 audits and either fixes the guard or deletes the warning.

**Test command** (from `packages/vue-components/`):
```bash
pnpm test:run
```

**Smoke-check stories** (manual after each phase):
- `Components/OmegaForm/Meta`
- `Components/OmegaForm/FormTaggedUnion`
- `Components/OmegaForm/RootLevelTaggedUnion`
- `Components/OmegaForm/ProgrammaticallyHandleSubmitCheckErrors`
- `Components/OmegaForm/IntegerValidationGerman`

---

## Phase 0 — Characterization tests (write before any refactor)

Each task adds one test file. They must all pass against the **current** code before Phase 1 starts.

### Task 0.1: Meta extraction snapshot — port the Meta.vue story

**Files:**
- Create: `__tests__/OmegaForm/Meta.test.ts`

- [ ] **Step 1: Write the test**

```ts
// __tests__/OmegaForm/Meta.test.ts
import { S } from "effect-app"
import { describe, expect, it } from "vitest"
import { generateMetaFromSchema } from "../../src/components/OmegaForm/OmegaFormStuff"

const subStruct = {
  a: S.NullOr(S.String),
  b: S.UndefinedOr(S.Finite),
  c: S.NullishOr(S.Finite),
  d: S.String,
  e: S.Finite,
  f: S.Finite
}

const schema = S.Struct({
  ...subStruct,
  struct: S.Struct(subStruct),
  nullableStruct: S.NullOr(S.Struct(subStruct))
})

const expectedSubMeta = {
  a: { required: false, nullableOrUndefined: "null", type: "string" },
  b: { required: false, nullableOrUndefined: "undefined", type: "number" },
  c: { required: false, nullableOrUndefined: "undefined", type: "number" },
  d: { type: "string", required: false, nullableOrUndefined: false },
  e: { type: "number", required: true, nullableOrUndefined: false },
  f: { type: "number", required: true, nullableOrUndefined: false }
}

describe("Meta story characterization", () => {
  it("matches the rendered meta keys and values", () => {
    const { meta } = generateMetaFromSchema(schema)

    for (const [key, value] of Object.entries(expectedSubMeta)) {
      expect(meta[key as keyof typeof meta], `root.${key}`).toMatchObject(value)
      expect(meta[`struct.${key}` as keyof typeof meta], `struct.${key}`).toMatchObject(value)
      expect(meta[`nullableStruct.${key}` as keyof typeof meta], `nullableStruct.${key}`).toMatchObject(value)
    }
  })
})
```

- [ ] **Step 2: Run test to verify it passes against current code**

Run: `pnpm test:run __tests__/OmegaForm/Meta.test.ts`
Expected: 1 test passes.

- [ ] **Step 3: Commit**

```bash
git add __tests__/OmegaForm/Meta.test.ts
git commit -m "test(omegaform): characterize Meta story meta extraction"
```

---

### Task 0.2: defaultsValueFromSchema test

**Files:**
- Create: `__tests__/OmegaForm/Defaults.values.test.ts`

- [ ] **Step 1: Write the test**

```ts
// __tests__/OmegaForm/Defaults.values.test.ts
import { Effect, S } from "effect-app"
import { describe, expect, it } from "vitest"
import { defaultsValueFromSchema } from "../../src/components/OmegaForm/OmegaFormStuff"

describe("defaultsValueFromSchema", () => {
  it("extracts withConstructorDefault values", () => {
    const schema = S.Struct({
      name: S.String.pipe(S.withConstructorDefault(Effect.succeed("Bob")))
    })
    expect(defaultsValueFromSchema(schema)).toEqual({ name: "Bob" })
  })

  it("extracts withDecodingDefault on optionalKey", () => {
    const schema = S.Struct({
      flag: S.optionalKey(S.String).pipe(S.withDecodingDefault(Effect.succeed("on")))
    })
    expect(defaultsValueFromSchema(schema)).toEqual({ flag: "on" })
  })

  it("returns null for NullOr fields without explicit default", () => {
    const schema = S.Struct({
      x: S.NullOr(S.String)
    })
    expect(defaultsValueFromSchema(schema)).toEqual({ x: null })
  })

  it("returns undefined for UndefinedOr fields without explicit default", () => {
    const schema = S.Struct({
      x: S.UndefinedOr(S.Finite)
    })
    expect(defaultsValueFromSchema(schema)).toEqual({ x: undefined })
  })

  it("returns empty string for plain S.String at the leaf", () => {
    const schema = S.Struct({ x: S.String })
    expect(defaultsValueFromSchema(schema)).toEqual({ x: "" })
  })

  it("returns false for plain S.Boolean at the leaf", () => {
    const schema = S.Struct({ x: S.Boolean })
    expect(defaultsValueFromSchema(schema)).toEqual({ x: false })
  })

  it("preserves values passed via the record argument", () => {
    const schema = S.Struct({ x: S.String, y: S.String })
    expect(defaultsValueFromSchema(schema, { x: "preset" })).toEqual({ x: "preset", y: "" })
  })

  it("merges fields across union members, picking explicit defaults", () => {
    const schema = S.Union([
      S.TaggedStruct("A", { v: S.String.pipe(S.withConstructorDefault(Effect.succeed("a-default"))) }),
      S.TaggedStruct("B", { v: S.String, extra: S.String })
    ])
    const out = defaultsValueFromSchema(schema)
    expect(out.v).toBe("a-default")
    expect("extra" in out).toBe(true)
  })
})
```

- [ ] **Step 2: Run and verify**

Run: `pnpm test:run __tests__/OmegaForm/Defaults.values.test.ts`
Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add __tests__/OmegaForm/Defaults.values.test.ts
git commit -m "test(omegaform): characterize defaultsValueFromSchema"
```

---

### Task 0.3: Redacted form-schema rewrite test

**Files:**
- Modify: `__tests__/OmegaForm/RedactedMeta.test.ts` *(append cases — read it first to see the existing structure, do not duplicate)*

- [ ] **Step 1: Read existing file**

Run: `cat __tests__/OmegaForm/RedactedMeta.test.ts`

- [ ] **Step 2: Append the following cases inside the existing `describe(...)` block**

```ts
  it("toFormSchema rewrites NullOr(Redacted)", () => {
    const schema = S.Struct({
      secret: S.NullOr(S.Redacted(S.String))
    })
    const formSchema = toFormSchema(schema)
    // formSchema must accept a plain string (encoded side) for the secret field
    const decoded = S.decodeUnknownSync(formSchema)({ secret: "hello" })
    expect(decoded.secret).toBeDefined()
  })

  it("toFormSchema rewrites UndefinedOr(Redacted)", () => {
    const schema = S.Struct({
      secret: S.UndefinedOr(S.Redacted(S.String))
    })
    const formSchema = toFormSchema(schema)
    const decoded = S.decodeUnknownSync(formSchema)({ secret: "hello" })
    expect(decoded.secret).toBeDefined()
  })

  it("toFormSchema rewrites NullishOr(Redacted)", () => {
    const schema = S.Struct({
      secret: S.NullishOr(S.Redacted(S.String))
    })
    const formSchema = toFormSchema(schema)
    const decoded = S.decodeUnknownSync(formSchema)({ secret: "hello" })
    expect(decoded.secret).toBeDefined()
  })
```

Make sure the file imports `toFormSchema` from `../../src/components/OmegaForm/OmegaFormStuff` (add to existing imports if not already).

- [ ] **Step 3: Run and verify**

Run: `pnpm test:run __tests__/OmegaForm/RedactedMeta.test.ts`
Expected: all tests pass (including new ones).

- [ ] **Step 4: Commit**

```bash
git add __tests__/OmegaForm/RedactedMeta.test.ts
git commit -m "test(omegaform): characterize toFormSchema for nullable/undefined Redacted"
```

---

### Task 0.4: Validation localization hooks test

**Files:**
- Create: `__tests__/OmegaForm/ValidationLocalization.test.ts`

- [ ] **Step 1: Write the test**

```ts
// __tests__/OmegaForm/ValidationLocalization.test.ts
import { S } from "effect-app"
import { describe, expect, it } from "vitest"
import {
  generateMetaFromSchema,
  makeStandardSchemaV1Hooks,
  toLocalizedStandardSchemaV1
} from "../../src/components/OmegaForm/OmegaFormStuff"

const trans = (id: string, values?: Record<string, unknown>) => {
  if (!values || Object.keys(values).length === 0) return id
  return `${id}|${JSON.stringify(values)}`
}

describe("makeStandardSchemaV1Hooks — leaf hook", () => {
  const { leafHook } = makeStandardSchemaV1Hooks(trans)

  it("translates MissingKey", () => {
    expect(leafHook({ _tag: "MissingKey" } as any)).toBe("validation.empty")
  })

  it("translates InvalidType for string", () => {
    expect(leafHook({ _tag: "InvalidType", ast: S.String.ast } as any))
      .toBe("validation.empty")
  })

  it("translates InvalidType for number", () => {
    expect(
      leafHook({
        _tag: "InvalidType",
        ast: S.Finite.ast,
        actual: { _tag: "Some", value: NaN }
      } as any)
    ).toBe(`validation.number.expected|${JSON.stringify({ actualValue: "NaN" })}`)
  })

  it("translates InvalidType for boolean", () => {
    expect(leafHook({ _tag: "InvalidType", ast: S.Boolean.ast } as any))
      .toBe(`validation.not_a_valid|${JSON.stringify({ type: "boolean" })}`)
  })

  it("falls back for InvalidValue / Forbidden / OneOf", () => {
    expect(leafHook({ _tag: "InvalidValue" } as any)).toBe("validation.not_a_valid")
    expect(leafHook({ _tag: "Forbidden" } as any)).toBe("validation.not_a_valid")
    expect(leafHook({ _tag: "OneOf" } as any)).toBe("validation.not_a_valid")
  })

  it("honors annotation override messages", () => {
    expect(
      leafHook({ _tag: "InvalidValue", annotations: { message: "custom" } } as any)
    ).toBe("custom")
  })
})

describe("makeStandardSchemaV1Hooks — check hook", () => {
  const { checkHook } = makeStandardSchemaV1Hooks(trans)

  const filterIssue = (meta: Record<string, unknown>) =>
    ({ _tag: "Filter", filter: { annotations: { meta } } } as any)

  it("isMinLength === 1 → validation.empty", () => {
    expect(checkHook(filterIssue({ _tag: "isMinLength", minLength: 1 })))
      .toBe("validation.empty")
  })

  it("isMinLength > 1 → validation.string.minLength", () => {
    expect(checkHook(filterIssue({ _tag: "isMinLength", minLength: 5 })))
      .toBe(`validation.string.minLength|${JSON.stringify({ minLength: 5 })}`)
  })

  it("isMaxLength → validation.string.maxLength", () => {
    expect(checkHook(filterIssue({ _tag: "isMaxLength", maxLength: 10 })))
      .toBe(`validation.string.maxLength|${JSON.stringify({ maxLength: 10 })}`)
  })

  it("isInt → validation.integer.expected", () => {
    expect(checkHook(filterIssue({ _tag: "isInt" })))
      .toBe(`validation.integer.expected|${JSON.stringify({ actualValue: "NaN" })}`)
  })

  it("isGreaterThanOrEqualTo 0 → positive (inclusive)", () => {
    expect(checkHook(filterIssue({ _tag: "isGreaterThanOrEqualTo", minimum: 0 })))
      .toBe(`validation.number.positive|${JSON.stringify({ minimum: 0, isExclusive: true })}`)
  })

  it("isGreaterThanOrEqualTo N → min (inclusive)", () => {
    expect(checkHook(filterIssue({ _tag: "isGreaterThanOrEqualTo", minimum: 3 })))
      .toBe(`validation.number.min|${JSON.stringify({ minimum: 3, isExclusive: true })}`)
  })

  it("isGreaterThan 0 → positive (exclusive)", () => {
    expect(checkHook(filterIssue({ _tag: "isGreaterThan", exclusiveMinimum: 0 })))
      .toBe(`validation.number.positive|${JSON.stringify({ minimum: 0, isExclusive: false })}`)
  })

  it("isLessThanOrEqualTo → max (inclusive)", () => {
    expect(checkHook(filterIssue({ _tag: "isLessThanOrEqualTo", maximum: 10 })))
      .toBe(`validation.number.max|${JSON.stringify({ maximum: 10, isExclusive: true })}`)
  })

  it("isLessThan → max (exclusive)", () => {
    expect(checkHook(filterIssue({ _tag: "isLessThan", exclusiveMaximum: 10 })))
      .toBe(`validation.number.max|${JSON.stringify({ maximum: 10, isExclusive: false })}`)
  })
})

describe("toLocalizedStandardSchemaV1", () => {
  it("returns a working StandardSchemaV1 with localized messages", async () => {
    const schema = S.String.pipe(S.check(S.isMinLength(5)))
    const std = toLocalizedStandardSchemaV1(schema as any, trans)
    const result = await std["~standard"].validate("hi")
    expect((result as any).issues?.[0]?.message).toBe(
      `validation.string.minLength|${JSON.stringify({ minLength: 5 })}`
    )
  })
})

describe("S.Email format detection", () => {
  it("flags S.Email fields with format: 'email' on their meta", () => {
    const schema = S.Struct({ x: S.Email })
    const { meta } = generateMetaFromSchema(schema)
    // Phase 2 may shift this from title-based to format-annotation-based.
    // Either way, the meta exposes format === "email".
    expect((meta.x as any)?.format).toBe("email")
  })
})
```

- [ ] **Step 2: Run and verify**

Run: `pnpm test:run __tests__/OmegaForm/ValidationLocalization.test.ts`
Expected: all tests pass.

- [ ] **Step 3: Commit**

```bash
git add __tests__/OmegaForm/ValidationLocalization.test.ts
git commit -m "test(omegaform): characterize validation localization hooks"
```

---

### Task 0.5: Submit + Effect pipeline test

**Files:**
- Create: `__tests__/OmegaForm/SubmitEffect.test.ts`

- [ ] **Step 1: Write the test**

```ts
// __tests__/OmegaForm/SubmitEffect.test.ts
import { mount } from "@vue/test-utils"
import { Effect, Exit, S } from "effect-app"
import { defineComponent } from "vue"
import { describe, expect, it } from "vitest"
import OmegaIntlProvider from "../OmegaIntlProvider.vue"
// FormErrors is currently exported from useOmegaForm.ts but not re-exported
// via index.ts. Import directly. After Phase 1 Task 1.12 it will become a
// public export.
import { FormErrors, useOmegaForm } from "../../src/components/OmegaForm/useOmegaForm"

const mountForm = <T>(setupForm: () => T): T => {
  let captured: T | undefined
  const Inner = defineComponent({
    setup() {
      captured = setupForm()
      return {}
    },
    template: "<div></div>"
  })
  const Wrapper = defineComponent({
    components: { OmegaIntlProvider, Inner },
    template: "<OmegaIntlProvider><Inner /></OmegaIntlProvider>"
  })
  mount(Wrapper)
  if (!captured) throw new Error("setupForm did not return")
  return captured
}

describe("handleSubmitEffect", () => {
  it("succeeds with void on valid input (no checkErrors)", async () => {
    const form = mountForm(() =>
      useOmegaForm(
        S.Struct({ x: S.String.pipe(S.check(S.isMinLength(2))) }),
        { defaultValues: { x: "ok" }, onSubmit: async () => undefined }
      )
    )
    const exit = await Effect.runPromise(Effect.exit(form.handleSubmitEffect()))
    expect(Exit.isSuccess(exit)).toBe(true)
  })

  it("succeeds with void even on invalid input without checkErrors", async () => {
    const form = mountForm(() =>
      useOmegaForm(
        S.Struct({ x: S.String.pipe(S.check(S.isMinLength(2))) }),
        { defaultValues: { x: "" }, onSubmit: async () => undefined }
      )
    )
    const exit = await Effect.runPromise(Effect.exit(form.handleSubmitEffect()))
    expect(Exit.isSuccess(exit)).toBe(true)
  })

  it("fails with FormErrors when checkErrors and validation fails", async () => {
    const form = mountForm(() =>
      useOmegaForm(
        S.Struct({ x: S.String.pipe(S.check(S.isMinLength(2))) }),
        { defaultValues: { x: "" }, onSubmit: async () => undefined }
      )
    )
    const exit = await Effect.runPromise(
      Effect.exit(form.handleSubmitEffect({ checkErrors: true }))
    )
    expect(Exit.isFailure(exit)).toBe(true)
    if (Exit.isFailure(exit)) {
      const cause = exit.cause
      const error = (cause as any)._tag === "Fail" ? (cause as any).error : null
      expect(error).toBeInstanceOf(FormErrors)
    }
  })

  it("delivers decoded To to onSubmit (not raw From)", async () => {
    let received: unknown
    const form = mountForm(() =>
      useOmegaForm(
        S.Struct({ n: S.FiniteFromString }),
        {
          defaultValues: { n: "42" },
          onSubmit: async ({ value }) => {
            received = value
          }
        }
      )
    )
    await Effect.runPromise(form.handleSubmitEffect())
    expect(received).toEqual({ n: 42 })
  })

  it("awaits Promise-returning onSubmit", async () => {
    let resolved = false
    const form = mountForm(() =>
      useOmegaForm(
        S.Struct({ x: S.String }),
        {
          defaultValues: { x: "" },
          onSubmit: async () => {
            await new Promise((r) => setTimeout(r, 5))
            resolved = true
          }
        }
      )
    )
    await Effect.runPromise(form.handleSubmitEffect())
    expect(resolved).toBe(true)
  })

  it("awaits Effect-returning onSubmit", async () => {
    let resolved = false
    const form = mountForm(() =>
      useOmegaForm(
        S.Struct({ x: S.String }),
        {
          defaultValues: { x: "" },
          onSubmit: () =>
            Effect.sync(() => {
              resolved = true
            })
        }
      )
    )
    await Effect.runPromise(form.handleSubmitEffect())
    expect(resolved).toBe(true)
  })

  it("awaits Fiber-returning onSubmit", async () => {
    let resolved = false
    const form = mountForm(() =>
      useOmegaForm(
        S.Struct({ x: S.String }),
        {
          defaultValues: { x: "" },
          onSubmit: () =>
            Effect.runFork(
              Effect.sync(() => {
                resolved = true
              })
            )
        }
      )
    )
    await Effect.runPromise(form.handleSubmitEffect())
    expect(resolved).toBe(true)
  })
})
```

- [ ] **Step 2: Run and verify**

Run: `pnpm test:run __tests__/OmegaForm/SubmitEffect.test.ts`
Expected: all tests pass. If `S.FiniteFromString` is the wrong identifier, replace with the correct effect-app schema (search the codebase: `grep -rn "FiniteFromString" src/`). If `Effect.runFork` is the wrong API, use `Fiber` constructors per current effect-app version.

- [ ] **Step 3: Commit**

```bash
git add __tests__/OmegaForm/SubmitEffect.test.ts
git commit -m "test(omegaform): characterize handleSubmitEffect + Promise/Effect/Fiber onSubmit"
```

---

### Task 0.6: Submit error redistribution / clear test

**Files:**
- Create: `__tests__/OmegaForm/SubmitErrorClear.test.ts`

- [ ] **Step 1: Write the test**

```ts
// __tests__/OmegaForm/SubmitErrorClear.test.ts
import { mount } from "@vue/test-utils"
import { S } from "effect-app"
import { defineComponent, nextTick } from "vue"
import { describe, expect, it } from "vitest"
import OmegaIntlProvider from "../OmegaIntlProvider.vue"
import { useOmegaForm } from "../../src/components/OmegaForm"

const mountForm = <T>(setupForm: () => T): T => {
  let captured: T | undefined
  const Inner = defineComponent({
    setup() {
      captured = setupForm()
      return {}
    },
    template: "<div></div>"
  })
  const Wrapper = defineComponent({
    components: { OmegaIntlProvider, Inner },
    template: "<OmegaIntlProvider><Inner /></OmegaIntlProvider>"
  })
  mount(Wrapper)
  if (!captured) throw new Error("setupForm did not return")
  return captured
}

describe("submit error redistribution (current behavior)", () => {
  it("clears sibling onSubmit errors when any field changes after a failed submit", async () => {
    const schema = S.Struct({
      a: S.String.pipe(S.check(S.isMinLength(2))),
      b: S.String.pipe(S.check(S.isMinLength(2)))
    })
    const form = mountForm(() =>
      useOmegaForm(schema, { defaultValues: { a: "", b: "" } })
    )

    await form.handleSubmit()
    await nextTick()

    // both fields should have onSubmit errors
    const aBefore = form.fieldInfo.a?.instance?.state.meta.errorMap?.onSubmit
    const bBefore = form.fieldInfo.b?.instance?.state.meta.errorMap?.onSubmit
    // Skip the assertion if TanStack didn't populate them in this version's
    // surface — pin only the post-change behavior.

    // mutate a single field
    form.setFieldValue("a", "ok")
    await nextTick()
    await nextTick()

    // sibling field's onSubmit error should be cleared by the watcher
    const bAfter = form.fieldInfo.b?.instance?.state.meta.errorMap?.onSubmit
    expect(bAfter).toBeFalsy()

    // tag the test result so Phase 3 rewrite is visible in the diff
    void aBefore
    void bBefore
  })
})
```

- [ ] **Step 2: Run and verify**

Run: `pnpm test:run __tests__/OmegaForm/SubmitErrorClear.test.ts`
Expected: passes against current code. If the assertion shape doesn't match TanStack's actual surface, simplify to "after value change, isFieldsValid is true" or similar — the goal is to capture *some* observable consequence of the workaround so Phase 3 can flip it deliberately.

- [ ] **Step 3: Commit**

```bash
git add __tests__/OmegaForm/SubmitErrorClear.test.ts
git commit -m "test(omegaform): characterize submit error clearing watcher"
```

---

### Task 0.7: Default values priority test *(optional, recommended)*

**Files:**
- Create: `__tests__/OmegaForm/DefaultValuesPriority.test.ts`

- [ ] **Step 1: Write the test**

```ts
// __tests__/OmegaForm/DefaultValuesPriority.test.ts
import { Effect, S } from "effect-app"
import { describe, expect, it } from "vitest"
import { deepMerge } from "../../src/components/OmegaForm/OmegaFormStuff"

describe("deepMerge", () => {
  it("treats arrays as values, not as merged structures", () => {
    expect(deepMerge({ xs: [1, 2, 3] }, { xs: [9] })).toEqual({ xs: [9] })
  })

  it("recursively merges objects", () => {
    expect(deepMerge({ a: { b: 1, c: 2 } }, { a: { c: 9, d: 3 } }))
      .toEqual({ a: { b: 1, c: 9, d: 3 } })
  })

  it("source wins for primitives", () => {
    expect(deepMerge({ x: 1 }, { x: 2 })).toEqual({ x: 2 })
  })
})

// NOTE: defaultValuesPriority resolution lives inside useOmegaForm's
// `defaultValues` computed and isn't exported. A behavioral test would mount
// a form. The deepMerge unit tests above pin the merge mechanic; the priority
// resolution itself is exercised indirectly by the Meta and Defaults stories.
void Effect
```

- [ ] **Step 2: Run and verify**

Run: `pnpm test:run __tests__/OmegaForm/DefaultValuesPriority.test.ts`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add __tests__/OmegaForm/DefaultValuesPriority.test.ts
git commit -m "test(omegaform): characterize deepMerge behavior"
```

---

### Task 0.8: Nested tagged union characterization (FormTaggedUnion)

**Files:**
- Create: `__tests__/OmegaForm/TaggedUnionNested.test.ts`

- [ ] **Step 1: Write the test**

```ts
// __tests__/OmegaForm/TaggedUnionNested.test.ts
import { S } from "effect-app"
import { describe, expect, it } from "vitest"
import { generateMetaFromSchema } from "../../src/components/OmegaForm/OmegaFormStuff"

const schema = S.Struct({
  aString: S.NonEmptyString255,
  union: S.NullOr(
    S.Union([
      S.TaggedStruct("A", { a: S.NonEmptyString255, common: S.NonEmptyString255 }),
      S.TaggedStruct("B", { b: S.NonEmptyString255, common: S.NonEmptyString255 })
    ])
  )
})

describe("FormTaggedUnion characterization", () => {
  const { meta, unionMeta } = generateMetaFromSchema(schema)

  it("flat meta exposes union._tag as a non-required select", () => {
    expect(meta["union._tag"]).toMatchObject({
      type: "select",
      members: ["A", "B"],
      required: false
    })
  })

  it("flat meta contains all branch fields", () => {
    expect(meta["union.a"]).toBeDefined()
    expect(meta["union.b"]).toBeDefined()
    expect(meta["union.common"]).toBeDefined()
  })

  it("unionMeta['A'] contains a and common, no b", () => {
    expect(unionMeta["A"]).toBeDefined()
    expect(unionMeta["A"]?.a).toBeDefined()
    expect(unionMeta["A"]?.common).toBeDefined()
    expect(unionMeta["A"]?.b).toBeUndefined()
  })

  it("unionMeta['B'] contains b and common, no a", () => {
    expect(unionMeta["B"]).toBeDefined()
    expect(unionMeta["B"]?.b).toBeDefined()
    expect(unionMeta["B"]?.common).toBeDefined()
    expect(unionMeta["B"]?.a).toBeUndefined()
  })

  it("sibling field aString is unaffected by the neighboring union", () => {
    expect(meta.aString).toMatchObject({
      type: "string",
      required: true,
      minLength: 1,
      maxLength: 255
    })
  })
})
```

- [ ] **Step 2: Run and verify**

Run: `pnpm test:run __tests__/OmegaForm/TaggedUnionNested.test.ts`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add __tests__/OmegaForm/TaggedUnionNested.test.ts
git commit -m "test(omegaform): characterize FormTaggedUnion nested meta"
```

---

### Task 0.9: Root tagged union with divergent shared field (RootLevelTaggedUnion)

**Files:**
- Create: `__tests__/OmegaForm/TaggedUnionRoot.test.ts`

- [ ] **Step 1: Write the test**

```ts
// __tests__/OmegaForm/TaggedUnionRoot.test.ts
import { Effect, S } from "effect-app"
import { describe, expect, it } from "vitest"
import {
  defaultsValueFromSchema,
  generateMetaFromSchema
} from "../../src/components/OmegaForm/OmegaFormStuff"

const schema = S.Union([
  S.TaggedStruct("A", {
    a: S.NonEmptyString255.pipe(
      S.withConstructorDefault(Effect.succeed(S.NonEmptyString255("aaaa")))
    ),
    common: S.NonEmptyString255
  }),
  S.TaggedStruct("B", {
    b: S.Finite,
    nullableB: S.NullOr(S.Finite),
    common: S.NullOr(S.String)
  })
])

describe("RootLevelTaggedUnion characterization", () => {
  const { meta, unionMeta } = generateMetaFromSchema(schema)

  it("flat _tag is a required select with both members", () => {
    expect(meta._tag).toMatchObject({
      type: "select",
      members: ["A", "B"],
      required: true
    })
  })

  it("unionMeta['A'].common is required and non-nullable", () => {
    expect(unionMeta["A"]?.common).toMatchObject({
      type: "string",
      required: true,
      nullableOrUndefined: false,
      minLength: 1,
      maxLength: 255
    })
  })

  it("unionMeta['B'].common is non-required and nullable", () => {
    expect(unionMeta["B"]?.common).toMatchObject({
      type: "string",
      required: false,
      nullableOrUndefined: "null"
    })
  })

  it("unionMeta['B'].nullableB is non-required and nullable", () => {
    expect(unionMeta["B"]?.nullableB).toMatchObject({
      type: "number",
      required: false,
      nullableOrUndefined: "null"
    })
  })

  it("unionMeta['A'] does not include B-only fields", () => {
    expect(unionMeta["A"]?.b).toBeUndefined()
    expect(unionMeta["A"]?.nullableB).toBeUndefined()
  })

  it("unionMeta['B'] does not include A-only fields", () => {
    expect(unionMeta["B"]?.a).toBeUndefined()
  })

  it("flat meta.common reflects last-write-wins resolution", () => {
    // Pin current behavior. If Phase 2 unifies the walker, this test makes
    // the resolution change visible — update or remove deliberately.
    expect(meta.common).toBeDefined()
  })

  it("defaultsValueFromSchema honors withConstructorDefault on branch A's a", () => {
    const defaults = defaultsValueFromSchema(schema)
    expect(defaults.a).toBe("aaaa")
  })
})
```

- [ ] **Step 2: Run and verify**

Run: `pnpm test:run __tests__/OmegaForm/TaggedUnionRoot.test.ts`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add __tests__/OmegaForm/TaggedUnionRoot.test.ts
git commit -m "test(omegaform): characterize RootLevelTaggedUnion + divergent shared field"
```

---

### Task 0.10: Legacy `_tag` deprecation warning *(optional)*

**Files:**
- Create: `__tests__/OmegaForm/TaggedUnionLegacyWarning.test.ts`

- [ ] **Step 1: Write the test**

```ts
// __tests__/OmegaForm/TaggedUnionLegacyWarning.test.ts
import { S } from "effect-app"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { generateMetaFromSchema } from "../../src/components/OmegaForm/OmegaFormStuff"

let warnSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined)
})

afterEach(() => {
  warnSpy.mockRestore()
})

describe("legacy _tag deprecation warning", () => {
  it("warns once for the legacy S.Struct({_tag: S.Literal(...)}) pattern", () => {
    const schema = S.Union([
      S.Struct({ _tag: S.Literal("Legacy"), x: S.String })
    ])
    generateMetaFromSchema(schema)
    expect(warnSpy).toHaveBeenCalled()
    const calls = warnSpy.mock.calls.flatMap((args) => args.map(String))
    expect(calls.some((s) => s.includes("Legacy"))).toBe(true)
  })

  it("does not warn again for the same tag value (module-level memoization)", () => {
    // Use a unique tag the previous test did not touch. If isolated, this
    // exercises both "first warn" and "second-time no warn" paths.
    const schema = S.Union([
      S.Struct({ _tag: S.Literal("LegacyOnce"), x: S.String })
    ])
    generateMetaFromSchema(schema)
    const firstCalls = warnSpy.mock.calls.length
    generateMetaFromSchema(schema)
    expect(warnSpy.mock.calls.length).toBe(firstCalls)
  })
})
```

- [ ] **Step 2: Run and verify**

Run: `pnpm test:run __tests__/OmegaForm/TaggedUnionLegacyWarning.test.ts`
Expected: passes. The "warn once" assertion depends on `legacyTagWarningEmittedFor` being module-level state; if it isn't, simplify to "warn at least once".

- [ ] **Step 3: Commit**

```bash
git add __tests__/OmegaForm/TaggedUnionLegacyWarning.test.ts
git commit -m "test(omegaform): characterize legacy _tag deprecation warning"
```

---

### Task 0.11: Phase 0 green-bar checkpoint

- [ ] **Step 1: Run the full test suite**

Run: `pnpm test:run`
Expected: all existing tests + the 7–10 new tests pass.

- [ ] **Step 2: Manual smoke-check**

Open Storybook (`pnpm storybook`) and verify the five smoke-check stories listed at the top of this plan render and behave normally.

- [ ] **Step 3: Tag the checkpoint**

```bash
git tag omegaform-refactor-phase0-green
```

---

## Phase 1 — File decomposition (no behavior change)

Each task moves one concern out of `OmegaFormStuff.ts` and/or `useOmegaForm.ts`. After each task, run the test suite. The existing public exports from `index.ts` must keep working — for any test that imports from `OmegaFormStuff` directly (`__tests__/test-union-meta.test.ts`, `__tests__/migration/schema-v4-migration.test.ts`, the new tests above), update the import path to the new module **as the last step of the corresponding extraction task**.

Always extract by **moving** code (the new file owns the canonical version) and replacing the old location with a `re-export` line so no transitive consumer breaks during the migration. The final task in this phase deletes `OmegaFormStuff.ts` once it contains nothing but re-exports.

### Task 1.1: Create `meta/types.ts`

**Files:**
- Create: `src/components/OmegaForm/meta/types.ts`
- Modify: `src/components/OmegaForm/OmegaFormStuff.ts`

- [ ] **Step 1: Create the new file**

Move these exported type definitions from `OmegaFormStuff.ts` into `src/components/OmegaForm/meta/types.ts`:

- `BaseFieldMeta`
- `StringFieldMeta`
- `NumberFieldMeta`
- `SelectFieldMeta`
- `MultipleFieldMeta`
- `BooleanFieldMeta`
- `DateFieldMeta`
- `UnknownFieldMeta`
- `FieldMeta` (the union)
- `MetaRecord`
- `NestedKeyOf` and the `StripRedacted` helper it uses

Imports needed:
```ts
import type { DeepKeys, StandardSchemaV1 } from "@tanstack/vue-form"
import type { S } from "effect-app"
import type { Redacted } from "effect/Redacted"
```

- [ ] **Step 2: Replace the moved types in `OmegaFormStuff.ts` with a re-export**

```ts
// near the top of OmegaFormStuff.ts, replace the original definitions
export {
  type BaseFieldMeta,
  type BooleanFieldMeta,
  type DateFieldMeta,
  type FieldMeta,
  type MetaRecord,
  type MultipleFieldMeta,
  type NestedKeyOf,
  type NumberFieldMeta,
  type SelectFieldMeta,
  type StringFieldMeta,
  type UnknownFieldMeta
} from "./meta/types"
```

- [ ] **Step 3: Run the test suite**

Run: `pnpm test:run`
Expected: all green. Run `pnpm check` (vue-tsc) too.

- [ ] **Step 4: Commit**

```bash
git add src/components/OmegaForm/meta/types.ts src/components/OmegaForm/OmegaFormStuff.ts
git commit -m "refactor(omegaform): extract field meta types into meta/types"
```

---

### Task 1.2: Create `meta/legacyWarning.ts`

**Files:**
- Create: `src/components/OmegaForm/meta/legacyWarning.ts`
- Modify: `src/components/OmegaForm/OmegaFormStuff.ts`

- [ ] **Step 1: Write the new module**

```ts
// src/components/OmegaForm/meta/legacyWarning.ts
const legacyTagWarningEmittedFor = new Set<string>()

type GlobalThisWithOptionalProcess = typeof globalThis & {
  process?: { env?: { NODE_ENV?: string } }
}

const isDevelopmentEnvironment = () => {
  const proc = (globalThis as GlobalThisWithOptionalProcess).process
  return proc?.env?.NODE_ENV !== "production"
}

export const warnLegacyTag = (tagValue: string) => {
  if (!isDevelopmentEnvironment()) return
  if (legacyTagWarningEmittedFor.has(tagValue)) return
  legacyTagWarningEmittedFor.add(tagValue)
  console.warn(
    `[OmegaForm] Union member with _tag "${tagValue}" uses S.Struct({ _tag: S.Literal("${tagValue}"), ... }). `
      + `Please migrate to S.TaggedStruct("${tagValue}", { ... }) for cleaner AST handling.`
  )
}
```

- [ ] **Step 2: Replace the inline implementation in `OmegaFormStuff.ts`**

Find the block in `metadataFromAst` that emits the warning and replace it with `warnLegacyTag(tagValue)`. Delete the now-unused `legacyTagWarningEmittedFor` set and `isDevelopmentEnvironment` from `OmegaFormStuff.ts`.

Add to imports:
```ts
import { warnLegacyTag } from "./meta/legacyWarning"
```

- [ ] **Step 3: Run tests**

Run: `pnpm test:run`
Expected: green, including `TaggedUnionLegacyWarning.test.ts` from Task 0.10.

- [ ] **Step 4: Commit**

```bash
git add src/components/OmegaForm/meta/legacyWarning.ts src/components/OmegaForm/OmegaFormStuff.ts
git commit -m "refactor(omegaform): extract legacy _tag warning"
```

---

### Task 1.3: Create `meta/redacted.ts`

**Files:**
- Create: `src/components/OmegaForm/meta/redacted.ts`
- Modify: `src/components/OmegaForm/OmegaFormStuff.ts`

- [ ] **Step 1: Move `toFormSchema` into `meta/redacted.ts`**

Move the `isRedactedWithoutEncoding` helper and the `toFormSchema` function (current lines around 1063–1119 of `OmegaFormStuff.ts`) into the new file. Imports needed: `S` from `effect-app`.

- [ ] **Step 2: Replace with re-export**

In `OmegaFormStuff.ts`, replace the moved code with:
```ts
export { toFormSchema } from "./meta/redacted"
```

- [ ] **Step 3: Run tests**

Run: `pnpm test:run`
Expected: green, including `RedactedMeta.test.ts`.

- [ ] **Step 4: Commit**

```bash
git add src/components/OmegaForm/meta/redacted.ts src/components/OmegaForm/OmegaFormStuff.ts
git commit -m "refactor(omegaform): extract toFormSchema into meta/redacted"
```

---

### Task 1.4: Create `meta/defaults.ts`

**Files:**
- Create: `src/components/OmegaForm/meta/defaults.ts`
- Modify: `src/components/OmegaForm/OmegaFormStuff.ts`

- [ ] **Step 1: Move `defaultsValueFromSchema` into `meta/defaults.ts`**

Move the `defaultsValueFromSchema` function and its private helpers (`hasMembers`, `getDefaultFromAst`, `extractDefaultFromLink`) into the new module. Keep `unwrapDeclaration` and `isNullableOrUndefined` reachable — for now import them back from `OmegaFormStuff` (they'll move in the next task).

- [ ] **Step 2: Replace with re-export**

```ts
export { defaultsValueFromSchema } from "./meta/defaults"
```

- [ ] **Step 3: Run tests**

Run: `pnpm test:run`
Expected: green, including `Defaults.values.test.ts`.

- [ ] **Step 4: Commit**

```bash
git add src/components/OmegaForm/meta/defaults.ts src/components/OmegaForm/OmegaFormStuff.ts
git commit -m "refactor(omegaform): extract defaultsValueFromSchema"
```

---

### Task 1.5: Create `meta/createMeta.ts`

**Files:**
- Create: `src/components/OmegaForm/meta/createMeta.ts`
- Modify: `src/components/OmegaForm/OmegaFormStuff.ts`
- Modify: `src/components/OmegaForm/meta/defaults.ts` (point inter-module imports here once moved)

- [ ] **Step 1: Move into the new file**

Move all of these into `meta/createMeta.ts`:

- All `unwrap*` helpers (`unwrapDeclaration`, `unwrapNestedUnions`, `unwrapSingleLiteralUnion`)
- `getNullableOrUndefined`
- `isNullableOrUndefined`
- `getNonNullTypes`
- `getJsonSchemaAnnotation` *(will be deleted in Phase 2 — leave it for now)*
- `getCheckMetas`
- `getFieldMetadataFromAst`
- `createMeta`
- `metadataFromAst`
- `flattenMeta`
- `generateMetaFromSchema`
- `attachOriginalSchemas` and `toFieldStandardSchema` *(get deleted in Phase 3, but live in createMeta.ts now to keep the dependency graph clean)*
- `CreateMeta` type and `FilterItems` type if still co-located here

Note: `extractDefaultFromLink` already moved with `defaultsValueFromSchema` in Task 1.4. Leave it in `meta/defaults.ts`. If `createMeta` needs default extraction, import from `meta/defaults.ts`.

- [ ] **Step 2: Replace with re-export in `OmegaFormStuff.ts`**

```ts
export {
  createMeta,
  generateMetaFromSchema,
  isNullableOrUndefined,
  metadataFromAst
} from "./meta/createMeta"
export type { CreateMeta, FilterItems } from "./meta/createMeta"
```

- [ ] **Step 3: Update `meta/defaults.ts` imports**

Change any `import { unwrapDeclaration, isNullableOrUndefined } from "../OmegaFormStuff"` to:
```ts
import { unwrapDeclaration, isNullableOrUndefined } from "./createMeta"
```

(Or, if the helpers are needed by both, hoist them into a `meta/ast.ts` mini-module. Use judgment: if `unwrapDeclaration` is only used in `createMeta` and `defaults`, a sibling import is fine.)

- [ ] **Step 4: Run tests**

Run: `pnpm test:run`
Expected: green. Includes `Meta.test.ts`, `TaggedUnionNested.test.ts`, `TaggedUnionRoot.test.ts`, `TaggedUnionRequired.test.ts`, `OptionalKey.test.ts`, etc.

- [ ] **Step 5: Commit**

```bash
git add src/components/OmegaForm/meta/createMeta.ts src/components/OmegaForm/meta/defaults.ts src/components/OmegaForm/OmegaFormStuff.ts
git commit -m "refactor(omegaform): extract createMeta + AST helpers into meta/createMeta"
```

---

### Task 1.6: Create `validation/localized.ts`

**Files:**
- Create: `src/components/OmegaForm/validation/localized.ts`
- Modify: `src/components/OmegaForm/OmegaFormStuff.ts`

**Note (Phase 0 discovery):** the plan originally listed `makeStandardSchemaV1Hooks` and `toLocalizedStandardSchemaV1` among the moves. These functions **don't exist** in the current source — only `generateInputStandardSchemaFromFieldMeta` does. This task therefore both (a) **creates** the new hook functions and (b) **moves** the existing per-field generator. The new hooks are first *used* in Phase 3 Task 3.1, but they're built here so Phase 1 ends with a clean validation module ready to consume.

- [ ] **Step 1: Create the new module**

Create `validation/localized.ts` with the following content. The hook implementations are derived from the per-issue `trans()` calls already inlined in `generateInputStandardSchemaFromFieldMeta` (`OmegaFormStuff.ts:1139–1273`) — the message keys, NaN-actual sentinel for `isInt`, and zero-vs-nonzero branching for `isGreaterThan*` are preserved verbatim from there.

```ts
// src/components/OmegaForm/validation/localized.ts
import { Effect, Option, S } from "effect-app"
import type { StandardSchemaV1 } from "@tanstack/vue-form"
import type { useIntl } from "../../../utils"
import type { FieldMeta } from "../meta/types"

export type TransFn = ReturnType<typeof useIntl>["trans"]

interface SchemaIssue {
  readonly _tag: string
  readonly ast?: S.AST.AST
  readonly actual?: Option.Option<unknown>
  readonly annotations?: { readonly message?: string }
  readonly filter?: { readonly annotations?: { readonly meta?: Record<string, unknown> } }
}

export const makeStandardSchemaV1Hooks = (
  trans: TransFn
): {
  leafHook: (issue: SchemaIssue) => string
  checkHook: (issue: SchemaIssue) => string | undefined
} => {
  const leafHook = (issue: SchemaIssue): string => {
    const override = issue.annotations?.message
    if (override !== undefined) return String(override)
    switch (issue._tag) {
      case "MissingKey":
        return trans("validation.empty")
      case "InvalidType": {
        const ast = issue.ast
        if (ast && S.AST.isStringKeyword(ast)) return trans("validation.empty")
        if (ast && S.AST.isBooleanKeyword(ast)) return trans("validation.not_a_valid", { type: "boolean" })
        if (ast && S.AST.isNumberKeyword(ast)) return trans("validation.number.expected", { actualValue: "NaN" })
        return trans("validation.not_a_valid")
      }
      default:
        return trans("validation.not_a_valid")
    }
  }

  const checkHook = (issue: SchemaIssue): string | undefined => {
    if (issue._tag !== "Filter") return undefined
    const meta = (issue.filter?.annotations?.meta ?? {}) as Record<string, unknown>
    switch (meta._tag) {
      case "isMinLength":
        return meta.minLength === 1
          ? trans("validation.empty")
          : trans("validation.string.minLength", { minLength: meta.minLength })
      case "isMaxLength":
        return trans("validation.string.maxLength", { maxLength: meta.maxLength })
      case "isInt":
        return trans("validation.integer.expected", { actualValue: "NaN" })
      case "isGreaterThanOrEqualTo":
        return trans(
          meta.minimum === 0 ? "validation.number.positive" : "validation.number.min",
          { minimum: meta.minimum, isExclusive: true }
        )
      case "isGreaterThan":
        return trans(
          meta.exclusiveMinimum === 0 ? "validation.number.positive" : "validation.number.min",
          { minimum: meta.exclusiveMinimum, isExclusive: false }
        )
      case "isLessThanOrEqualTo":
        return trans("validation.number.max", { maximum: meta.maximum, isExclusive: true })
      case "isLessThan":
        return trans("validation.number.max", { maximum: meta.exclusiveMaximum, isExclusive: false })
      default:
        return undefined
    }
  }

  return { leafHook, checkHook }
}

export const toLocalizedStandardSchemaV1 = <From, To>(
  schema: S.Schema<To, From, never>,
  trans: TransFn
): StandardSchemaV1<From, To> => {
  const { leafHook, checkHook } = makeStandardSchemaV1Hooks(trans)
  // The exact wiring for hooks depends on effect-app's `S.toStandardSchemaV1`
  // signature in the current version. Verify before committing: the function
  // may accept `{ leafHook, checkHook }` directly or require wrapping issues
  // through a `messages` option. Adjust as needed.
  return S.toStandardSchemaV1(schema as any, { leafHook, checkHook }) as any
}
```

(Adjust the relative path for `useIntl` based on the new file's depth. If `S.toStandardSchemaV1` doesn't accept a hook-options object in this effect-app version, post-process the validation result to rewrite messages — escalate if unclear.)

- [ ] **Step 2: Move `generateInputStandardSchemaFromFieldMeta`**

Move the entire `generateInputStandardSchemaFromFieldMeta` function (currently in `OmegaFormStuff.ts:1139–1273`) into `validation/localized.ts`. Update the file header imports as needed. This function is **deleted in Phase 3** along with its caller (`OmegaInput.vue`'s `composeStandardSchemas`); it lives here for now.

- [ ] **Step 3: Re-export from `OmegaFormStuff.ts`**

```ts
export {
  generateInputStandardSchemaFromFieldMeta,
  makeStandardSchemaV1Hooks,
  toLocalizedStandardSchemaV1
} from "./validation/localized"
```

- [ ] **Step 4: Run tests**

Run: `pnpm test:run`
Expected: green. There are currently no tests calling `makeStandardSchemaV1Hooks` or `toLocalizedStandardSchemaV1` directly (the Phase 0 task that would have exercised them was reduced to S.Email-only because the functions didn't exist yet); they'll first be exercised in Phase 3 Task 3.1.

- [ ] **Step 5: Commit**

```bash
git add src/components/OmegaForm/validation/localized.ts src/components/OmegaForm/OmegaFormStuff.ts
git commit -m "refactor(omegaform): create localized validation hooks + extract per-field generator"
```

---

### Task 1.7: Create `types.ts` (public type definitions)

**Files:**
- Create: `src/components/OmegaForm/types.ts`
- Modify: `src/components/OmegaForm/OmegaFormStuff.ts`

- [ ] **Step 1: Move into the new file**

Move these public type definitions from `OmegaFormStuff.ts` into `types.ts`:
- `FieldPath`, `FieldPath_`
- `BaseProps`
- `TypesWithOptions`, `DefaultTypeProps`
- `OmegaInputPropsBase`, `OmegaInputProps`
- `OmegaArrayProps`
- `TypeOverride`
- `OmegaError`
- `FormProps`, `OmegaFormParams`, `OmegaFormState`, `OmegaFormApi`
- `FormComponent`, `FormType`
- `PrefixFromDepth`
- `FieldValidators`
- `OmegaAutoGenMeta`

(`OmegaConfig` and `OmegaFormReturn` stay in `useOmegaForm.ts` since they reference its return shape.)

Imports for the new file:
```ts
import type {
  DeepKeys, DeepValue, FieldAsyncValidateOrFn, FieldValidateOrFn,
  FormApi, FormAsyncValidateOrFn, FormOptions, FormState,
  FormValidateOrFn, StandardSchemaV1, VueFormApi
} from "@tanstack/vue-form"
import type { Effect } from "effect-app"
import type { Fiber as EffectFiber } from "effect/Fiber"
import type { Redacted } from "effect/Redacted"
import type { OF } from "./useOmegaForm"
import type { OmegaFieldInternalApi } from "./InputProps"
import type { FieldMeta, MetaRecord } from "./meta/types"
```

- [ ] **Step 2: Re-export from `OmegaFormStuff.ts`**

```ts
export type {
  BaseProps, DefaultTypeProps, FieldPath, FieldPath_, FieldValidators,
  FormComponent, FormProps, FormType, OmegaArrayProps, OmegaAutoGenMeta,
  OmegaError, OmegaFormApi, OmegaFormParams, OmegaFormState,
  OmegaInputProps, OmegaInputPropsBase, PrefixFromDepth, TypeOverride,
  TypesWithOptions
} from "./types"
```

- [ ] **Step 3: Run tests**

Run: `pnpm test:run && pnpm check`
Expected: green.

- [ ] **Step 4: Commit**

```bash
git add src/components/OmegaForm/types.ts src/components/OmegaForm/OmegaFormStuff.ts
git commit -m "refactor(omegaform): extract public type definitions"
```

---

### Task 1.8: Create `persistency.ts`

**Files:**
- Create: `src/components/OmegaForm/persistency.ts`
- Modify: `src/components/OmegaForm/useOmegaForm.ts`
- Modify: `src/components/OmegaForm/OmegaFormStuff.ts`

- [ ] **Step 1: Write the new module**

Create `persistency.ts` with the following exports:
- `Policies` type (`"local" | "session" | "querystring"`)
- `defaultValuesPriorityUnion` type
- `OmegaConfig`-shaped fragment for `persistency` (or just keep `OmegaConfig` in `useOmegaForm.ts` for now and import the helpers there)
- `deepMerge` (currently in `OmegaFormStuff.ts`)
- A `usePersistency(form, omegaConfig, persistencyKey)` composable that wraps the `defaultValues` computed, `persistData`, `saveDataInUrl`, `clearUrlParams`, `persistFilter`, `createNestedObjectFromPaths`, and the `onMounted` / `onBeforeUnmount` event listener wiring currently in `useOmegaForm.ts` (around lines 692–767, 819–884, 891–906).

Suggested signature:
```ts
import { computed, onBeforeUnmount, onMounted, onUnmounted, type Ref } from "vue"
import { type MetaRecord } from "./meta/types"

export type Policies = "local" | "session" | "querystring"
export type DefaultValuesPriorityUnion = "tanstack" | "persistency" | "schema"

export interface PersistencyConfig {
  policies?: ReadonlyArray<Policies>
  id?: string
  keys?: ReadonlyArray<string>
  banKeys?: ReadonlyArray<string>
}

export interface UsePersistencyOptions<From> {
  meta: MetaRecord<From>
  persistency?: PersistencyConfig
  preventWindowExit?: "prevent" | "prevent-and-reset" | "nope"
  defaultValuesPriority?: ReadonlyArray<DefaultValuesPriorityUnion>
  tanstackDefaultValues?: Partial<From>
  schemaDefaultValues: () => Partial<From>
  formStore: { state: { values: From; isDirty: boolean }; setFieldValue?: any }
}

export const usePersistency = <From>(opts: UsePersistencyOptions<From>) => {
  // ... move the logic here
}

export function deepMerge(target: any, source: any) { ... }
```

(Use judgment on the exact shape — the goal is that `useOmegaForm` calls one composable instead of inlining all the listener wiring and storage manipulation.)

- [ ] **Step 2: Update `useOmegaForm.ts`**

Replace the inlined persistency logic with a call to `usePersistency(...)`. Import `deepMerge` from the new module if still needed for default-values priority resolution.

- [ ] **Step 3: Re-export `deepMerge` from `OmegaFormStuff.ts`**

```ts
export { deepMerge } from "./persistency"
```

- [ ] **Step 4: Run tests + smoke-check**

Run: `pnpm test:run && pnpm check`
Expected: green. Manually open the `PersistencyForm` story and verify save/restore still work.

- [ ] **Step 5: Commit**

```bash
git add src/components/OmegaForm/persistency.ts src/components/OmegaForm/useOmegaForm.ts src/components/OmegaForm/OmegaFormStuff.ts
git commit -m "refactor(omegaform): extract persistency composable"
```

---

### Task 1.9: Create `submit.ts`

**Files:**
- Create: `src/components/OmegaForm/submit.ts`
- Modify: `src/components/OmegaForm/useOmegaForm.ts`

- [ ] **Step 1: Write the new module**

Move into `submit.ts`:
- `FormErrors` (the `Data.TaggedError`)
- The `wrapWithSpan` helper
- A `makeSubmit(form, decode, runPromise)` factory that returns:
  - `handleSubmit` (with span injection)
  - `handleSubmitEffect` (both overloads)
  - The transformation wrapper for `tanstackFormOptions.onSubmit` (the bit that detects Promise / Effect / Fiber and decodes the value first)

Imports:
```ts
import * as api from "@opentelemetry/api"
import type { StandardSchemaV1Issue, ValidationError, ValidationErrorMap } from "@tanstack/vue-form"
import { Data, Effect, Fiber, Option, S } from "effect-app"
import { runtimeFiberAsPromise } from "effect-app/utils"
import type { OmegaFormApi, OmegaFormParams } from "./types"
```

- [ ] **Step 2: Update `useOmegaForm.ts`**

Replace the inlined submit logic with calls to the helpers from `submit.ts`. The composable still owns the `useForm({ ...validators, onSubmit: wrappedOnSubmit })` instantiation; it delegates the wrapping to `submit.ts`.

- [ ] **Step 3: Run tests**

Run: `pnpm test:run`
Expected: green, including `SubmitEffect.test.ts`.

- [ ] **Step 4: Commit**

```bash
git add src/components/OmegaForm/submit.ts src/components/OmegaForm/useOmegaForm.ts
git commit -m "refactor(omegaform): extract submit + handleSubmitEffect"
```

---

### Task 1.10: Create `errors.ts` and `hocs.ts`

**Files:**
- Create: `src/components/OmegaForm/errors.ts`
- Create: `src/components/OmegaForm/hocs.ts`
- Modify: `src/components/OmegaForm/useOmegaForm.ts`

- [ ] **Step 1: Write `hocs.ts`**

Move the `fHoc` function (the higher-order component that injects `form` into a child) into its own module.

```ts
// src/components/OmegaForm/hocs.ts
import { type Component, type ConcreteComponent, h } from "vue"
import type { OF } from "./useOmegaForm"

export const fHoc = (form: OF<any, any>) => {
  return function FormHoc<P>(WrappedComponent: Component<P>): ConcreteComponent<P> {
    return {
      render() {
        return h(WrappedComponent, { form, ...this.$attrs } as any, this.$slots)
      }
    }
  }
}
```

- [ ] **Step 2: Write `errors.ts`**

Move into `errors.ts`:
- `useErrorLabel` (depends on `useIntl` — adjust relative imports)
- `eHoc` (the error HOC that wraps `OmegaErrorsInternal`)
- The `fieldMap` registration glue (the `registerField` body and the `Map<string, {label, id}>` setup)

Suggested signature for the registration helper:
```ts
import { onUnmounted, ref, watch, type ComputedRef, type Ref } from "vue"

export const makeFieldMap = () => {
  const fieldMap = ref(new Map<string, { label: string; id: string }>())
  const registerField = (field: ComputedRef<{ name: string; label: string; id: string }>) => {
    watch(field, (f) => {
      fieldMap.value.set(f.name, { label: f.label, id: f.id })
    }, { immediate: true })
    onUnmounted(() => {
      const current = fieldMap.value.get(field.value.name)
      if (current?.id === field.value.id) fieldMap.value.delete(field.value.name)
    })
  }
  return { fieldMap, registerField }
}
```

- [ ] **Step 3: Update `useOmegaForm.ts`**

Replace inline `fHoc`, `eHoc`, `useErrorLabel`, fieldMap setup with imports from the new modules.

- [ ] **Step 4: Run tests + smoke-check**

Run: `pnpm test:run`
Expected: green.

- [ ] **Step 5: Commit**

```bash
git add src/components/OmegaForm/errors.ts src/components/OmegaForm/hocs.ts src/components/OmegaForm/useOmegaForm.ts
git commit -m "refactor(omegaform): extract errors + HOC helpers"
```

---

### Task 1.11: Slim `useOmegaForm.ts`

**Files:**
- Modify: `src/components/OmegaForm/useOmegaForm.ts`

- [ ] **Step 1: Audit what's left**

Run: `wc -l src/components/OmegaForm/useOmegaForm.ts`

Target: < 300 lines. The composable should now contain only:
- `OmegaConfig`, `OmegaFormReturn`, `OF` type definitions
- `OmegaFormKey` symbol
- The `useOmegaForm` function: orchestration only
- The cached type aliases (`CachedFieldApi`, `CachedFieldState`)

If lines are still over budget, look for further extractable groups (e.g. cached-type definitions can move into `types.ts`).

- [ ] **Step 2: Move `CachedFieldApi` / `CachedFieldState` into `types.ts`** if `useOmegaForm.ts` is still large

```ts
// at the bottom of types.ts
export type CachedFieldApi<From, To, TypeProps> = ...
export type CachedFieldState<From, To, TypeProps> = ...
```

- [ ] **Step 3: Run tests + tsc**

Run: `pnpm test:run && pnpm check`
Expected: green.

- [ ] **Step 4: Commit**

```bash
git add src/components/OmegaForm/useOmegaForm.ts src/components/OmegaForm/types.ts
git commit -m "refactor(omegaform): slim useOmegaForm to orchestration"
```

---

### Task 1.12: Delete `OmegaFormStuff.ts`

**Files:**
- Delete: `src/components/OmegaForm/OmegaFormStuff.ts`
- Modify: `src/components/OmegaForm/index.ts`
- Modify: every test file currently importing from `OmegaFormStuff` directly

- [ ] **Step 1: Inventory direct importers**

Run: `grep -rn "from.*OmegaFormStuff" src __tests__ stories`
Expected: a list of imports. They must all be updated.

- [ ] **Step 2: Update `index.ts`**

`index.ts` currently has `export * from "./OmegaFormStuff"`. Replace with explicit re-exports from the new modules:

```ts
// src/components/OmegaForm/index.ts
export type {
  BaseProps, BaseFieldMeta, BooleanFieldMeta, DateFieldMeta, DefaultTypeProps,
  FieldMeta, FieldPath, FieldPath_, FieldValidators, FormComponent, FormProps,
  FormType, MetaRecord, MultipleFieldMeta, NestedKeyOf, NumberFieldMeta,
  OmegaArrayProps, OmegaAutoGenMeta, OmegaError, OmegaFormApi, OmegaFormParams,
  OmegaFormState, OmegaInputProps, OmegaInputPropsBase, PrefixFromDepth,
  SelectFieldMeta, StringFieldMeta, TypeOverride, TypesWithOptions,
  UnknownFieldMeta
} from "./types"
export {
  createMeta, generateMetaFromSchema, isNullableOrUndefined, metadataFromAst
} from "./meta/createMeta"
export { defaultsValueFromSchema } from "./meta/defaults"
export { toFormSchema } from "./meta/redacted"
export {
  generateInputStandardSchemaFromFieldMeta,
  makeStandardSchemaV1Hooks,
  toLocalizedStandardSchemaV1
} from "./validation/localized"
export { deepMerge } from "./persistency"
export { FormErrors } from "./submit"
export { useErrorLabel } from "./errors"
export { type OmegaConfig, type OmegaFormReturn, useOmegaForm, OmegaFormKey } from "./useOmegaForm"
export {
  type ExtractTagValue, type ExtractUnionBranch, type InputProps,
  type MergedInputProps, type TaggedUnionOption, type TaggedUnionOptionsArray,
  type TaggedUnionProps
} from "./InputProps"
export { default as OmegaInput } from "./OmegaInput.vue"
export { default as OmegaVuetifyInput } from "./OmegaInternalInput.vue"
export { default as OmegaTaggedUnion } from "./OmegaTaggedUnion.vue"
export { default as OmegaTaggedUnionInternal } from "./OmegaTaggedUnionInternal.vue"
export { useOnClose, usePreventClose } from "./blockDialog"
export { getInputType } from "./meta/createMeta"  // or wherever it lands
export { createUseFormWithCustomInput } from "./createUseFormWithCustomInput"
```

(Verify `getInputType` and `SupportedInputs` location — they're currently leaf utilities in `OmegaFormStuff.ts`. Decide between `meta/types.ts`, `validation/localized.ts`, or a new `inputs.ts`. Pick whatever yields the smallest diff.)

- [ ] **Step 3: Update direct importers**

For each file from Step 1's grep output, change:
```ts
import { foo } from "./OmegaFormStuff"
// or
import { foo } from "../../src/components/OmegaForm/OmegaFormStuff"
```
to import from the new specific module (e.g. `./meta/createMeta`, `./meta/defaults`, etc.). For test files, target the public package entry (`../../src/components/OmegaForm`) where possible.

- [ ] **Step 4: Delete `OmegaFormStuff.ts`**

```bash
rm src/components/OmegaForm/OmegaFormStuff.ts
```

- [ ] **Step 5: Run tests + tsc + smoke check**

Run: `pnpm test:run && pnpm check && pnpm lint`
Expected: green.

Manually open Storybook and verify the smoke-check stories at the top of the plan.

- [ ] **Step 6: Commit**

```bash
git add -A src/components/OmegaForm/index.ts __tests__ stories
git rm src/components/OmegaForm/OmegaFormStuff.ts
git commit -m "refactor(omegaform): delete OmegaFormStuff.ts after full extraction"
```

- [ ] **Step 7: Tag the checkpoint**

```bash
git tag omegaform-refactor-phase1-green
```

---

## Phase 2 — Slim `createMeta` and adopt v4 `format` annotation

### Task 2.1: Switch email detection to `S.AST.resolveAt("format")`

**Files:**
- Modify: `src/components/OmegaForm/meta/createMeta.ts`

- [ ] **Step 1: Locate the current detection**

In `createMeta.ts`, find the block in `getFieldMetadataFromAst`:

```ts
if (S.AST.resolveTitle(property) === "Email") {
  base.format = "email"
}
```

- [ ] **Step 2: Replace with v4 annotation read**

```ts
const format = S.AST.resolveAt<string>("format")(property)
if (format === "email") {
  base.format = "email"
}
```

(Or, if effect-app's `S.AST.resolveAt` differs, use the equivalent typed annotation reader. The function signature is `<A>(key: string) => (ast: AST) => A | undefined`, exported from `effect/SchemaAST`.)

- [ ] **Step 3: Run tests**

Run: `pnpm test:run __tests__/OmegaForm/ValidationLocalization.test.ts`
Expected: the `S.Email format detection` test passes.

Run: `pnpm test:run`
Expected: full suite green.

- [ ] **Step 4: Commit**

```bash
git add src/components/OmegaForm/meta/createMeta.ts
git commit -m "refactor(omegaform): use v4 format annotation for email detection"
```

---

### Task 2.2: Drop `getJsonSchemaAnnotation`

**Files:**
- Modify: `src/components/OmegaForm/meta/createMeta.ts`

- [ ] **Step 1: Find and remove**

Locate `getJsonSchemaAnnotation` (a small helper that reads `S.AST.resolve(property)?.jsonSchema`) and the line where it's spread into `meta`:

```ts
meta = { ...getJsonSchemaAnnotation(property), ...getFieldMetadataFromAst(property), ...meta }
```

Change to:
```ts
meta = { ...getFieldMetadataFromAst(property), ...meta }
```

Delete the `getJsonSchemaAnnotation` function definition.

- [ ] **Step 2: Run tests**

Run: `pnpm test:run`
Expected: green.

- [ ] **Step 3: Commit**

```bash
git add src/components/OmegaForm/meta/createMeta.ts
git commit -m "refactor(omegaform): drop getJsonSchemaAnnotation"
```

---

### Task 2.3: Inline `unwrapNestedUnions` and consolidate union classification

**Files:**
- Modify: `src/components/OmegaForm/meta/createMeta.ts`

- [ ] **Step 1: Identify call sites**

Run: `grep -n "unwrapNestedUnions" src/components/OmegaForm/meta/createMeta.ts`

It's used in `getNonNullTypes`. Inline its body there (a single recursive flat-map over `types` that flattens nested unions) and delete the standalone function.

- [ ] **Step 2: Run tests**

Run: `pnpm test:run`
Expected: green.

- [ ] **Step 3: Commit**

```bash
git add src/components/OmegaForm/meta/createMeta.ts
git commit -m "refactor(omegaform): inline unwrapNestedUnions"
```

---

### Task 2.4: Unify root-level and nested union handling

**Files:**
- Modify: `src/components/OmegaForm/meta/createMeta.ts`

- [ ] **Step 1: Read the current shape**

`metadataFromAst` currently handles root-level discriminated unions in a dedicated branch (the `if (S.AST.isUnion(ast))` block at the top), then falls through to `S.AST.isObjects(ast)` which calls `createMeta`. The discriminated-union branch inside `createMeta` (when iterating `propertySignatures` and a union is encountered) duplicates much of this work.

- [ ] **Step 2: Refactor**

Goal: one recursive entry that dispatches on AST kind. Implementation outline:

```ts
const walk = (ast: S.AST.AST, parent: string, parentMeta: { required: boolean; nullableOrUndefined: false | "null" | "undefined" }, acc: MetaRecord, unionMeta: Record<string, MetaRecord>) => {
  ast = unwrapDeclaration(ast)
  if (S.AST.isObjects(ast)) {
    walkStruct(ast.propertySignatures, parent, parentMeta, acc, unionMeta)
  } else if (S.AST.isUnion(ast)) {
    classifyAndWalkUnion(ast, parent, parentMeta, acc, unionMeta)
  } else if (S.AST.isArrays(ast)) {
    // produce multiple meta or recurse into struct elements
  } else {
    acc[parent] = leafMetaForAst(ast, parentMeta)
  }
}
```

Write `walkStruct`, `classifyAndWalkUnion`, `leafMetaForAst` as private helpers. The discriminated-union case calls `walkStruct` per-member to populate `unionMeta[tag]`, then merges into `acc` for backward-compatible flat meta. Tagged-union legacy detection routes through `warnLegacyTag`.

The tests from Phase 0 (`Meta.test.ts`, `TaggedUnionNested.test.ts`, `TaggedUnionRoot.test.ts`, `TaggedUnionRequired.test.ts`, `OptionalKey.test.ts`, `IntersectionError.test.ts`, `EmptyStringValidation.test.ts`) pin every meta shape this refactor must preserve. Run them after each intermediate compile.

- [ ] **Step 3: Verify line count target**

Run: `wc -l src/components/OmegaForm/meta/createMeta.ts`
Target: < 400 lines (down from ~600+ if you started here directly). Acceptable upper bound: < 500 lines. If still long, look for further extraction (e.g. a `meta/checks.ts` for `getCheckMetas` + `getFieldMetadataFromAst`).

- [ ] **Step 4: Run full test suite**

Run: `pnpm test:run`
Expected: green. **Two Phase 0 assertions are expected to flip here — these are deliberate outcomes of the unification, not regressions:**
- `TaggedUnionNested.test.ts`: assertions 3 and 4 (`unionMeta["A"]` / `unionMeta["B"]` are `toBeUndefined()`) currently pin "nested unions don't populate unionMeta". After unification they become populated. Update these assertions to mirror `TaggedUnionRoot.test.ts`'s shape: `unionMeta["A"]?.a` defined, `?.b` undefined, etc.
- `TaggedUnionRoot.test.ts`'s `flat meta.common reflects last-write-wins resolution` may resolve differently. If the new resolution is a deliberate improvement, update the test and add a code comment explaining the change. If it's an accident, fix the walker.

- [ ] **Step 5: Smoke-check Storybook**

Open the smoke-check stories. Especially RootLevelTaggedUnion — verify that toggling between `_tag` "A" and "B" still flips the `common` field's required state.

- [ ] **Step 6: Commit**

```bash
git add src/components/OmegaForm/meta/createMeta.ts
git commit -m "refactor(omegaform): unify root + nested union handling in createMeta"
```

---

### Task 2.5: Extract `meta/checks.ts` if `createMeta.ts` is still too large

**Files:**
- Create (conditional): `src/components/OmegaForm/meta/checks.ts`
- Modify: `src/components/OmegaForm/meta/createMeta.ts`

- [ ] **Step 1: Decide**

Run: `wc -l src/components/OmegaForm/meta/createMeta.ts`
If < 300 lines, skip this task. Otherwise, proceed.

- [ ] **Step 2: Move out**

Move `getCheckMetas` and `getFieldMetadataFromAst` (and the leaf-meta logic) into `meta/checks.ts`. `createMeta.ts` imports them.

- [ ] **Step 3: Test + commit**

```bash
pnpm test:run
git add src/components/OmegaForm/meta/checks.ts src/components/OmegaForm/meta/createMeta.ts
git commit -m "refactor(omegaform): extract meta/checks for filter + leaf inspection"
```

---

### Task 2.6: Phase 2 green-bar checkpoint

- [ ] **Step 1: Full test suite**

Run: `pnpm test:run && pnpm check && pnpm lint`
Expected: all green.

- [ ] **Step 2: Storybook smoke-check**

Open the five smoke-check stories.

- [ ] **Step 3: Tag**

```bash
git tag omegaform-refactor-phase2-green
```

---

## Phase 3 — Centralize validation, delete the workarounds

### Task 3.1: Localize the form-level schema in `useOmegaForm`

**Files:**
- Modify: `src/components/OmegaForm/useOmegaForm.ts`

- [ ] **Step 1: Locate**

Find the line that builds the form-level submit validator (currently around line 688):

```ts
const standardSchema = S.toStandardSchemaV1(formCompatibleSchema)
```

- [ ] **Step 2: Replace with localized version**

Add (or move up if already in scope) `useIntl()`:
```ts
const { trans } = useIntl()
```

Replace the schema build:
```ts
const standardSchema = toLocalizedStandardSchemaV1(formCompatibleSchema as any, trans)
```

Add the import at the top:
```ts
import { toLocalizedStandardSchemaV1 } from "./validation/localized"
```

- [ ] **Step 3: Run tests**

Run: `pnpm test:run`
Expected: green. Form-level validation now produces localized messages — verify by checking that the `IntegerValidationGerman` story still localizes correctly *after* later tasks (it currently localizes via the per-field schema, which is being deleted in Task 3.4).

- [ ] **Step 4: Commit**

```bash
git add src/components/OmegaForm/useOmegaForm.ts
git commit -m "refactor(omegaform): localize form-level schema with useIntl trans"
```

---

### Task 3.2: Delete the errorMap-clearing watcher

**Files:**
- Modify: `src/components/OmegaForm/useOmegaForm.ts`

- [ ] **Step 1: Find the watcher**

Locate the block (currently around lines 988–1004):

```ts
const lastSubmitAttempts = ref(0)
const submissionAttempts = form.useStore((s) => s.submissionAttempts)
const formValues = form.useStore((s) => s.values)
watch(formValues, () => {
  if (lastSubmitAttempts.value === submissionAttempts.value) return
  lastSubmitAttempts.value = submissionAttempts.value
  for (const info of Object.values(form.fieldInfo) as any[]) {
    if (info?.instance?.state.meta.errorMap?.onSubmit) {
      info.instance.setMeta((prev: any) => ({ ...prev, errorMap: { ...prev.errorMap, onSubmit: undefined } }))
    }
  }
}, { deep: true })
```

- [ ] **Step 2: Delete the entire block**

Also delete the `lastSubmitAttempts` ref and the now-orphaned `submissionAttempts` / `formValues` reads if they aren't used elsewhere. Search to confirm.

Also delete the dead `// await form.validateAllFields("blur")` line and surrounding stale comment (currently around line 928–932).

- [ ] **Step 3: Run tests**

Run: `pnpm test:run __tests__/OmegaForm/SubmitErrorClear.test.ts`
Expected: **the test from Task 0.6 fails** because the watcher no longer clears sibling errors. This is the expected, deliberate behavioral change.

Run: `pnpm test:run`
Expected: most other tests green.

- [ ] **Step 4: Rewrite `SubmitErrorClear.test.ts`**

Update the test to characterize the new behavior — TanStack revalidates the form-level schema on every value change after a failed submit:

```ts
// __tests__/OmegaForm/SubmitErrorClear.test.ts
import { mount } from "@vue/test-utils"
import { S } from "effect-app"
import { defineComponent, nextTick } from "vue"
import { describe, expect, it } from "vitest"
import OmegaIntlProvider from "../OmegaIntlProvider.vue"
import { useOmegaForm } from "../../src/components/OmegaForm"

const mountForm = <T>(setupForm: () => T): T => {
  let captured: T | undefined
  const Inner = defineComponent({
    setup() {
      captured = setupForm()
      return {}
    },
    template: "<div></div>"
  })
  const Wrapper = defineComponent({
    components: { OmegaIntlProvider, Inner },
    template: "<OmegaIntlProvider><Inner /></OmegaIntlProvider>"
  })
  mount(Wrapper)
  if (!captured) throw new Error("setupForm did not return")
  return captured
}

describe("post-submit revalidation (TanStack default)", () => {
  it("revalidates the form-level schema on value change after a failed submit", async () => {
    const schema = S.Struct({
      a: S.String.pipe(S.check(S.isMinLength(2))),
      b: S.String.pipe(S.check(S.isMinLength(2)))
    })
    const form = mountForm(() =>
      useOmegaForm(schema, { defaultValues: { a: "", b: "" } })
    )

    await form.handleSubmit()
    await nextTick()

    // After failed submit, fix only field a; field b should still fail validation
    // because TanStack revalidates the entire form-level schema.
    form.setFieldValue("a", "ok")
    await nextTick()
    await nextTick()

    // canSubmit should still be false because b is still invalid
    expect(form.store.state.canSubmit).toBe(false)

    // Now fix b too
    form.setFieldValue("b", "ok")
    await nextTick()
    await nextTick()
    expect(form.store.state.canSubmit).toBe(true)
  })
})
```

- [ ] **Step 5: Run again**

Run: `pnpm test:run`
Expected: green.

- [ ] **Step 6: Commit**

```bash
git add src/components/OmegaForm/useOmegaForm.ts __tests__/OmegaForm/SubmitErrorClear.test.ts
git commit -m "refactor(omegaform): delete errorMap-clearing watcher; rely on TanStack revalidation"
```

---

### Task 3.3: Delete `errorMap.onSubmit` reset in `OmegaInternalInput.handleChange`

**Files:**
- Modify: `src/components/OmegaForm/OmegaInternalInput.vue`

- [ ] **Step 1: Locate**

Find this block in `handleChange` (currently around line 148–154):

```ts
// whenever we change the field, regardless if we set it to null, we should reset onSubmit.
// not sure why this is not the case in tanstack form.
// Skip when the field was deleted — its meta no longer exists in the form store.
if (!fieldDeleted) {
  props.field.setMeta((m) => ({ ...m, errorMap: { ...m.errorMap, onSubmit: undefined } }))
}
```

- [ ] **Step 2: Delete it**

Just remove the `if (!fieldDeleted) { ... }` block. The `fieldDeleted` flag may also become unused — if so, simplify the surrounding code.

- [ ] **Step 3: Run tests**

Run: `pnpm test:run`
Expected: green.

- [ ] **Step 4: Commit**

```bash
git add src/components/OmegaForm/OmegaInternalInput.vue
git commit -m "refactor(omegaform): drop per-change errorMap onSubmit reset"
```

---

### Task 3.4: Delete per-field schema in `OmegaInput.vue`

**Files:**
- Modify: `src/components/OmegaForm/OmegaInput.vue`

- [ ] **Step 1: Replace the file body**

Replace the script setup block in `OmegaInput.vue` with:

```vue
<script
  setup
  lang="ts"
  generic="
  From extends Record<PropertyKey, any>,
  To extends Record<PropertyKey, any>,
  Name extends DeepKeys<From>
"
>
import { type DeepKeys } from "@tanstack/vue-form"
import { computed, inject, type Ref, useAttrs } from "vue"
import { type FieldMeta } from "./meta/types"
import { type OmegaInputPropsBase } from "./types"
import OmegaInternalInput from "./OmegaInternalInput.vue"
import { useErrorLabel } from "./errors"

const props = defineProps<OmegaInputPropsBase<From, To, Name>>()

const propsName = computed(() => props.name as DeepKeys<From>)

defineSlots<{
  label?: (props: { required?: boolean; id: string; label: string }) => any
  default?: (props: any) => any
}>()

defineOptions({ inheritAttrs: false })

const attrs = useAttrs()

const computedClass = computed(() => {
  if (props.inputClass === null) return undefined
  if (props.inputClass !== undefined) return props.inputClass
  return attrs.class as string | undefined
})

const getMetaFromArray = inject<Ref<(name: string) => FieldMeta | null> | null>(
  "getMetaFromArray",
  null
)

const meta = computed(() => {
  if (getMetaFromArray?.value && getMetaFromArray.value(props.name as DeepKeys<From>)) {
    return getMetaFromArray.value(propsName.value)
  }
  return props.form.meta[propsName.value]
})

const errori18n = useErrorLabel(props.form)
</script>
```

And replace the template's `<component :is="form.Field" :key="fieldKey" ...>` with:

```vue
<template>
  <component
    :is="form.Field"
    :name="name"
    :validators="validators"
  >
    <template #default="{ field, state }">
      <OmegaInternalInput
        v-if="meta"
        v-bind="{ ...$attrs, ...$props, inputClass: computedClass }"
        :field="field as any"
        :state="state"
        :register="form.registerField"
        :label="label ?? errori18n(propsName)"
        :meta="meta"
      >
        <template v-if="$slots.label" #label="labelProps">
          <slot name="label" v-bind="labelProps" />
        </template>
        <template #default="inputProps">
          <slot v-bind="inputProps" />
        </template>
      </OmegaInternalInput>
    </template>
  </component>
</template>
```

Note the deletions: `:key="fieldKey"`, `:validators="{ ...validators, onSubmit: schema }"`, the `schema` computed, the `composeStandardSchemas` helper, the `hasIssues` helper, the `useIntl` call, the `fieldKey` computed.

- [ ] **Step 2: Run tests + smoke**

Run: `pnpm test:run`
Expected: green.

Manually open the `IntegerValidationGerman` story and verify German validation messages still appear. They should — they now come from the form-level localized schema, not the per-field one. If they don't appear, debug Task 3.1.

- [ ] **Step 3: Commit**

```bash
git add src/components/OmegaForm/OmegaInput.vue
git commit -m "refactor(omegaform): delete per-field schema and fieldKey re-mount"
```

---

### Task 3.5: Delete `originalSchema` plumbing and `generateInputStandardSchemaFromFieldMeta`

**Files:**
- Modify: `src/components/OmegaForm/meta/types.ts`
- Modify: `src/components/OmegaForm/meta/createMeta.ts`
- Modify: `src/components/OmegaForm/validation/localized.ts`
- Modify: `src/components/OmegaForm/index.ts`
- Delete: `__tests__/OmegaForm/DiscriminatorFieldValidation.test.ts`

- [ ] **Step 1: Delete the type field**

In `meta/types.ts`, remove the `originalSchema?: StandardSchemaV1<any, any>` field from `BaseFieldMeta`.

- [ ] **Step 2: Delete the attachment plumbing**

In `meta/createMeta.ts`, delete:
- `attachOriginalSchemas`
- `toFieldStandardSchema`
- `fieldAstByPath` collection variable everywhere it's plumbed through `createMeta` / `walk`
- All call sites of `attachOriginalSchemas(...)`

- [ ] **Step 3: Delete the per-field schema generator**

In `validation/localized.ts`, delete `generateInputStandardSchemaFromFieldMeta` (~150 lines).

- [ ] **Step 4: Update `index.ts`**

Remove the export of `generateInputStandardSchemaFromFieldMeta`.

- [ ] **Step 5: Delete `DiscriminatorFieldValidation.test.ts`**

This test directly references `originalSchema` / `originalCodec` / `generateInputStandardSchemaFromFieldMeta` via `Reflect.get`. With those gone, the test is testing a deleted API. The form-level schema already validates discriminator values; that's covered by `TaggedUnionRoot.test.ts`'s `_tag` assertions plus the runtime story.

```bash
git rm __tests__/OmegaForm/DiscriminatorFieldValidation.test.ts
```

- [ ] **Step 6: Run tests + tsc + lint**

Run: `pnpm test:run && pnpm check && pnpm lint`
Expected: green.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor(omegaform): delete originalSchema plumbing and per-field schema generator"
```

---

### Task 3.6: Phase 3 green-bar checkpoint

- [ ] **Step 1: Full test suite**

Run: `pnpm test:run && pnpm check && pnpm lint`
Expected: green.

- [ ] **Step 2: Smoke check all five stories**

Especially `IntegerValidationGerman` (proves form-level localization works) and `RootLevelTaggedUnion` (proves union meta still drives the right-required-flag-per-tag behavior).

- [ ] **Step 3: Tag**

```bash
git tag omegaform-refactor-phase3-green
```

---

## Phase 4 — Cleanup (each task is an independent commit)

These tasks can be done in any order or interleaved with bug-fix work; they don't have inter-dependencies.

### Task 4.1: Translate the German confirm dialog

**Files:**
- Modify: `src/components/OmegaForm/blockDialog.ts`
- Modify: `stories/OmegaForm.stories.ts` (add the translation key to the German mock)

- [ ] **Step 1: Modify `blockDialog.ts`**

Find the line:
```ts
if (!confirm("Es sind ungespeicherte Änderungen vorhanden. Wirklich schließen?")) {
```

Replace with:
```ts
const message = formatMessage({
  id: "form.unsaved_changes_confirm",
  defaultMessage: "There are unsaved changes. Are you sure you want to close?"
})
if (!confirm(message)) {
```

You'll need to inject `useIntl` at the top of the function:
```ts
import { useIntl } from "../../utils"
```

(Or accept `formatMessage` as an optional dependency injected by the caller — match the existing pattern in `errors.ts`.)

- [ ] **Step 2: Add the German translation in storybook decorator**

In `stories/OmegaForm.stories.ts`, add to `germanTranslations`:
```ts
"form.unsaved_changes_confirm": "Es sind ungespeicherte Änderungen vorhanden. Wirklich schließen?"
```

- [ ] **Step 3: Smoke-check**

Open the `DialogBlockingExamples` story (with German locale toggled on) and trigger the confirm dialog by editing a field then attempting to close. Confirm the German text appears.

- [ ] **Step 4: Commit**

```bash
git add src/components/OmegaForm/blockDialog.ts stories/OmegaForm.stories.ts
git commit -m "i18n(omegaform): translate unsaved changes confirm dialog"
```

---

### Task 4.2: Drop deprecated string-typed fields *(conditional on consumer audit)*

**Files:**
- Modify: `src/components/OmegaForm/types.ts` (formerly `OmegaFormStuff.ts`)
- Modify: `src/components/OmegaForm/useOmegaForm.ts`

- [ ] **Step 1: Audit consumer apps**

Run from the repo root:
```bash
grep -rn 'overrideDefaultValues\|"deprecated:' apps/ 2>/dev/null
grep -rn 'defaultFromSchema' apps/ 2>/dev/null
grep -rn 'OmegaArrayProps.*items' apps/ 2>/dev/null
```

If any matches: skip this task, file an issue, keep the deprecated field one more cycle.

If no matches: proceed.

- [ ] **Step 2: Remove the deprecated string-typed fields**

In `OmegaConfig` (in `useOmegaForm.ts` or wherever it landed):
- Remove `overrideDefaultValues?: "deprecated: use defaultValuesPriority"`
- Remove `defaultFromSchema?: "deprecated: use defaultValuesPriority"`

In `OmegaArrayProps`:
- Remove `items?: "please use \`defaultItems\` instead"`

- [ ] **Step 3: Run tests + tsc**

Run: `pnpm test:run && pnpm check`
Expected: green.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor(omegaform): drop deprecated string-typed config fields"
```

---

### Task 4.3: Drop legacy `field` slot in OmegaArray.vue *(conditional)*

**Files:**
- Modify: `src/components/OmegaForm/OmegaArray.vue`

- [ ] **Step 1: Audit consumer apps**

```bash
grep -rn '<template #field' apps/ 2>/dev/null
grep -rn 'slots.field\|slot name="field"' apps/ 2>/dev/null
```

If matches: skip.

- [ ] **Step 2: Remove the legacy slot**

In `OmegaArray.vue`, remove:
```vue
<!-- TODO: legacy slot, remove this slot -->
<slot
  name="field"
  v-bind="{ field }"
/>
```

And update the `OmegaFormReturn["Array"]` slot type definition (currently in `useOmegaForm.ts`) to drop the optional `field` slot from the slots record.

- [ ] **Step 3: Run tests + tsc**

Run: `pnpm test:run && pnpm check`
Expected: green.

- [ ] **Step 4: Commit**

```bash
git add src/components/OmegaForm/OmegaArray.vue src/components/OmegaForm/useOmegaForm.ts
git commit -m "refactor(omegaform): drop legacy field slot from OmegaArray"
```

---

### Task 4.4: Audit and resolve dead legacy `_tag` warning

**Files:**
- Modify: `src/components/OmegaForm/meta/legacyWarning.ts` *(or `OmegaFormStuff.ts` if Phase 1 Task 1.2 was skipped)*
- Modify: `src/components/OmegaForm/meta/createMeta.ts` (the `metadataFromAst` caller)
- Modify: `__tests__/OmegaForm/TaggedUnionLegacyWarning.test.ts`

**Context:** Phase 0 found that the legacy `_tag` deprecation warning is dead code. The guard in `metadataFromAst` checks `S.AST.isUnion(tagProp.type)`, but in current effect-app, `S.Struct({ _tag: S.Literal("X") })` produces a bare `Literal` AST for `_tag`, not a single-element Union. The warning therefore never fires. `TaggedUnionLegacyWarning.test.ts` pins this with `expect(warnSpy).not.toHaveBeenCalled()`.

- [ ] **Step 1: AST equivalence check**

Run a quick scratch test (or REPL) to confirm: do `S.Struct({ _tag: S.Literal("X"), a: S.String })` and `S.TaggedStruct("X", { a: S.String })` produce structurally equivalent ASTs in current effect-app? If yes, there is no behavioral difference between the patterns, and no migration to nudge users toward — the warning is genuinely obsolete. If no, the guard is just wrong and can be fixed.

- [ ] **Step 2: Decide based on the audit**

**Path A — warning is obsolete (preferred if Step 1 shows AST equivalence):**

Delete the warning entirely:
- Remove the `if (...)` block that calls `warnLegacyTag` in `metadataFromAst`.
- Delete `meta/legacyWarning.ts` (and remove the re-export from `OmegaFormStuff.ts` / wherever it landed).
- Update `TaggedUnionLegacyWarning.test.ts`: replace it with a comment noting the warning was removed in Phase 4, OR delete the file entirely. Keep the file if you want a guard against the warning being re-introduced in the future.

**Path B — warning is still needed (Step 1 shows ASTs differ):**

Fix the guard in `metadataFromAst`:
```ts
// before
if (S.AST.isUnion(tagProp.type)) { warnLegacyTag(tagValue) }
// after
if (S.AST.isLiteral(tagProp.type)) { warnLegacyTag(tagValue) }
```

Update `TaggedUnionLegacyWarning.test.ts`: flip the first assertion from `not.toHaveBeenCalled()` to `toHaveBeenCalled()`, and re-add a "warns once" check.

- [ ] **Step 3: Run tests + tsc**

Run: `pnpm test:run && pnpm check`
Expected: green.

- [ ] **Step 4: Commit**

```bash
git add -A src/components/OmegaForm/ __tests__/OmegaForm/TaggedUnionLegacyWarning.test.ts
git commit -m "refactor(omegaform): <delete obsolete | fix guard for> legacy _tag warning"
```

---

### Task 4.5: Final green-bar tag

- [ ] **Step 1: Full check**

Run: `pnpm test:run && pnpm check && pnpm lint`

- [ ] **Step 2: Smoke check stories**

All five.

- [ ] **Step 3: Verify file size targets**

Run: `wc -l src/components/OmegaForm/*.ts src/components/OmegaForm/meta/*.ts src/components/OmegaForm/validation/*.ts`

Targets:
- `useOmegaForm.ts`: < 300 lines
- `meta/createMeta.ts`: < 400 lines
- All other files: < 250 lines

- [ ] **Step 4: Tag**

```bash
git tag omegaform-refactor-complete
```

---

## Self-review reminders for the executor

After each phase commit, before moving on:

1. `pnpm test:run` — green.
2. `pnpm check` (vue-tsc) — clean.
3. `pnpm lint` — clean.
4. Manual smoke check of the five Storybook stories.
5. Public API surface (`src/components/OmegaForm/index.ts`) unchanged from the start of the refactor — diff against `git show omegaform-refactor-phase0-green:src/components/OmegaForm/index.ts`.

If any check fails, do not proceed to the next phase. Fix in place; commit the fix; re-run the green-bar.

If a Phase 0 test (other than `SubmitErrorClear.test.ts` which is rewritten in Phase 3) needs to be modified during Phases 1–4 because the refactor changes observable behavior in a way you believe is correct, **stop**. The tests pin the contract; revisit the spec or call out the deviation explicitly in the commit message.

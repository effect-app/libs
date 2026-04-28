// __tests__/OmegaForm/SelectMultipleLocalization.test.ts
import { mount } from "@vue/test-utils"
import { Effect, S } from "effect-app"
import { describe, expect, it } from "vitest"
import { defineComponent } from "vue"
import { useOmegaForm } from "../../src/components/OmegaForm"
import OmegaIntlProvider from "../OmegaIntlProvider.vue"

const mountForm = <T>(setup: () => T): T => {
  let captured: T | undefined
  const Inner = defineComponent({ setup() { captured = setup(); return {} }, template: "<div></div>" })
  mount(defineComponent({
    components: { OmegaIntlProvider, Inner },
    template: "<OmegaIntlProvider><Inner /></OmegaIntlProvider>"
  }))
  if (!captured) throw new Error("no capture")
  return captured
}

const firstFieldError = (form: any, name: string): string | undefined => {
  const errs = form.getAllErrors().fields[name]?.errors
  if (!errs) return undefined
  const flat = errs.flat ? errs.flat() : errs
  return flat[0]?.message
}

describe("select / multiple validation messages carry localized payload", () => {
  it("S.Literals — invalid (non-empty) member emits 'select' message with members", async () => {
    const schema = S.Struct({ color: S.Literals(["red", "blue", "green"]) })
    const form = mountForm(() =>
      useOmegaForm(schema, {
        defaultValues: { color: "purple" } as any,
        onSubmit: async () => undefined
      })
    )
    await Effect.runPromise(form.handleSubmitEffect())
    const msg = firstFieldError(form, "color")
    // OmegaIntlProvider's mock `trans` returns `${key}_translated` and
    // ignores variables — so we just need the i18n key to flow, not the
    // substituted variables.
    expect(msg, `got: ${msg}`).toBe("validation.not_a_valid_translated")
  })

  it("S.Array(S.Literals) — non-array value emits 'multiple' message", async () => {
    const schema = S.Struct({ tags: S.Array(S.Literals(["a", "b", "c"])) })
    const form = mountForm(() =>
      useOmegaForm(schema, {
        defaultValues: { tags: "not-an-array" } as any,
        onSubmit: async () => undefined
      })
    )
    await Effect.runPromise(form.handleSubmitEffect())
    const msg = firstFieldError(form, "tags")
    expect(msg, `got: ${msg}`).toBe("validation.not_a_valid_translated")
  })

  it("S.NullOr(S.Literals) — invalid member emits localized select message", async () => {
    const schema = S.Struct({ color: S.NullOr(S.Literals(["red", "blue", "green"])) })
    const form = mountForm(() =>
      useOmegaForm(schema, {
        defaultValues: { color: "purple" } as any,
        onSubmit: async () => undefined
      })
    )
    await Effect.runPromise(form.handleSubmitEffect())
    const msg = firstFieldError(form, "color")
    expect(msg, `got: ${msg}`).toBe("validation.not_a_valid_translated")
  })

  it("S.UndefinedOr(S.Literals) — invalid member emits localized select message", async () => {
    const schema = S.Struct({ color: S.UndefinedOr(S.Literals(["red", "blue", "green"])) })
    const form = mountForm(() =>
      useOmegaForm(schema, {
        defaultValues: { color: "purple" } as any,
        onSubmit: async () => undefined
      })
    )
    await Effect.runPromise(form.handleSubmitEffect())
    const msg = firstFieldError(form, "color")
    expect(msg, `got: ${msg}`).toBe("validation.not_a_valid_translated")
  })

  it("user-supplied .annotate({ message }) on S.Literals is preserved", async () => {
    const schema = S.Struct({
      color: S.Literals(["red", "blue", "green"]).annotate({
        message: "user.custom.message"
      })
    })
    const form = mountForm(() =>
      useOmegaForm(schema, {
        defaultValues: { color: "purple" } as any,
        onSubmit: async () => undefined
      })
    )
    await Effect.runPromise(form.handleSubmitEffect())
    const msg = firstFieldError(form, "color")
    // User annotation wins — verbatim, not piped through trans.
    expect(msg).toBe("user.custom.message")
  })

  it("empty value on a required select also emits the localized 'select' message (matches main)", async () => {
    // Main's `generateInputStandardSchemaFromFieldMeta` annotated the entire
    // S.Literals schema with a `validation.not_a_valid` message, so any
    // failure (including undefined) surfaced it. We preserve that behavior.
    const schema = S.Struct({ color: S.Literals(["red", "blue", "green"]) })
    const form = mountForm(() =>
      useOmegaForm(schema, {
        defaultValues: { color: undefined } as any,
        onSubmit: async () => undefined
      })
    )
    await Effect.runPromise(form.handleSubmitEffect())
    const msg = firstFieldError(form, "color")
    expect(msg).toBe("validation.not_a_valid_translated")
  })
})

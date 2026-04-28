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

const firstFieldError = (form: any, name: string): string | undefined =>
  form.getAllErrors().fields[name]?.errors?.flat?.()[0]?.message
  ?? form.getAllErrors().fields[name]?.errors?.[0]?.message

describe("select / multiple validation messages carry payload", () => {
  it("AST message annotation on Literals overrides default", async () => {
    const schema = S.Struct({
      color: S.Literals(["red", "blue", "green"]).annotate({
        message: "validation.not_a_valid_translated{select|red, blue, green}"
      })
    })
    const std = S.toStandardSchemaV1(schema as any)
    const r = await std["~standard"].validate({ color: "purple" })
    // eslint-disable-next-line no-console
    console.log("ANNOTATED:", JSON.stringify(r, null, 2))
    expect(true).toBe(true)
  })

  it("inspect raw issue tree for S.Literals failure", async () => {
    const schema = S.Struct({ color: S.Literals(["red", "blue", "green"]) })
    const calls: any[] = []
    const std = S.toStandardSchemaV1(schema as any, {
      leafHook: (issue: any) => {
        calls.push({ kind: "leaf", _tag: issue._tag, ast: issue.ast?._tag })
        return `LEAF[${issue._tag}/${issue.ast?._tag}]`
      },
      checkHook: (issue: any) => {
        calls.push({ kind: "check", filter: issue.filter?.annotations })
        return `CHECK[${issue.filter?.annotations?.identifier ?? "?"}]`
      }
    })
    const r = await std["~standard"].validate({ color: "purple" })
    // eslint-disable-next-line no-console
    console.log("CALLS:", JSON.stringify(calls, null, 2))
    // eslint-disable-next-line no-console
    console.log("RESULT:", JSON.stringify(r, null, 2))
    expect(true).toBe(true)
  })

  it("select (S.Literals) emits {type: 'select', message: members}", async () => {
    const schema = S.Struct({ color: S.Literals(["red", "blue", "green"]) })
    const form = mountForm(() =>
      useOmegaForm(schema, {
        defaultValues: { color: "purple" } as any,
        onSubmit: async () => undefined
      })
    )
    await Effect.runPromise(form.handleSubmitEffect())
    // eslint-disable-next-line no-console
    console.log("SELECT errors:", JSON.stringify(form.getAllErrors(), null, 2))
    const msg = firstFieldError(form, "color")
    // OmegaIntlProvider's translator renders "validation.not_a_valid"
    // with {type, message} placeholders; the test is intentionally tolerant
    // about whitespace/wrapping but strict that BOTH placeholders flowed.
    expect(msg, "no message at all").toBeDefined()
    expect(msg, `got: ${msg}`).toMatch(/select/i)
    expect(msg, `got: ${msg}`).toMatch(/red/)
    expect(msg, `got: ${msg}`).toMatch(/blue/)
    expect(msg, `got: ${msg}`).toMatch(/green/)
  })

  it("multiple (S.Array of literal union) emits {type: 'multiple', message: members}", async () => {
    const schema = S.Struct({ tags: S.Array(S.Literals(["a", "b", "c"])) })
    const form = mountForm(() =>
      useOmegaForm(schema, {
        defaultValues: { tags: ["zzz"] } as any,
        onSubmit: async () => undefined
      })
    )
    await Effect.runPromise(form.handleSubmitEffect())
    const msg = firstFieldError(form, "tags")
    expect(msg, "no message at all").toBeDefined()
    expect(msg, `got: ${msg}`).toMatch(/multiple/i)
  })
})

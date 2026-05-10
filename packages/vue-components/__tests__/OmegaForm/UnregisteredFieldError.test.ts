// __tests__/OmegaForm/UnregisteredFieldError.test.ts
//
// Regression test for Phase 3 Task 3.2 of the OmegaForm refactor.
//
// Background: Task 3.2 switched the form's primary validator from
// `validators.onSubmit` -> `validators.onDynamic` and wired
// `validationLogic: revalidateLogic()`. With that switch, our localized
// standard schema now produces issues at `errorMap.onDynamic`, NOT
// `errorMap.onSubmit`. The `eHoc` setup in `errors.ts` was still reading
// `errorMap.value.onSubmit`, silently breaking the unregistered-field
// error-display path (no test covered it).
//
// This test mounts a form with a two-field schema, registers ONLY the
// first field (`a`) via `<form.Input>`, leaves the second (`b`)
// unregistered, calls `form.handleSubmit()`, then asserts that:
//   1. `form.store.state.errorMap.onDynamic` contains an issue for `b`.
//   2. The `eHoc`-wrapped `Errors` component surfaces an entry whose
//      `inputId` is `b` (the unregistered field path).
import { mount } from "@vue/test-utils"
import * as S from "effect-app/Schema"
import { describe, expect, it } from "vitest"
import { defineComponent, nextTick } from "vue"
import { useOmegaForm } from "../../src/components/OmegaForm"
import OmegaIntlProvider from "../OmegaIntlProvider.vue"

const OmegaErrorsStub = {
  name: "OmegaErrorsInternal",
  template: `<div class="mock-omega-errors">{{ JSON.stringify(errors) }}</div>`,
  props: ["errors", "generalErrors", "showErrors", "hideErrorDetails"]
}

describe("eHoc unregistered-field error path (errorMap.onDynamic)", () => {
  it("surfaces errors for schema fields that are NOT mounted via <form.Input>", async () => {
    const schema = S.Struct({
      a: S.String.pipe(S.check(S.isMinLength(2))),
      b: S.String.pipe(S.check(S.isMinLength(2)))
    })

    let captured: ReturnType<typeof useOmegaForm<any, any>> | undefined
    const Inner = defineComponent({
      setup() {
        // Use a valid value for `a` so its field-level validator passes and
        // TanStack proceeds to run the form-level `onDynamic` validator,
        // which is what surfaces the unregistered field's error.
        const form = useOmegaForm(schema, { defaultValues: { a: "valid_a", b: "" } })
        captured = form as any
        return { form }
      },
      // Register ONLY field `a`. Field `b` is in the schema but is NOT
      // mounted via `<form.Input>`, so it stays unregistered.
      template: `
        <component :is="form.Form">
          <component :is="form.Input" name="a" />
          <component :is="form.Errors" />
        </component>
      `
    })
    const Wrapper = defineComponent({
      components: { OmegaIntlProvider, Inner },
      template: "<OmegaIntlProvider><Inner /></OmegaIntlProvider>"
    })
    const wrapper = mount(Wrapper, {
      global: {
        stubs: {
          OmegaErrorsInternal: OmegaErrorsStub
        }
      }
    })
    if (!captured) throw new Error("useOmegaForm did not return")
    const form = captured

    await form.handleSubmit()
    await nextTick()
    await nextTick()

    // 1. Direct shape check: with revalidateLogic + onDynamic validator,
    //    schema-level issues land in errorMap.onDynamic.
    const onDynamic = form.store.state.errorMap.onDynamic as
      | Record<string, Array<{ path?: ReadonlyArray<string | number>; message?: string }>>
      | undefined
    expect(onDynamic, "errorMap.onDynamic should be populated after a failed submit").toBeTruthy()

    const allIssues = Object.values(onDynamic ?? {}).flat()
    const bIssue = allIssues.find((iss) => Array.isArray(iss?.path) && iss!.path!.join(".") === "b")
    expect(bIssue, "errorMap.onDynamic should include an issue for unregistered field b").toBeTruthy()

    // 2. Integration check: eHoc must read onDynamic and surface `b` in
    //    the errors prop forwarded to OmegaErrorsInternal.
    const errorDiv = wrapper.find(".mock-omega-errors")
    expect(errorDiv.exists()).toBe(true)
    const rendered = errorDiv.text()
    expect(rendered).toContain("\"inputId\":\"b\"")
  })
})

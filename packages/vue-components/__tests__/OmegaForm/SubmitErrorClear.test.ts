// __tests__/OmegaForm/SubmitErrorClear.test.ts
import { mount } from "@vue/test-utils"
import * as S from "effect-app/Schema"
import { describe, expect, it } from "vitest"
import { defineComponent, nextTick } from "vue"
import { useOmegaForm } from "../../src/components/OmegaForm"
import OmegaIntlProvider from "../OmegaIntlProvider.vue"

describe("post-submit revalidation (TanStack default)", () => {
  it("revalidates the form-level schema on value change after a failed submit", async () => {
    const schema = S.Struct({
      a: S.String.pipe(S.check(S.isMinLength(2))),
      b: S.String.pipe(S.check(S.isMinLength(2)))
    })

    let captured: ReturnType<typeof useOmegaForm<any, any>> | undefined
    const Inner = defineComponent({
      setup() {
        const form = useOmegaForm(schema, { defaultValues: { a: "", b: "" } })
        captured = form as any
        return { form }
      },
      // Render fields so they register with the form. Without mounted fields,
      // setFieldValue cannot trigger validation (FormApi.validateField bails
      // when fieldInfo[name].instance is undefined).
      template: `
        <component :is="form.Form">
          <component :is="form.Input" name="a" />
          <component :is="form.Input" name="b" />
        </component>
      `
    })
    const Wrapper = defineComponent({
      components: { OmegaIntlProvider, Inner },
      template: "<OmegaIntlProvider><Inner /></OmegaIntlProvider>"
    })
    mount(Wrapper)
    if (!captured) throw new Error("setupForm did not return")
    const form = captured

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

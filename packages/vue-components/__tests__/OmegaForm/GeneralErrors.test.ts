import { mount } from "@vue/test-utils"
import * as S from "effect-app/Schema"
import { describe, expect, it } from "vitest"
import { defineComponent, h, nextTick } from "vue"
import { useOmegaForm } from "../../src/components/OmegaForm"
import OmegaErrorsInternal from "../../src/components/OmegaForm/OmegaErrorsInternal.vue"

describe("OmegaForm general errors", () => {
  it("renders a string returned by an onSubmit validator and clears it after correction", async () => {
    const message = "Passwörter stimmen nicht überein"
    const Inner = defineComponent({
      setup() {
        const form = useOmegaForm(S.Struct({ password: S.String, confirmation: S.String }), {
          defaultValues: { password: "secret", confirmation: "different" },
          validators: {
            onSubmit: ({ value }) => value.password === value.confirmation ? undefined : message
          }
        })
        return { form }
      },
      template: `<component :is="form.Form"><component :is="form.Errors" /></component>`
    })
    const wrapper = mount(Inner)

    await wrapper.vm.form.handleSubmit()
    await nextTick()
    expect(wrapper.get("[role=\"alert\"]").text()).toContain(message)

    wrapper.vm.form.setFieldValue("confirmation", "secret")
    await wrapper.vm.form.handleSubmit()
    await nextTick()
    expect(wrapper.find("[role=\"alert\"]").exists()).toBe(false)
    wrapper.unmount()
  })

  it("preserves schema messages alongside strings and ignores unsupported values", () => {
    const wrapper = mount(OmegaErrorsInternal, {
      props: {
        errors: [],
        generalErrors: [
          "Form error",
          { rows: [{ message: "Schema error" }, null, 42, { message: 123 }, { message: "" }] },
          null,
          undefined,
          false,
          42,
          "",
          { rows: "unsupported", other: null }
        ]
      },
      slots: {
        default: ({ showedGeneralErrors }) => h("div", JSON.stringify(showedGeneralErrors))
      }
    })

    expect(wrapper.text()).toBe(JSON.stringify(["Form error", "Schema error"]))
    wrapper.unmount()
  })
})

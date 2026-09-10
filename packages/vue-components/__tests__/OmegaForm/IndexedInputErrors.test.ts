import { mount } from "@vue/test-utils"
import * as S from "effect-app/Schema"
import { describe, expect, it } from "vitest"
import { defineComponent, nextTick, ref } from "vue"
import { useOmegaForm } from "../../src/components/OmegaForm"

describe("OmegaForm indexed inputs", () => {
  it.each([0, 13])("renders rows[%i].text outside form.Array with one labelled error", async (index) => {
    const wrapper = mount(defineComponent({
      setup() {
        const form = useOmegaForm(
          S.Struct({
            rows: S.Array(S.Struct({ text: S.String.pipe(S.check(S.isMinLength(2))) }))
          }),
          {
            defaultValues: {
              rows: Array.from({ length: index + 1 }, (_, i) => ({ text: i === index ? "" : "valid" }))
            }
          }
        )
        return { form, name: `rows[${index}].text`, visible: ref(true) }
      },
      template: `
        <component :is="form.Form">
          <component v-if="visible" :is="form.Input" :name="name" label="Row text">
            <template #default="{ id, state, errorMessages }">
              <input :id="id" :value="state.value" />
              <span data-testid="field-errors">{{ errorMessages.join(', ') }}</span>
            </template>
          </component>
          <component :is="form.Errors" />
        </component>
      `
    }))

    const input = wrapper.get("input")
    await wrapper.vm.form.handleSubmit()
    await nextTick()

    expect(wrapper.get("[data-testid=\"field-errors\"]").text()).not.toBe("")
    const entries = wrapper.findAll("[role=\"alert\"] .error-item")
    expect(entries).toHaveLength(1)
    expect(entries[0].get("label").text()).toBe("Row text")
    expect(entries[0].get("label").attributes("for")).toBe(input.attributes("id"))

    wrapper.vm.visible = false
    await nextTick()
    await wrapper.vm.form.handleSubmit()
    await nextTick()

    const unregistered = wrapper.findAll("[role=\"alert\"] .error-item")
    expect(unregistered).toHaveLength(1)
    expect(unregistered[0].get("label").attributes("for")).toBe(`rows.${index}.text`)
    wrapper.unmount()
  })

  it("still resolves indexed metadata inside form.Array", () => {
    const wrapper = mount(defineComponent({
      setup() {
        return {
          form: useOmegaForm(S.Struct({ rows: S.Array(S.Struct({ text: S.String })) }), {
            defaultValues: { rows: [{ text: "existing" }] }
          })
        }
      },
      template: `
        <component :is="form.Form">
          <component :is="form.Array" name="rows">
            <template #default="{ index }">
              <component :is="form.Input" :name="'rows[' + index + '].text'">
                <template #default="{ state }"><input :value="state.value" /></template>
              </component>
            </template>
          </component>
        </component>
      `
    }))

    expect(wrapper.get("input").element.value).toBe("existing")
    wrapper.unmount()
  })
})

import { mount } from "@vue/test-utils"
import * as S from "effect-app/Schema"
import { describe, expect, it } from "vitest"
import { defineComponent } from "vue"
import { useOmegaForm } from "../../src/components/OmegaForm"
import OmegaIntlProvider from "../OmegaIntlProvider.vue"

const VTextField = defineComponent({
  props: {
    modelValue: {
      type: String,
      default: ""
    }
  },
  emits: ["update:modelValue"],
  template: `
    <input
      v-bind="$attrs"
      :value="modelValue"
      @input="$emit('update:modelValue', $event.target.value)"
    />
  `
})

describe("OmegaForm input attributes", () => {
  it("does not forward the internal form object as a native form attribute", async () => {
    const wrapper = mount({
      components: { OmegaIntlProvider },
      template: `
        <OmegaIntlProvider>
          <component :is="form.Form">
            <component
              :is="form.Input"
              label="Password"
              name="password"
              type="password"
            />
            <button type="submit">submit</button>
          </component>
        </OmegaIntlProvider>
      `,
      setup() {
        const form = useOmegaForm(
          S.Struct({
            password: S.NonEmptyString255
          }),
          {
            defaultValues: {
              password: ""
            }
          }
        )

        return { form }
      }
    }, {
      global: {
        components: { VTextField }
      }
    })

    await wrapper.vm.$nextTick()

    const input = wrapper.find("input")
    const nativeForm = wrapper.find("form").element

    expect(input.attributes("form")).toBeUndefined()
    expect((input.element as HTMLInputElement).form).toBe(nativeForm)
  })
})

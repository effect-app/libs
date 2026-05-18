import { mount } from "@vue/test-utils"
import * as S from "effect-app/Schema"
import { describe, expect, it } from "vitest"
import { useOmegaForm } from "../../src/components/OmegaForm"
import OmegaIntlProvider from "../OmegaIntlProvider.vue"

describe("OmegaForm input reactivity", () => {
  it("reflects value changes from the slot `state` in the view", async () => {
    const schema = S.Struct({
      name: S.String
    })

    const wrapper = mount({
      components: { OmegaIntlProvider },
      template: `
        <OmegaIntlProvider>
          <component :is="form.Form">
            <component :is="form.Input" label="Name" name="name">
              <template #default="{ field, state }">
                <input
                  data-testid="input"
                  :value="state.value"
                  @input="(e) => field.handleChange(e.target.value)"
                />
                <span data-testid="display">{{ state.value }}</span>
              </template>
            </component>
          </component>
        </OmegaIntlProvider>
      `,
      setup() {
        const form = useOmegaForm(schema, {
          defaultValues: { name: "" }
        })
        return { form }
      }
    })

    await wrapper.vm.$nextTick()

    const input = wrapper.find("[data-testid='input']")
    await input.setValue("hello")
    await wrapper.vm.$nextTick()

    // The slot `state` must stay in sync with the form store
    expect(wrapper.find("[data-testid='display']").text()).toBe("hello")
    expect((input.element as HTMLInputElement).value).toBe("hello")
  })
})

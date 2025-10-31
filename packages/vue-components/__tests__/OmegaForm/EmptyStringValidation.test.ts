import { mount } from "@vue/test-utils"
import { S } from "effect-app"
import { describe, it } from "vitest"
import { useOmegaForm } from "../../src/components/OmegaForm"
import OmegaIntlProvider from "../OmegaIntlProvider.vue"

describe("Empty string validation for nested NonEmptyString fields", () => {
  it("demonstrates current empty string behavior", async () => {
    const schema = S.Struct({
      asder2: S.Struct({
        value: S.NonEmptyString100
      })
    })

    const wrapper = mount({
      components: {
        OmegaIntlProvider
      },
      template: `
        <OmegaIntlProvider>
          <component :is="form.Form" :subscribe="['values', 'canSubmit', 'errors']">
            <template #default="{ subscribedValues: { values, canSubmit, errors } }">
              <div data-testid="debug">
                <div>Values: {{ JSON.stringify(values) }}</div>
                <div data-testid="canSubmit">Can Submit: {{ canSubmit }}</div>
                <div>Errors: {{ JSON.stringify(errors) }}</div>
              </div>
              <component :is="form.Input"
                label="asder2"
                name="asder2.value"
              >
                <template #default="{ field, label, state }">
                  <label :for="field.name">{{ label }}</label>
                  <input
                    :id="field.name"
                    v-model="state.value"
                    :name="field.name"
                    data-testid="input"
                    style="border: 1px solid red"
                    @change="(e) => field.handleChange(e.target.value ?? '')"
                  />
                </template>
              </component>
              <component :is="form.Errors" />
              <button type="submit" data-testid="submit" @click.prevent="form.handleSubmit()">
                submit
              </button>
            </template>
          </component>
        </OmegaIntlProvider>
      `,
      setup() {
        const form = useOmegaForm(schema, {
          defaultValues: {
            asder2: {
              value: ""
            }
          },
          onSubmit: async ({ value }) => {
            console.log("Form submitted with:", value)
          }
        })
        return { form }
      }
    })

    await wrapper.vm.$nextTick()

    // Click submit with empty string
    await wrapper.find("[data-testid='submit']").trigger("click")
    await wrapper.vm.$nextTick()

    // Check for validation error
    expect(wrapper.text()).toContain("validation.empty")
  })
})

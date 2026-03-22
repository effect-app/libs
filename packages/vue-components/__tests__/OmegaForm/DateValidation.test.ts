import { mount } from "@vue/test-utils"
import { S } from "effect-app"
import { describe, expect, it, vi } from "vitest"
import { useOmegaForm } from "../../src/components/OmegaForm"
import OmegaIntlProvider from "../OmegaIntlProvider.vue"

describe("Date field validation", () => {
  it("accepts a raw YYYY-MM-DD string and decodes it to Date on submit", async () => {
    let submittedValue: { date: Date } | null = null

    const wrapper = mount({
      components: {
        OmegaIntlProvider
      },
      template: `
        <OmegaIntlProvider>
          <component :is="form.Form" :subscribe="['errors']">
            <template #default="{ subscribedValues: { errors } }">
              <div data-testid="errors">{{ JSON.stringify(errors) }}</div>
              <component :is="form.Input"
                label="date"
                name="date"
              >
                <template #default="{ field, state }">
                  <input
                    :id="field.name"
                    :value="state.value ?? ''"
                    data-testid="date-input"
                    type="date"
                    @input="e => field.handleChange(e.target.value)"
                  />
                </template>
              </component>
              <button type="submit" data-testid="submit" @click.prevent="form.handleSubmit()">
                submit
              </button>
            </template>
          </component>
        </OmegaIntlProvider>
      `,
      setup() {
        const form = useOmegaForm(
          S.Struct({
            date: S.Date
          }),
          {
            onSubmit: async ({ value }) => {
              submittedValue = value
            }
          }
        )

        return { form }
      }
    })

    await wrapper.find("[data-testid='date-input']").setValue("2024-06-01")
    await wrapper.find("[data-testid='submit']").trigger("click")

    await vi.waitFor(() => {
      expect(submittedValue).not.toBeNull()
    })

    expect(submittedValue?.date).toBeInstanceOf(Date)
    expect(submittedValue?.date.toISOString()).toContain("2024-06-01")
    expect(wrapper.find("[data-testid='errors']").text()).toBe("[]")
  })
})

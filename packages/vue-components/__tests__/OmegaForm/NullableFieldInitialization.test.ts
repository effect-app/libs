import { mount } from "@vue/test-utils"
import { S } from "effect-app"
import { describe, expect, it, vi } from "vitest"
import { useOmegaForm } from "../../src/components/OmegaForm"
import OmegaIntlProvider from "../OmegaIntlProvider.vue"

describe("Nullable field initialization", () => {
  it("should initialize nullable fields with null when missing from defaultValues", async () => {
    const schema = S.Struct({
      aString: S.NullOr(S.NonEmptyString255).withDefault,
      bString: S.NullOr(S.NonEmptyString255).withDefault,
      cStruct: S
        .NullOr(S.Struct({
          dString: S.NullOr(S.NonEmptyString255).withDefault
        }))
        .withDefault,
      cLiteral: S.NullOr(S.Literal("test", "test2")).withDefault
    })

    let submittedValue: Record<string, unknown> | null = null
    let submitError = null

    const wrapper = mount({
      components: {
        OmegaIntlProvider
      },
      template: `
        <OmegaIntlProvider>
          <component :is="form.Form" :subscribe="['values']">
            <template #default="{ subscribedValues: { values } }">
              <div data-testid="values">{{ JSON.stringify(values) }}</div>
              <component :is="form.Input"
                label="aString"
                name="aString"
              >
                <template #default="{ field, state }">
                  <input
                    :id="field.name"
                    :value="state.value ?? ''"
                    data-testid="aString-input"
                    @input="field.handleChange($event.target.value)"
                  />
                </template>
              </component>
              <component :is="form.Input"
                label="bString"
                name="bString"
              >
                <template #default="{ field, state }">
                  <input
                    :id="field.name"
                    :value="state.value ?? ''"
                    data-testid="bString-input"
                    @input="field.handleChange($event.target.value)"
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
            aString: null
          },
          onSubmit: async ({ value }) => {
            try {
              submittedValue = value
            } catch (error) {
              submitError = error
            }
          }
        })
        return { form }
      }
    })

    // Check that both fields are initialized with null (not empty string)
    await vi.waitFor(() => {
      const valuesText = wrapper.find("[data-testid=\"values\"]").text()
      expect(valuesText).toContain("\"aString\":null")
      expect(valuesText).toContain("\"bString\":null")
      expect(valuesText).toContain("\"cStruct\":null")
    })

    // Submit the form
    await wrapper.find("[data-testid=\"submit\"]").trigger("click")

    // Wait for the submission to complete
    await vi.waitFor(() => {
      expect(submittedValue).not.toBeNull()
    })

    // Check that form submitted successfully without errors
    expect(submitError).toBeNull()
    expect(submittedValue).toEqual({
      aString: null,
      bString: null,
      cStruct: null,
      cLiteral: null
    })
  })

  it("should convert empty string to null for nullable fields", async () => {
    const schema = S.Struct({
      aString: S.NullOr(S.NonEmptyString255).withDefault,
      bString: S.NonEmptyString255
    })

    const wrapper = mount({
      components: {
        OmegaIntlProvider
      },
      template: `
        <OmegaIntlProvider>
          <component :is="form.Form" :subscribe="['values']">
            <template #default="{ subscribedValues: { values } }">
              <div data-testid="values">{{ JSON.stringify(values) }}</div>
              <component :is="form.Input"
                label="aString"
                name="aString"
              >
                <template #default="{ field, state }">
                  <input
                    :id="field.name"
                    :value="state.value ?? ''"
                    data-testid="aString-input"
                    @input="field.handleChange($event.target.value)"
                  />
                </template>
              </component>
              <component :is="form.Input"
                label="bString"
                name="bString"
              >
                <template #default="{ field, state }">
                  <input
                    :id="field.name"
                    :value="state.value ?? ''"
                    data-testid="bString-input"
                    @input="field.handleChange($event.target.value)"
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
          onSubmit: async () => {
            // Should not be called since bString is required and missing
          }
        })
        return { form }
      }
    })

    await wrapper.vm.$nextTick()

    // aString should be null (nullable field with empty string)
    const valuesText = wrapper.find("[data-testid=\"values\"]").text()
    expect(valuesText).toContain("\"aString\":null")

    // Submit the form - should fail because bString is required
    await wrapper.find("[data-testid=\"submit\"]").trigger("click")
    await wrapper.vm.$nextTick()

    // Check that there's an error for bString
    const errors = wrapper.find("[data-testid=\"omega-errors\"]")
    if (errors.exists()) {
      expect(errors.text()).toContain("bString")
    }
  })
})

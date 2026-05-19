import { mount } from "@vue/test-utils"
import * as S from "effect-app/Schema"
import { describe, expect, it, vi } from "vitest"
import { useOmegaForm } from "../../src/components/OmegaForm"
import OmegaIntlProvider from "../OmegaIntlProvider.vue"

/**
 * Regression repro for the configurator `LinkedOption.override` schema.
 *
 * `override` is a nullable struct (`S.NullOr(S.Struct({...})).withConstructorDefault`)
 * whose own children are themselves nullable (`S.NullOr(...)`). The form starts
 * with `override === null`. As soon as the user fills ONE child (`override.min`),
 * the struct materialises while its siblings (`override.max`, `override.readOnly`)
 * are still `undefined`.
 *
 * `undefined` is not a valid member of `S.NullOr(...)`, so validation rejected the
 * untouched siblings with "field must not be empty" and the form couldn't submit.
 * The configurator worked around this by making every child `S.optional`; the
 * correct behaviour is for OmegaForm to treat an untouched nullable child as
 * `null` once its nullable parent struct materialises.
 */
describe("Nullable nested struct validation", () => {
  const schema = S.Struct({
    optionId: S.NullOr(S.String),
    override: S
      .NullOr(S.Struct({
        min: S.NullOr(S.NonNegativeNumber),
        max: S.NullOr(S.NonNegativeNumber),
        readOnly: S.NullOr(S.Boolean).withConstructorDefault,
        isInteger: S.optional(S.NullOr(S.Boolean))
      }))
      .withConstructorDefault
  })

  it("submits when only one child of a nullable struct is filled", async () => {
    let submittedValue: Record<string, unknown> | null = null

    const wrapper = mount({
      components: { OmegaIntlProvider },
      template: `
        <OmegaIntlProvider>
          <component :is="form.Form" :subscribe="['values']">
            <template #default="{ subscribedValues: { values } }">
              <div data-testid="values">{{ JSON.stringify(values) }}</div>
              <component :is="form.Input" label="min" name="override.min">
                <template #default="{ field, state }">
                  <input
                    :id="field.name"
                    :value="state.value ?? ''"
                    data-testid="min-input"
                    @input="field.handleChange(Number($event.target.value))"
                  />
                </template>
              </component>
              <component :is="form.Input" label="max" name="override.max">
                <template #default="{ field, state }">
                  <input :id="field.name" :value="state.value ?? ''" data-testid="max-input" />
                </template>
              </component>
              <component :is="form.Input" label="readOnly" name="override.readOnly">
                <template #default="{ field, state }">
                  <input type="checkbox" :id="field.name" :checked="state.value ?? false" data-testid="readOnly-input" />
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
          onSubmit: async ({ value }) => {
            submittedValue = value as Record<string, unknown>
          }
        })
        return { form }
      }
    })

    // The whole struct starts null.
    await vi.waitFor(() => {
      expect(wrapper.find("[data-testid=\"values\"]").text()).toContain("\"override\":null")
    })

    // User fills only `override.min`.
    await wrapper.find("[data-testid=\"min-input\"]").setValue("100")

    // The struct materialised: its untouched nullable siblings are backfilled
    // into the live form state, not left `undefined`.
    await vi.waitFor(() => {
      const valuesText = wrapper.find("[data-testid=\"values\"]").text()
      expect(valuesText).toContain("\"min\":100")
      expect(valuesText).toContain("\"max\":null")
      expect(valuesText).toContain("\"readOnly\":null")
    })

    // Submit.
    await wrapper.find("[data-testid=\"submit\"]").trigger("click")

    // The untouched nullable siblings must NOT block submission; they decode as null.
    await vi.waitFor(() => {
      expect(submittedValue).not.toBeNull()
    })

    expect(submittedValue).toMatchObject({
      override: {
        min: 100,
        max: null,
        readOnly: null
      }
    })
  })

  it("keeps an untouched nullable struct as null", async () => {
    let submittedValue: Record<string, unknown> | null = null

    const wrapper = mount({
      components: { OmegaIntlProvider },
      template: `
        <OmegaIntlProvider>
          <component :is="form.Form">
            <button type="submit" data-testid="submit" @click.prevent="form.handleSubmit()">submit</button>
          </component>
        </OmegaIntlProvider>
      `,
      setup() {
        const form = useOmegaForm(schema, {
          onSubmit: async ({ value }) => {
            submittedValue = value as Record<string, unknown>
          }
        })
        return { form }
      }
    })

    await wrapper.find("[data-testid=\"submit\"]").trigger("click")

    await vi.waitFor(() => {
      expect(submittedValue).not.toBeNull()
    })

    // Nothing was filled — `override` must stay null, not materialise.
    expect(submittedValue).toMatchObject({ override: null })
  })
})

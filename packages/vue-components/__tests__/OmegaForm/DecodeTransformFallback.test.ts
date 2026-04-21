import { mount } from "@vue/test-utils"
import { S, SchemaGetter } from "effect-app"
import { describe, expect, it } from "vitest"
import { createUseFormWithCustomInput, useOmegaForm } from "../../src/components/OmegaForm"
import { generateMetaFromSchema, type NumberFieldMeta } from "../../src/components/OmegaForm/OmegaFormStuff"
import OmegaIntlProvider from "../OmegaIntlProvider.vue"

const CustomNumberInput = {
  template: `
    <div data-testid="custom-input">
      <input
        :id="inputProps.id"
        :name="field.name"
        :value="field.state.value ?? ''"
        @input="field.handleChange($event.target.value === '' ? undefined : Number($event.target.value))"
        data-testid="custom-input-field"
      />
      <span
        v-if="inputProps.error"
        class="error"
        data-testid="custom-input-error"
      >{{ inputProps.errorMessages.join(', ') }}</span>
    </div>
  `,
  props: ["inputProps", "field"],
  inheritAttrs: false
}

describe("OmegaForm decodeTo fallback transform", () => {
  const inputSchema = S.Struct({ amount: S.PositiveInt })

  const transformedSchema = S.Struct({ amount: S.NonNegativeInt }).pipe(
    S.decodeTo(inputSchema, {
      decode: SchemaGetter.transform((input: { amount: number }) => input.amount === 0 ? { amount: 666 } : input),
      encode: SchemaGetter.passthrough({ strict: false })
    })
  )

  const createWrapper = (defaultValues: { amount: number }) => {
    let submittedValue: any = null

    const wrapper = mount({
      components: { OmegaIntlProvider },
      template: `
        <OmegaIntlProvider>
          <component :is="form.Form">
            <template #default>
              <button type="submit" data-testid="submit" @click.prevent="form.handleSubmit()">
                submit
              </button>
            </template>
          </component>
        </OmegaIntlProvider>
      `,
      setup() {
        const form = useOmegaForm(transformedSchema, {
          defaultValues,
          onSubmit: async ({ value }) => {
            submittedValue = value
          }
        })
        return { form, getSubmittedValue: () => submittedValue }
      }
    })

    return wrapper
  }

  it("should accept 0 at the input boundary and pass 666 to onSubmit via decode", async () => {
    const wrapper = createWrapper({ amount: 0 })
    await wrapper.vm.$nextTick()

    await wrapper.find("[data-testid=\"submit\"]").trigger("click")
    await wrapper.vm.$nextTick()
    await new Promise((resolve) => setTimeout(resolve, 100))

    const vm = wrapper.vm as any
    expect(vm.getSubmittedValue()).toEqual({ amount: 666 })
  })

  it("should pass through a positive amount unchanged", async () => {
    const wrapper = createWrapper({ amount: 5 })
    await wrapper.vm.$nextTick()

    await wrapper.find("[data-testid=\"submit\"]").trigger("click")
    await wrapper.vm.$nextTick()
    await new Promise((resolve) => setTimeout(resolve, 100))

    const vm = wrapper.vm as any
    expect(vm.getSubmittedValue()).toEqual({ amount: 5 })
  })

  it("meta extraction should reflect the outer (source) schema, not the inner decoded one", () => {
    const { meta } = generateMetaFromSchema(transformedSchema)
    const amount = meta.amount as NumberFieldMeta | undefined

    expect(amount).toBeDefined()
    expect(amount!.type).toBe("number")
    expect(amount!.refinement).toBe("int")
    // NonNegativeInt ⇒ minimum: 0 (not exclusiveMinimum: 0 from PositiveInt)
    expect(amount!.minimum).toBe(0)
    expect(amount!.exclusiveMinimum).toBeUndefined()
  })

  it("should allow 0 typed into form.Input and submit with 666 via decode", async () => {
    const useForm = createUseFormWithCustomInput(CustomNumberInput)
    let submittedValue: any = null

    const wrapper = mount({
      components: { OmegaIntlProvider },
      template: `
        <OmegaIntlProvider>
          <component :is="form.Form">
            <template #default>
              <component :is="form.Input" name="amount" label="Amount" />
              <button type="submit" data-testid="submit" @click.prevent="form.handleSubmit()">
                submit
              </button>
            </template>
          </component>
        </OmegaIntlProvider>
      `,
      setup() {
        const form = useForm(transformedSchema, {
          defaultValues: { amount: 1 },
          onSubmit: async ({ value }) => {
            submittedValue = value
          }
        })
        return { form, getSubmittedValue: () => submittedValue }
      }
    }, {
      global: { stubs: { CustomNumberInput } }
    })

    await wrapper.vm.$nextTick()

    const input = wrapper.find("[data-testid=\"custom-input-field\"]")
    await input.setValue("0")
    await wrapper.vm.$nextTick()

    expect(wrapper.find("[data-testid=\"custom-input-error\"]").exists()).toBe(false)

    await wrapper.find("[data-testid=\"submit\"]").trigger("click")
    await wrapper.vm.$nextTick()
    await new Promise((resolve) => setTimeout(resolve, 100))

    const vm = wrapper.vm as any
    expect(vm.getSubmittedValue()).toEqual({ amount: 666 })
  })
})

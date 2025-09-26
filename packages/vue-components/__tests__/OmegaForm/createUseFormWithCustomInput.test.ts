import { mount } from "@vue/test-utils"
import { S } from "effect-app"
import { describe, expect, it } from "vitest"
import { createUseFormWithCustomInput } from "../../src/components/OmegaForm"
import OmegaIntlProvider from "../OmegaIntlProvider.vue"

// Mock custom input component that properly integrates with the form
const CustomTestInput = {
  template: `
    <div class="custom-test-input" data-testid="custom-input">
      <label :for="inputProps.id">{{ inputProps.label }}</label>
      <input
        :id="inputProps.id"
        :name="inputProps.name"
        :value="inputProps.field.state.value || ''"
        @input="inputProps.field.handleChange($event.target.value)"
        data-testid="custom-input-field"
      />
      <span v-if="inputProps.error" class="error">{{ inputProps.errorMessages.join(', ') }}</span>
    </div>
  `,
  props: ["inputProps", "vuetifyValue"],
  inheritAttrs: false
}

describe("createUseFormWithCustomInput", () => {
  const useForm = createUseFormWithCustomInput(CustomTestInput)
  const schema = S.Struct({ testField: S.String })

  const createWrapper = (options?: {
    defaultValues?: any
    onSubmit?: (data: any) => void | Promise<void>
  }) => {
    let submittedValue: any = null

    const wrapper = mount({
      components: {
        OmegaIntlProvider
      },
      template: `
        <OmegaIntlProvider>
          <component :is="form.Form" :subscribe="['values']">
            <template #default="{ subscribedValues: { values } }">
              <div data-testid="values">values: {{ JSON.stringify(values) }}</div>
              <component :is="form.Input"
                label="Test Field"
                name="testField"
              />
              <button type="submit" data-testid="submit" @click.prevent="form.handleSubmit()">
                submit
              </button>
            </template>
          </component>
        </OmegaIntlProvider>
      `,
      setup() {
        const form = useForm(schema, {
          defaultValues: options?.defaultValues || { testField: "" },
          onSubmit: async ({ value }) => {
            submittedValue = value
            options?.onSubmit?.(value)
          }
        })
        return { form, getSubmittedValue: () => submittedValue }
      }
    }, {
      global: {
        stubs: {
          CustomTestInput
        }
      }
    })

    return wrapper
  }

  it("should render custom input component with correct props", async () => {
    const wrapper = createWrapper({ defaultValues: { testField: "test value" } })
    await wrapper.vm.$nextTick()

    // Check that custom input was rendered
    const customInput = wrapper.find("[data-testid=\"custom-input\"]")
    expect(customInput.exists()).toBe(true)
    expect(customInput.classes()).toContain("custom-test-input")

    // Verify the input has the correct value
    const inputElement = wrapper.find("[data-testid=\"custom-input-field\"]")
    expect(inputElement.exists()).toBe(true)
    expect((inputElement.element as HTMLInputElement).value).toBe("test value")

    // Verify the label is rendered
    const label = customInput.find("label")
    expect(label.exists()).toBe(true)
    expect(label.text()).toContain("Test Field")
  })

  it("should handle input changes and submission", async () => {
    const wrapper = createWrapper({ defaultValues: { testField: "initial" } })
    await wrapper.vm.$nextTick()

    // Verify initial value
    const input = wrapper.find("[data-testid=\"custom-input-field\"]")
    expect((input.element as HTMLInputElement).value).toBe("initial")

    // Change the value
    await input.setValue("changed value")
    await wrapper.vm.$nextTick()

    // Verify the value changed in the form state
    const valuesDiv = wrapper.find("[data-testid=\"values\"]")
    expect(valuesDiv.text()).toContain("\"testField\":\"changed value\"")

    // Submit the form
    await wrapper.find("[data-testid=\"submit\"]").trigger("click")
    await wrapper.vm.$nextTick()
    await new Promise((resolve) => setTimeout(resolve, 100))

    // Check that the form received the changed value
    const vm = wrapper.vm as any
    expect(vm.getSubmittedValue()).toEqual({ testField: "changed value" })
  })

  it("should pass inputProps and vuetifyValue to custom component", async () => {
    // Custom component that validates props
    const PropsValidatingInput = {
      template: `
        <div data-testid="props-validator">
          <div data-testid="has-inputprops">{{ !!inputProps }}</div>
          <div data-testid="has-field">{{ !!inputProps.field }}</div>
          <div data-testid="has-label">{{ inputProps.label }}</div>
          <div data-testid="has-name">{{ inputProps.name }}</div>
          <div data-testid="has-id">{{ inputProps.id }}</div>
          <div data-testid="vuetify-value">{{ vuetifyValue }}</div>
        </div>
      `,
      props: ["inputProps", "vuetifyValue"]
    }

    const useFormWithValidator = createUseFormWithCustomInput(PropsValidatingInput)
    const validationSchema = S.Struct({ myField: S.String })

    const wrapper = mount({
      components: {
        OmegaIntlProvider
      },
      template: `
        <OmegaIntlProvider>
          <component :is="form.Form">
            <template #default>
              <component :is="form.Input"
                label="My Label"
                name="myField"
              />
            </template>
          </component>
        </OmegaIntlProvider>
      `,
      setup() {
        const form = useFormWithValidator(validationSchema, {
          defaultValues: { myField: "test-value" }
        })
        return { form }
      }
    }, {
      global: {
        stubs: {
          PropsValidatingInput
        }
      }
    })

    await wrapper.vm.$nextTick()

    const validator = wrapper.find("[data-testid=\"props-validator\"]")
    expect(validator.exists()).toBe(true)

    // Check all required props are passed
    expect(wrapper.find("[data-testid=\"has-inputprops\"]").text()).toBe("true")
    expect(wrapper.find("[data-testid=\"has-field\"]").text()).toBe("true")
    expect(wrapper.find("[data-testid=\"has-label\"]").text()).toContain("My Label")
    expect(wrapper.find("[data-testid=\"has-name\"]").text()).toBe("myField")
    expect(wrapper.find("[data-testid=\"has-id\"]").text()).toBeTruthy()
    expect(wrapper.find("[data-testid=\"vuetify-value\"]").text()).toBe("test-value")
  })
})

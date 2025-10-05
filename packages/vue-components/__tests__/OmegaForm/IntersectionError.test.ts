import { mount } from "@vue/test-utils"
import { S } from "effect-app"
import { describe, expect, it } from "vitest"
import { useOmegaForm } from "../../src/components/OmegaForm"
import OmegaIntlProvider from "../OmegaIntlProvider.vue"

// Mock components that integrate with TanStack Form
const mockComponents = {
  CustomInput: {
    template: `
      <div class="mock-omega-input" v-bind="$attrs">
        <label :for="field.name">{{ label }}</label>
        <select
          v-if="type === 'select'"
          :name="field.name"
          :id="field.name"
          :value="field.state.value"
          @change="field.handleChange($event.target.value)"
        >
          <option v-for="option in options" :key="option.value" :value="option.value">
            {{ option.title }}
          </option>
        </select>
        <input
          v-else
          :type="type || 'text'"
          :name="field.name"
          :id="field.name"
          :value="field.state.value || ''"
          @input="field.handleChange($event.target.value)"
        />
      </div>
    `,
    props: ["form", "name", "field", "label", "type", "options"],
    inheritAttrs: false
  }
  // OmegaErrors: {
  //   template: `<div class="error-alert">{{ JSON.stringify(errors) }}</div>`,
  //   props: ["errors", "generalErrors", "showErrors"]
  // }
}

describe("OmegaForm Intersection/Union", () => {
  const AlphaSchema = S.Struct({
    first: S.Literal("alpha"),
    alpha: S.NonEmptyString
  })

  const BetaSchema = S.Struct({
    first: S.Literal("beta"),
    beta: S.NonEmptyString
  })

  const MySchema = S.Struct({
    myUnion: S.Union(AlphaSchema, BetaSchema)
  })

  const wrapper = mount({
    components: {
      OmegaIntlProvider,
      CustomInput: mockComponents.CustomInput
    },
    template: `
      <OmegaIntlProvider>
        <component :is="form.Form" :subscribe="['values']">
          <template #default="{ subscribedValues: { values } }">
            <div data-testid="values">values: {{ values }}</div>
            <component :is="form.Input"
              label="first"
              name="myUnion.first"
              type="select"
              :options="[
                { title: 'Alpha', value: 'alpha' },
                { title: 'Beta', value: 'beta' }
              ]"
            >
              <template #default="inputProps">
                <CustomInput v-bind="inputProps" />
              </template>
            </component>
            <component :is="form.Input"
              v-if="values.myUnion?.first === 'alpha'"
              label="alpha"
              name="myUnion.alpha"
            >
              <template #default="inputProps">
                <CustomInput v-bind="inputProps" data-testid="alpha-input" />
              </template>
            </component>
            <component :is="form.Input"
              v-if="values.myUnion?.first === 'beta'"
              label="beta"
              name="myUnion.beta"
            >
              <template #default="inputProps">
                <CustomInput v-bind="inputProps" data-testid="beta-input" />
              </template>
            </component>
            <button type="submit" data-testid="submit">
              submit
            </button>
            <component :is="form.Errors" />
          </template>
        </component>
      </OmegaIntlProvider>
    `,
    setup() {
      let submittedValue: any = null
      const form = useOmegaForm(MySchema, {
        onSubmit: async ({ value }) => {
          submittedValue = value
        }
      })
      return { form, getSubmittedValue: () => submittedValue }
    }
  }, {
    global: {
      stubs: {
        CustomInput: mockComponents.CustomInput
        // OmegaErrorsInternal: mockComponents.OmegaErrors
      }
    }
  })

  it("handles discriminated union with conditional fields", async () => {
    // Initially, neither alpha nor beta input should be visible
    expect(wrapper.find("[data-testid='alpha-input']").exists()).toBe(false)
    expect(wrapper.find("[data-testid='beta-input']").exists()).toBe(false)

    // Select "alpha" from the dropdown
    const selectInput = wrapper.find("select[name='myUnion.first']")
    await selectInput.setValue("alpha")
    await wrapper.vm.$nextTick()

    // Alpha input should now be visible, beta should not
    expect(wrapper.find("[data-testid='alpha-input']").exists()).toBe(true)
    expect(wrapper.find("[data-testid='beta-input']").exists()).toBe(false)

    // Switch to "beta"
    await selectInput.setValue("beta")
    await wrapper.vm.$nextTick()

    // Beta input should now be visible, alpha should not
    expect(wrapper.find("[data-testid='alpha-input']").exists()).toBe(false)
    expect(wrapper.find("[data-testid='beta-input']").exists()).toBe(true)
  })

  it("clears validation errors when switching union types", async () => {
    const selectInput = wrapper.find("select[name='myUnion.first']")

    // Select "alpha" and submit without filling required field to trigger error
    await selectInput.setValue("alpha")
    await wrapper.vm.$nextTick()

    const submitButton = wrapper.find("[data-testid='submit']")
    await submitButton.trigger("submit")
    await wrapper.vm.$nextTick()

    // Verify error exists for alpha field
    const errorDiv = wrapper.find(".error-alert")
    expect(errorDiv.exists()).toBe(true)
    expect(errorDiv.text()).toContain("alpha")

    // Switch to "beta" - error should be cleared
    await selectInput.setValue("beta")
    await wrapper.vm.$nextTick()

    const errorDivAfter = wrapper.find(".error-alert")
    expect(errorDivAfter.exists()).toBe(false)
  })

  it("clears form values when switching union types and handles submission", async () => {
    const selectInput = wrapper.find("select[name='myUnion.first']")

    // Select "alpha" and fill the input
    await selectInput.setValue("alpha")
    await wrapper.vm.$nextTick()

    const alphaInput = wrapper.find("input[name='myUnion.alpha']")
    await alphaInput.setValue("test")
    await wrapper.vm.$nextTick()

    // Check that "test" is in the values
    const valuesText = wrapper.find("[data-testid='values']").text()
    expect(valuesText).toContain("test")

    // Switch to "beta"
    await selectInput.setValue("beta")
    await wrapper.vm.$nextTick()

    // // Check that alpha "test" value is not there anymore
    // const valuesAfterSwitch = wrapper.find("[data-testid='values']").text()
    // expect(valuesAfterSwitch).not.toContain("test")

    // Fill beta with "here we go"
    const betaInput = wrapper.find("input[name='myUnion.beta']")
    await betaInput.setValue("here we go")
    await wrapper.vm.$nextTick()

    // Click submit and check submission works
    const form = wrapper.find("form")
    await form.trigger("submit")
    await wrapper.vm.$nextTick()
    // Wait a bit for async operations
    await new Promise((resolve) => setTimeout(resolve, 100))

    // Verify the form data was submitted with the correct beta values
    const vm = wrapper.vm as any
    expect(vm.getSubmittedValue()).toEqual({
      myUnion: {
        first: "beta",
        beta: "here we go"
      }
    })
  })
})

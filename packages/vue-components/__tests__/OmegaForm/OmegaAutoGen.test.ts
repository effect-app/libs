import { describe, it, expect } from "vitest"
import { mount } from "@vue/test-utils"
import {
  OmegaAutoGen,
  OmegaForm,
  useOmegaForm,
} from "../../src/components/OmegaForm"
import * as S from "effect-app/Schema"
import OmegaIntlProvider from "../OmegaIntlProvider.vue"

// We need to mock the components used by OmegaAutoGen.vue since they depend on Vuetify
const mockComponents = {
  OmegaInput: {
    template: `
      <div class="mock-omega-input">
        <label :for="name">{{ label }}</label>
        <input :name="name" :id="name" />
      </div>
    `,
    props: ["form", "name", "label"],
  },
}

describe("OmegaAutoGen", () => {
  it("generates components from schema with the correct props", () => {
    const wrapper = mount(
      {
        components: {
          OmegaForm,
          OmegaAutoGen,
          OmegaIntlProvider,
        },
        template: `
        <OmegaIntlProvider>
          <OmegaForm :form="form">
            <OmegaAutoGen :form="form" />
          </OmegaForm>
        </OmegaIntlProvider>
      `,
        setup() {
          const form = useOmegaForm(
            S.Struct({
              string: S.String,
              number: S.Number,
            }),
          )
          return { form }
        },
      },
      {
        global: {
          stubs: {
            OmegaInput: mockComponents.OmegaInput,
          },
        },
      },
    )

    // Check if OmegaAutoGen correctly passes props to OmegaInput components
    const inputs = wrapper.findAll(".mock-omega-input")
    expect(inputs.length).toBe(2) // Should generate 2 inputs

    // Check the first input (string)
    const firstInput = inputs[0]
    expect(firstInput.find("label").attributes("for")).toBe("string")
    expect(firstInput.find("input").attributes("name")).toBe("string")

    // Check the second input (number)
    const secondInput = inputs[1]
    expect(secondInput.find("label").attributes("for")).toBe("number")
    expect(secondInput.find("input").attributes("name")).toBe("number")
  })

  // LabelMap
  it("applies the labelMap option", () => {
    const wrapper = mount(
      {
        components: {
          OmegaForm,
          OmegaAutoGen,
          OmegaIntlProvider,
        },
        template: `
        <OmegaIntlProvider>
          <OmegaForm :form="form">
            <OmegaAutoGen 
              :form="form" 
              :label-map="key => key === 'string' ? 'Custom String Label' : undefined" 
            />
          </OmegaForm>
        </OmegaIntlProvider>
      `,
        setup() {
          const form = useOmegaForm(
            S.Struct({
              string: S.String,
              number: S.Number,
            }),
          )
          return { form }
        },
      },
      {
        global: {
          stubs: {
            OmegaInput: mockComponents.OmegaInput,
          },
        },
      },
    )

    const labels = wrapper.findAll("label")
    expect(labels[0].text()).toBe("Custom String Label")
    expect(labels[1].text()).toBe("number") // Default label is the key
  })

  // Custom slot
  it("allows custom slot content", () => {
    const wrapper = mount({
      components: {
        OmegaForm,
        OmegaAutoGen,
        OmegaIntlProvider,
      },
      template: `
        <OmegaIntlProvider>
          <OmegaForm :form="form">
            <OmegaAutoGen :form="form">
              <template #default="{ child }">
                <div :data-testid="child.name + '-custom'" class="custom-slot">
                  <label>{{ 'Custom ' + child.label }}</label>
                  <input :name="child.name" :id="child.name" />
                </div>
              </template>
            </OmegaAutoGen>
          </OmegaForm>
        </OmegaIntlProvider>
      `,
      setup() {
        const form = useOmegaForm(
          S.Struct({
            string: S.String,
            number: S.Number,
          }),
        )
        return { form }
      },
    })

    const customElements = wrapper.findAll(".custom-slot")
    expect(customElements.length).toBe(2)

    expect(wrapper.find('[data-testid="string-custom"]').exists()).toBe(true)
    expect(wrapper.find('[data-testid="number-custom"]').exists()).toBe(true)

    const labels = wrapper.findAll("label")
    expect(labels[0].text()).toBe("Custom string")
    expect(labels[1].text()).toBe("Custom number")
  })
})

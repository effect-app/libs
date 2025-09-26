import { mount } from "@vue/test-utils"
import { Order } from "effect"
import * as S from "effect-app/Schema"
import { describe, expect, it } from "vitest"
import { useOmegaForm } from "../../src/components/OmegaForm"
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
    props: ["form", "name", "label"]
  }
}

describe("OmegaAutoGen", () => {
  it("generates components from schema with the correct props", () => {
    const wrapper = mount(
      {
        components: {
          OmegaIntlProvider
        },
        template: `
        <OmegaIntlProvider>
          <component :is="form.Form">
            <component :is="form.AutoGen" />
          </component>
        </OmegaIntlProvider>
      `,
        setup() {
          const form = useOmegaForm(
            S.Struct({
              string: S.String,
              number: S.Number
            })
          )
          return { form }
        }
      },
      {
        global: {
          stubs: {
            OmegaInput: mockComponents.OmegaInput
          }
        }
      }
    )

    const inputs = wrapper.findAll(".mock-omega-input")
    expect(inputs.length).toBe(2) // Should generate 2 inputs

    const firstInput = inputs[0]
    expect(firstInput.find("label").attributes("for")).toBe("string")
    expect(firstInput.find("input").attributes("name")).toBe("string")

    const secondInput = inputs[1]
    expect(secondInput.find("label").attributes("for")).toBe("number")
    expect(secondInput.find("input").attributes("name")).toBe("number")
  })

  // Pick option test
  it("uses the pick option to include only specific fields", () => {
    const wrapper = mount(
      {
        components: {
          OmegaIntlProvider
        },
        template: `
        <OmegaIntlProvider>
          <component :is="form.Form">
            <component 
              :is="form.AutoGen"
              :pick="['string']"
            />
          </component>
        </OmegaIntlProvider>
      `,
        setup() {
          const form = useOmegaForm(
            S.Struct({
              string: S.String,
              number: S.Number,
              boolean: S.Boolean
            })
          )
          return { form }
        }
      },
      {
        global: {
          stubs: {
            OmegaInput: mockComponents.OmegaInput
          }
        }
      }
    )

    // Should only have inputs for fields in the pick array
    const inputs = wrapper.findAll(".mock-omega-input")
    expect(inputs.length).toBe(1)
    expect(inputs[0].find("input").attributes("name")).toBe("string")
  })

  // Omit option test
  it("uses the omit option to exclude specific fields", () => {
    const wrapper = mount(
      {
        components: {
          OmegaIntlProvider
        },
        template: `
        <OmegaIntlProvider>
          <component :is="form.Form">
            <component :is="form.AutoGen"
              :omit="['number', 'boolean']"
            />
          </component>
        </OmegaIntlProvider>
      `,
        setup() {
          const form = useOmegaForm(
            S.Struct({
              string: S.String,
              number: S.Number,
              boolean: S.Boolean
            })
          )
          return { form }
        }
      },
      {
        global: {
          stubs: {
            OmegaInput: mockComponents.OmegaInput
          }
        }
      }
    )

    // Should only have inputs for fields not in the omit array
    const inputs = wrapper.findAll(".mock-omega-input")
    expect(inputs.length).toBe(1)
    expect(inputs[0].find("input").attributes("name")).toBe("string")
  })

  // Order option test
  it("uses the order option to control field order", () => {
    const wrapper = mount(
      {
        components: {
          OmegaIntlProvider
        },
        template: `
        <OmegaIntlProvider>
          <component :is="form.Form">
            <component :is="form.AutoGen"
              :order="['boolean', 'number', 'string']"
            />
          </component>
        </OmegaIntlProvider>
      `,
        setup() {
          const form = useOmegaForm(
            S.Struct({
              string: S.String,
              number: S.Number,
              boolean: S.Boolean
            })
          )
          return { form }
        }
      },
      {
        global: {
          stubs: {
            OmegaInput: mockComponents.OmegaInput
          }
        }
      }
    )

    // Check that the fields are ordered according to the specified order
    const inputs = wrapper.findAll(".mock-omega-input input")
    const inputNames = inputs.map((input) => input.attributes("name"))

    // The order should match the specified order
    expect(inputNames[0]).toBe("boolean")
    expect(inputNames[1]).toBe("number")
    expect(inputNames[2]).toBe("string")
  })

  // Sort option test
  it("uses the sort option to sort fields", () => {
    const wrapper = mount(
      {
        components: {
          OmegaIntlProvider
        },
        template: `
        <OmegaIntlProvider>
          <component :is="form.Form">
            <component :is="form.AutoGen"
              :sort="sortByName"
            />
          </component>
        </OmegaIntlProvider>
      `,
        setup() {
          const form = useOmegaForm(
            S.Struct({
              charlie: S.String,
              alpha: S.String,
              bravo: S.String
            })
          )

          // Create a sorter that sorts by name alphabetically
          const sortByName = Order.mapInput(
            Order.string,
            (item: { name: string }) => item.name
          )

          return { form, sortByName }
        }
      },
      {
        global: {
          stubs: {
            OmegaInput: mockComponents.OmegaInput
          }
        }
      }
    )

    // Check that the fields are sorted alphabetically by name
    const inputs = wrapper.findAll(".mock-omega-input input")
    const inputNames = inputs.map((input) => input.attributes("name"))

    // The fields should be sorted alphabetically
    expect(inputNames[0]).toBe("alpha")
    expect(inputNames[1]).toBe("bravo")
    expect(inputNames[2]).toBe("charlie")
  })

  // LabelMap
  it("applies the labelMap option", () => {
    const wrapper = mount(
      {
        components: {
          OmegaIntlProvider
        },
        template: `
        <OmegaIntlProvider>
          <component :is="form.Form">
            <component :is="form.AutoGen"
              :label-map="key => key === 'string' ? 'Custom String Label' : undefined" 
            />
          </component>
        </OmegaIntlProvider>
      `,
        setup() {
          const form = useOmegaForm(
            S.Struct({
              string: S.String,
              number: S.Number
            })
          )
          return { form }
        }
      },
      {
        global: {
          stubs: {
            OmegaInput: mockComponents.OmegaInput
          }
        }
      }
    )

    const labels = wrapper.findAll("label")
    expect(labels[0].text()).toBe("Custom String Label")
    expect(labels[1].text()).toBe("number") // Default label is the key
  })

  // Custom slot
  it("allows custom slot content", () => {
    const wrapper = mount({
      components: {
        OmegaIntlProvider
      },
      template: `
        <OmegaIntlProvider>
          <component :is="form.Form">
            <component :is="form.AutoGen">
              <template #default="{ child }">
                <div :data-testid="child.name + '-custom'" class="custom-slot">
                  <label>{{ 'Custom ' + child.label }}</label>
                  <input :name="child.name" :id="child.name" />
                </div>
              </template>
            </component>
          </component>
        </OmegaIntlProvider>
      `,
      setup() {
        const form = useOmegaForm(
          S.Struct({
            string: S.String,
            number: S.Number
          })
        )
        return { form }
      }
    })

    const customElements = wrapper.findAll(".custom-slot")
    expect(customElements.length).toBe(2)

    expect(wrapper.find("[data-testid=\"string-custom\"]").exists()).toBe(true)
    expect(wrapper.find("[data-testid=\"number-custom\"]").exists()).toBe(true)

    const labels = wrapper.findAll("label")
    expect(labels[0].text()).toBe("Custom string")
    expect(labels[1].text()).toBe("Custom number")
  })
})

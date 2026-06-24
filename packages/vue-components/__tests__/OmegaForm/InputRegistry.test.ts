import { mount } from "@vue/test-utils"
import * as S from "effect-app/Schema"
import { describe, expect, it } from "vitest"
import { defineComponent } from "vue"
import { createUseFormWithCustomInput, useOmegaForm } from "../../src/components/OmegaForm"
import OmegaIntlProvider from "../OmegaIntlProvider.vue"

const VTextField = defineComponent({
  props: { modelValue: { type: String, default: "" } },
  emits: ["update:modelValue"],
  template: `<input v-bind="$attrs" :value="modelValue" @input="$emit('update:modelValue', $event.target.value)" />`
})

const RatingInput = defineComponent({
  props: {
    inputProps: { type: Object, required: true },
    field: { type: Object, required: true },
    state: { type: Object, required: true }
  },
  template: `<div data-testid="rating">{{ inputProps.label }}</div>`
})

const UniversalInput = defineComponent({
  props: {
    inputProps: { type: Object, required: true },
    field: { type: Object, required: true },
    state: { type: Object, required: true }
  },
  template: `<div data-testid="universal">{{ inputProps.label }}</div>`
})

const mountWith = (omegaConfig: any, type: string, name = "x") =>
  mount({
    components: { OmegaIntlProvider },
    template: `
      <OmegaIntlProvider>
        <component :is="form.Form">
          <component :is="form.Input" :name="'${name}'" :type="'${type}'" />
        </component>
      </OmegaIntlProvider>`,
    setup() {
      const form = useOmegaForm(S.Struct({ x: S.String }), { defaultValues: { x: "" } }, omegaConfig)
      return { form }
    }
  }, { global: { components: { VTextField } } })

describe("OmegaForm input registry", () => {
  it("renders the registered component for a custom type", async () => {
    const wrapper = mountWith({ inputs: { rating: RatingInput } }, "rating")
    await wrapper.vm.$nextTick()
    expect(wrapper.find("[data-testid=\"rating\"]").exists()).toBe(true)
  })

  it("overrides a built-in type when registered", async () => {
    const wrapper = mountWith({ inputs: { string: RatingInput } }, "string")
    await wrapper.vm.$nextTick()
    expect(wrapper.find("[data-testid=\"rating\"]").exists()).toBe(true)
  })

  it("falls back to the built-in renderer when no entry matches", async () => {
    const wrapper = mountWith({ inputs: { rating: RatingInput } }, "string")
    await wrapper.vm.$nextTick()
    expect(wrapper.find("[data-testid=\"rating\"]").exists()).toBe(false)
    expect(wrapper.find("input").exists()).toBe(true)
  })
})

describe("createUseFormWithCustomInput + inputs", () => {
  it("uses a per-type registered component, else the universal custom input", async () => {
    const useForm = createUseFormWithCustomInput(UniversalInput)
    const wrapper = mount({
      components: { OmegaIntlProvider },
      template: `
        <OmegaIntlProvider>
          <component :is="form.Form">
            <component :is="form.Input" name="score" type="rating" />
            <component :is="form.Input" name="nickname" />
          </component>
        </OmegaIntlProvider>`,
      setup() {
        const form = useForm(
          S.Struct({ score: S.Number, nickname: S.String }),
          { defaultValues: { score: 0, nickname: "" } },
          { inputs: { rating: RatingInput } }
        )
        return { form }
      }
    }, { global: { components: { VTextField } } })
    await wrapper.vm.$nextTick()
    // `score` (type="rating") resolves the registered component...
    expect(wrapper.find("[data-testid=\"rating\"]").exists()).toBe(true)
    // ...while `nickname` falls back to the universal custom input.
    expect(wrapper.find("[data-testid=\"universal\"]").exists()).toBe(true)
  })
})

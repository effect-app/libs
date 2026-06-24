import { mount } from "@vue/test-utils"
import * as S from "effect-app/Schema"
import { describe, expect, it } from "vitest"
import { defineComponent } from "vue"
import { useOmegaForm } from "../../src/components/OmegaForm"
import OmegaIntlProvider from "../OmegaIntlProvider.vue"

const VTextField = defineComponent({
  props: {
    modelValue: {
      type: String,
      default: ""
    }
  },
  emits: ["update:modelValue"],
  template: `
    <input
      v-bind="$attrs"
      :value="modelValue"
      @input="$emit('update:modelValue', $event.target.value)"
    />
  `
})

const VSelect = defineComponent({
  props: {
    items: {
      type: Array,
      default: () => []
    },
    modelValue: {
      type: String,
      default: ""
    }
  },
  emits: ["update:modelValue"],
  template: `
    <select
      v-bind="$attrs"
      :value="modelValue"
      @change="$emit('update:modelValue', $event.target.value)"
    >
      <option
        v-for="item in items"
        :key="item.value"
        :value="item.value"
      >
        {{ item.title }}
      </option>
    </select>
  `
})

describe("OmegaForm input attributes", () => {
  it("does not forward the internal form object as a native form attribute", async () => {
    const wrapper = mount({
      components: { OmegaIntlProvider },
      template: `
        <OmegaIntlProvider>
          <component :is="form.Form">
            <component
              :is="form.Input"
              label="Password"
              name="password"
              type="password"
              :validators="{ onChange: () => undefined }"
            />
            <button type="submit">submit</button>
          </component>
        </OmegaIntlProvider>
      `,
      setup() {
        const form = useOmegaForm(
          S.Struct({
            password: S.NonEmptyString255
          }),
          {
            defaultValues: {
              password: ""
            }
          }
        )

        return { form }
      }
    }, {
      global: {
        components: { VTextField, VSelect }
      }
    })

    await wrapper.vm.$nextTick()

    const input = wrapper.find("input")
    const nativeForm = wrapper.find("form").element

    expect(input.attributes("form")).toBeUndefined()
    expect(input.attributes("validators")).toBeUndefined()
    expect(Object.values(input.attributes())).not.toContain("[object Object]")
    expect((input.element as HTMLInputElement).form).toBe(nativeForm)
  })

  it("keeps input configuration props off the renderer attrs", async () => {
    const wrapper = mount({
      components: { OmegaIntlProvider },
      template: `
        <OmegaIntlProvider>
          <component :is="form.Form">
            <component
              :is="form.Input"
              label="Choice"
              name="choice"
              type="select"
              :options="[{ title: 'One', value: 'one' }]"
            />
          </component>
        </OmegaIntlProvider>
      `,
      setup() {
        const form = useOmegaForm(
          S.Struct({
            choice: S.Literal("one")
          }),
          {
            defaultValues: {
              choice: "one"
            }
          }
        )

        return { form }
      }
    }, {
      global: {
        components: { VTextField, VSelect }
      }
    })

    await wrapper.vm.$nextTick()

    const select = wrapper.find("select")

    expect(select.attributes("options")).toBeUndefined()
    expect(select.attributes("items")).toBeUndefined()
    expect(Object.values(select.attributes())).not.toContain("[object Object]")
  })
})

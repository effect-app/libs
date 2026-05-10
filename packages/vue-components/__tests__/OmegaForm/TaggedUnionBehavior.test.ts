import { mount } from "@vue/test-utils"
import * as Effect from "effect-app/Effect"
import * as S from "effect-app/Schema"
import { describe, expect, it } from "vitest"
import { defineComponent, nextTick } from "vue"
import { createUseFormWithCustomInput } from "../../src/components/OmegaForm"
import OmegaIntlProvider from "../OmegaIntlProvider.vue"

const HeadlessInput = defineComponent({
  inheritAttrs: false,
  props: ["inputProps", "field", "state", "options"],
  template: `
    <div :data-testid="'wrap-' + field.name">
      <select
        v-if="inputProps.type === 'select'"
        :data-testid="'select-' + field.name"
        :value="state.value == null ? '' : state.value"
        @change="field.handleChange($event.target.value === '' ? null : $event.target.value)"
      >
        <option value="">--</option>
        <option v-for="opt in options ?? []" :key="opt.value" :value="opt.value">{{ opt.title }}</option>
      </select>
      <input
        v-else
        :data-testid="'input-' + field.name"
        :type="inputProps.type === 'number' ? 'number' : 'text'"
        :value="state.value == null ? '' : state.value"
        @input="onInput($event)"
      />
      <span v-if="inputProps.error" :data-testid="'error-' + field.name">{{ inputProps.errorMessages?.join(', ') }}</span>
    </div>
  `,
  methods: {
    onInput(this: any, e: Event) {
      const target = e.target as HTMLInputElement
      const value = target.value
      if (this.inputProps.type === "number") {
        this.field.handleChange(value === "" ? null : Number(value))
      } else {
        this.field.handleChange(value)
      }
    }
  }
})

const useForm = createUseFormWithCustomInput(HeadlessInput)

const flushAfterTagChange = async () => {
  // OmegaTaggedUnionInternal watches _tag and on change calls form.reset(),
  // then setTimeout(validate, 0). Give it room.
  await nextTick()
  await nextTick()
  await new Promise((r) => setTimeout(r, 10))
  await nextTick()
}

describe("RootLevelTaggedUnion behavior", () => {
  const schema = S.Union([
    S.TaggedStruct("A", {
      a: S.NonEmptyString255.pipe(
        S.withConstructorDefault(Effect.succeed(S.NonEmptyString255("aaaa")))
      ),
      common: S.NonEmptyString255
    }),
    S.TaggedStruct("B", {
      b: S.Finite,
      nullableB: S.NullOr(S.Finite),
      common: S.NullOr(S.String)
    })
  ])

  const mountForm = (onSubmit?: (value: any) => void) => {
    return mount({
      components: { OmegaIntlProvider },
      template: `
        <OmegaIntlProvider>
          <component :is="form.Form" :subscribe="['values']">
            <template #default>
              <component :is="form.TaggedUnion"
                label="Tag"
                :options="tagOptions"
              >
                <component :is="form.Input" name="common" label="Common" />
                <template #A>
                  <component :is="form.Input" name="a" label="A" />
                </template>
                <template #B>
                  <component :is="form.Input" name="b" label="B" type="number" />
                  <component :is="form.Input" name="nullableB" label="NullableB" type="number" />
                </template>
              </component>
              <button type="submit" data-testid="submit" @click.prevent="form.handleSubmit()">Submit</button>
            </template>
          </component>
        </OmegaIntlProvider>
      `,
      setup() {
        const form = useForm(schema as any, {
          defaultValues: { _tag: "A" } as any,
          onSubmit: async ({ value }: any) => onSubmit?.(value)
        })
        const tagOptions = [
          { value: "A", title: "Option A" },
          { value: "B", title: "Option B" }
        ]
        return { form, tagOptions }
      }
    })
  }

  it("renders branch A's slot by default and not B's", async () => {
    const wrapper = mountForm()
    await nextTick()

    expect(wrapper.find("[data-testid=\"input-a\"]").exists()).toBe(true)
    expect(wrapper.find("[data-testid=\"input-common\"]").exists()).toBe(true)
    expect(wrapper.find("[data-testid=\"input-b\"]").exists()).toBe(false)
    expect(wrapper.find("[data-testid=\"input-nullableB\"]").exists()).toBe(false)
  })

  it("toggling _tag from A to B swaps the rendered branch slot", async () => {
    const wrapper = mountForm()
    await nextTick()

    const select = wrapper.find("[data-testid=\"select-_tag\"]")
    expect(select.exists()).toBe(true) // Drive the change through the form API to mirror what the UI handler
     // produces. setValue + change events on the bare <select> race with
    // tanstack-form's commit cycle in some environments; setFieldValue is the
    // canonical path the watcher in OmegaTaggedUnionInternal observes.
    ;(wrapper.vm as any).form.setFieldValue("_tag", "B")
    await flushAfterTagChange()

    expect(wrapper.find("[data-testid=\"input-b\"]").exists()).toBe(true)
    expect(wrapper.find("[data-testid=\"input-nullableB\"]").exists()).toBe(true)
    expect(wrapper.find("[data-testid=\"input-a\"]").exists()).toBe(false)
  })

  it("submits branch A's data with correct tag when no toggle happens", async () => {
    let received: any = null
    const wrapper = mountForm((v) => {
      received = v
    })
    await nextTick()

    await wrapper.find("[data-testid=\"input-common\"]").setValue("hello")
    await nextTick()

    await wrapper.find("[data-testid=\"submit\"]").trigger("click")
    await new Promise((r) => setTimeout(r, 50))
    await nextTick()

    expect(received).toMatchObject({ _tag: "A", a: "aaaa", common: "hello" })
  })

  it("submits branch B's data with correct tag after switching from A", async () => {
    let received: any = null
    const wrapper = mountForm((v) => {
      received = v
    })
    await nextTick()
    ;(wrapper.vm as any).form.setFieldValue("_tag", "B")
    await flushAfterTagChange()

    await wrapper.find("[data-testid=\"input-b\"]").setValue(42)
    await nextTick()

    await wrapper.find("[data-testid=\"submit\"]").trigger("click")
    await new Promise((r) => setTimeout(r, 50))
    await nextTick()

    expect(received).toMatchObject({ _tag: "B", b: 42 })
  })
})

describe("FormTaggedUnion behavior (nested)", () => {
  const schema = S.Struct({
    aString: S.NonEmptyString255,
    union: S.NullOr(
      S.Union([
        S.TaggedStruct("A", { a: S.NonEmptyString255, common: S.NonEmptyString255 }),
        S.TaggedStruct("B", { b: S.NonEmptyString255, common: S.NonEmptyString255 })
      ])
    )
  })

  const mountForm = (onSubmit?: (value: any) => void) => {
    return mount({
      components: { OmegaIntlProvider },
      template: `
        <OmegaIntlProvider>
          <component :is="form.Form" :subscribe="['values']">
            <template #default>
              <component :is="form.Input" name="aString" label="aString" />
              <component :is="form.TaggedUnion"
                name="union"
                label="Union"
                :options="tagOptions"
              >
                <component :is="form.Input" name="union.common" label="Common" />
                <template #union.A>
                  <component :is="form.Input" name="union.a" label="UnionA" />
                </template>
                <template #union.B>
                  <component :is="form.Input" name="union.b" label="UnionB" />
                </template>
              </component>
              <button type="submit" data-testid="submit" @click.prevent="form.handleSubmit()">Submit</button>
            </template>
          </component>
        </OmegaIntlProvider>
      `,
      setup() {
        const form = useForm(schema as any, {
          defaultValues: { aString: "preset" } as any,
          onSubmit: async ({ value }: any) => onSubmit?.(value)
        })
        const tagOptions = [
          { value: "A", title: "A" },
          { value: "B", title: "B" }
        ]
        return { form, tagOptions }
      }
    })
  }

  it("renders no branch slot when union is null (initial)", async () => {
    const wrapper = mountForm()
    await nextTick()

    expect(wrapper.find("[data-testid=\"input-union.a\"]").exists()).toBe(false)
    expect(wrapper.find("[data-testid=\"input-union.b\"]").exists()).toBe(false)
  })

  it("selecting union._tag = A renders A's slot, switching to B swaps it", async () => {
    const wrapper = mountForm()
    await nextTick()

    const select = wrapper.find("[data-testid=\"select-union._tag\"]")
    expect(select.exists()).toBe(true)
    ;(wrapper.vm as any).form.setFieldValue("union._tag", "A")
    await flushAfterTagChange()

    expect(wrapper.find("[data-testid=\"input-union.a\"]").exists()).toBe(true)
    expect(wrapper.find("[data-testid=\"input-union.b\"]").exists()).toBe(false)
    ;(wrapper.vm as any).form.setFieldValue("union._tag", "B")
    await flushAfterTagChange()

    expect(wrapper.find("[data-testid=\"input-union.a\"]").exists()).toBe(false)
    expect(wrapper.find("[data-testid=\"input-union.b\"]").exists()).toBe(true)
  })
})

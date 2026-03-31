import { mount } from "@vue/test-utils"
import { S } from "effect-app"
import { SchemaGetter } from "effect"
import { describe, expect, it } from "vitest"
import { useOmegaForm } from "../../src/components/OmegaForm"
import OmegaIntlProvider from "../OmegaIntlProvider.vue"

describe("OmegaForm TransformedStruct", () => {
  const baseSchema = S.Struct({
    a: S.NonEmptyString,
    b: S.Finite
  })

  const transformedSchema = baseSchema.pipe(S.decodeTo(baseSchema, {
    decode: SchemaGetter.passthrough({ strict: false }),
    encode: SchemaGetter.passthrough({ strict: false })
  }))

  it("should work with a basic transformed struct schema", async () => {
    const wrapper = mount({
      components: { OmegaIntlProvider },
      template: `
        <OmegaIntlProvider>
          <component :is="form.Form" :subscribe="['values']">
            <template #default="{ subscribedValues: { values } }">
              <div data-testid="values">{{ JSON.stringify(values) }}</div>
            </template>
          </component>
        </OmegaIntlProvider>
      `,
      setup() {
        const form = useOmegaForm(transformedSchema)
        return { form }
      }
    })

    await wrapper.vm.$nextTick()
    const valuesText = wrapper.find("[data-testid=\"values\"]").text()
    const values = JSON.parse(valuesText)

    expect(values).toEqual({
      a: "",
      b: undefined
    })
  })

  it("should work with a double-transformed struct schema", async () => {
    const doubleTransformed = transformedSchema.pipe(S.decodeTo(baseSchema, {
      decode: SchemaGetter.passthrough({ strict: false }),
      encode: SchemaGetter.passthrough({ strict: false })
    }))

    const wrapper = mount({
      components: { OmegaIntlProvider },
      template: `
        <OmegaIntlProvider>
          <component :is="form.Form" :subscribe="['values']">
            <template #default="{ subscribedValues: { values } }">
              <div data-testid="values">{{ JSON.stringify(values) }}</div>
            </template>
          </component>
        </OmegaIntlProvider>
      `,
      setup() {
        const form = useOmegaForm(doubleTransformed)
        return { form }
      }
    })

    await wrapper.vm.$nextTick()
    const valuesText = wrapper.find("[data-testid=\"values\"]").text()
    const values = JSON.parse(valuesText)

    expect(values).toEqual({
      a: "",
      b: undefined
    })
  })

  it("should work with a double-transformed struct inside a union", async () => {
    const memberSchema = S.Struct({
      _tag: S.Literal("option1").pipe(S.withDefaultConstructor(() => "option1")),
      data: S.NonEmptyString
    })
    const doubleTransformedMember = memberSchema
      .pipe(S.decodeTo(memberSchema, {
        decode: SchemaGetter.passthrough({ strict: false }),
        encode: SchemaGetter.passthrough({ strict: false })
      }))
      .pipe(S.decodeTo(memberSchema, {
        decode: SchemaGetter.passthrough({ strict: false }),
        encode: SchemaGetter.passthrough({ strict: false })
      }))

    const unionSchema = S.Union([
      doubleTransformedMember,
      S.Struct({
        _tag: S.Literal("option2"),
        value: S.Finite
      })
    ])

    const wrapper = mount({
      components: { OmegaIntlProvider },
      template: `
        <OmegaIntlProvider>
          <component :is="form.Form" :subscribe="['values']">
            <template #default="{ subscribedValues: { values } }">
              <div data-testid="values">{{ JSON.stringify(values) }}</div>
            </template>
          </component>
        </OmegaIntlProvider>
      `,
      setup() {
        const form = useOmegaForm(unionSchema)
        return { form }
      }
    })

    await wrapper.vm.$nextTick()
    const valuesText = wrapper.find("[data-testid=\"values\"]").text()
    const values = JSON.parse(valuesText)

    expect(values).toHaveProperty("_tag", "option1")
  })

  it("should work with a transformed struct inside a union", async () => {
    const unionSchema = S.Union([
      S.Struct({
        _tag: S.Literal("option1").pipe(S.withDefaultConstructor(() => "option1")),
        data: S.NonEmptyString
      }).pipe(S.decodeTo(
        S.Struct({
          _tag: S.Literal("option1").pipe(S.withDefaultConstructor(() => "option1")),
          data: S.NonEmptyString
        }),
        {
          decode: SchemaGetter.passthrough({ strict: false }),
          encode: SchemaGetter.passthrough({ strict: false })
        }
      )),
      S.Struct({
        _tag: S.Literal("option2"),
        value: S.Finite
      })
    ])

    const wrapper = mount({
      components: { OmegaIntlProvider },
      template: `
        <OmegaIntlProvider>
          <component :is="form.Form" :subscribe="['values']">
            <template #default="{ subscribedValues: { values } }">
              <div data-testid="values">{{ JSON.stringify(values) }}</div>
            </template>
          </component>
        </OmegaIntlProvider>
      `,
      setup() {
        const form = useOmegaForm(unionSchema)
        return { form }
      }
    })

    await wrapper.vm.$nextTick()
    const valuesText = wrapper.find("[data-testid=\"values\"]").text()
    const values = JSON.parse(valuesText)

    expect(values).toHaveProperty("_tag", "option1")
  })
})

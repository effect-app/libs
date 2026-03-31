import { mount } from "@vue/test-utils"
import { S, SchemaGetter } from "effect-app"
import { describe, expect, it } from "vitest"
import { generateMetaFromSchema, useOmegaForm } from "../../src/components/OmegaForm"
import { defaultsValueFromSchema } from "../../src/components/OmegaForm/OmegaFormStuff"
import OmegaIntlProvider from "../OmegaIntlProvider.vue"

describe("OmegaForm TransformationSchema", () => {
  const schema = S.Struct({
    name: S.String,
    age: S.String
  })

  const transformedSchema = schema.pipe(S.decodeTo(schema, {
    decode: SchemaGetter.passthrough({ strict: false }),
    encode: SchemaGetter.passthrough({ strict: false })
  }))

  it("should generate correct meta from a transformed schema", () => {
    const base = generateMetaFromSchema(schema)
    const transformed = generateMetaFromSchema(transformedSchema)
    expect(transformed.meta).toEqual(base.meta)
  })

  it("should compute defaults from a transformed schema", () => {
    const base = defaultsValueFromSchema(schema)
    const transformed = defaultsValueFromSchema(transformedSchema)
    expect(base).toEqual({ name: "", age: "" })
    expect(transformed).toEqual(base)
  })

  it("should generate same meta shape as base for transformed schema", () => {
    const base = generateMetaFromSchema(schema)
    const transformed = generateMetaFromSchema(transformedSchema)

    // Verify both schemas produce the same meta keys
    expect(Object.keys(transformed.meta)).toEqual(Object.keys(base.meta))

    // Verify required field flags match
    for (const key of Object.keys(base.meta)) {
      expect(transformed.meta[key as keyof typeof transformed.meta]).toMatchObject({
        type: (base.meta as any)[key].type,
        required: (base.meta as any)[key].required,
        nullableOrUndefined: (base.meta as any)[key].nullableOrUndefined
      })
    }
  })

  it("should not crash Object.keys when defaultsValueFromSchema returns undefined", () => {
    // Simulate what happens inside useOmegaForm's defaultValues computation
    const defaults = defaultsValueFromSchema(transformedSchema)
    // Ensure it never returns undefined (which would crash Object.keys in the reduce)
    expect(defaults).toBeDefined()
    expect(typeof defaults).toBe("object")
  })

  it("should useOmegaForm with a decodeTo transformation", async () => {
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
      name: "",
      age: ""
    })
  })
})

import { mount } from "@vue/test-utils"
import { S } from "effect-app"
import { describe, expect, it } from "vitest"
import { useOmegaForm } from "../../src/components/OmegaForm"
import OmegaIntlProvider from "../OmegaIntlProvider.vue"

describe("OmegaForm Defaults", () => {
  // Setup the same schemas as in Defaults.vue story
  const struct = {
    a: S.NonEmptyString.pipe(S.withDefaultConstructor(() => S.NonEmptyString("default"))),
    b: S.NonEmptyString,
    c: S.NonEmptyArray(S.String).pipe(
      S.withDefaultConstructor(() => [S.NonEmptyString("C"), S.NonEmptyString("Non Empty Array")])
    ),
    d: S
      .NonEmptyArray(S.Struct({
        e: S.NonEmptyString
      }))
      .pipe(
        S.withDefaultConstructor(() => [{ e: S.NonEmptyString("default") }])
      ),
    f: S.Union(
      S.Struct({
        _tag: S.Literal("taggo1").pipe(S.withDefaultConstructor(() => "taggo1")),
        g: S.NonEmptyString.pipe(S.withDefaultConstructor(() => S.NonEmptyString("default"))),
        i: S.NonEmptyString.pipe(S.withDefaultConstructor(() => S.NonEmptyString("default")))
      }),
      S.Struct({
        _tag: S.Literal("taggo2").pipe(S.withDefaultConstructor(() => "taggo2")),
        h: S.NonEmptyString.pipe(S.withDefaultConstructor(() => S.NonEmptyString("default"))),
        i: S.NonEmptyString.pipe(S.withDefaultConstructor(() => S.NonEmptyString("default")))
      })
    ),
    j: S.Number.pipe(S.withDefaultConstructor(() => 0)),
    k: S.Boolean.pipe(S.withDefaultConstructor(() => true)),
    l: S.NullOr(
      S.Union(
        S.Struct({
          a: S.NonEmptyString255,
          common: S.NonEmptyString255,
          _tag: S.Literal("A")
        }),
        S.Struct({
          b: S.NonEmptyString255,
          common: S.NonEmptyString255,
          _tag: S.Literal("B")
        })
      )
    ),
    m: S.Struct({
      n: S.NullOr(S.Struct({ q: S.String })),
      o: S.UndefinedOr(S.Struct({ q: S.String }))
    }),
    p: S.NullOr(S.Struct({ z: S.String })),
    q: S.UndefinedOr(S.Struct({ z: S.String })),
    r: S
      .NullOr(S.Struct({
        p: S.NullOr(S.Struct({ z: S.String })),
        r: S.UndefinedOr(S.Struct({ z: S.String }))
      }))
      .withDefault,
    s: S.NullOr(S.Struct({ z: S.String })).withDefault,
    t: S.NumberFromString.pipe(S.withDefaultConstructor(() => 1000)),
    u: S.NullOr(S.NonEmptyString),
    v: S.UndefinedOr(S.NonEmptyString)
  }

  class ClassSchema extends S.ExtendedClass<ClassSchema, any>("ClassSchema")(struct) {}
  const schema = S.Struct(struct)

  const Union = S.Union(
    S.Struct({
      _tag: S.Literal("tag1").pipe(S.withDefaultConstructor(() => "tag1")),
      a: S.NonEmptyString.pipe(S.withDefaultConstructor(() => S.NonEmptyString("default"))),
      b: schema
    }),
    S.Struct({
      _tag: S.Literal("tag2"),
      a: S.NonEmptyString.pipe(S.withDefaultConstructor(() => S.NonEmptyString("default"))),
      b: S.NonEmptyString.pipe(S.withDefaultConstructor(() => S.NonEmptyString("default"))),
      c: schema
    })
  )

  it("should have correct default values for form zero (ClassSchema)", async () => {
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
        const form = useOmegaForm(ClassSchema)
        return { form }
      }
    })

    await wrapper.vm.$nextTick()
    const valuesText = wrapper.find("[data-testid=\"values\"]").text()
    const values = JSON.parse(valuesText)

    expect(values).toEqual({
      "a": "default",
      "b": "",
      "c": ["C", "Non Empty Array"],
      "d": [{ "e": "default" }],
      "f": { "_tag": "taggo1", "g": "default", "i": "default", "h": "default" },
      "j": 0,
      "k": true,
      "l": null,
      "m": { "n": null },
      "p": null,
      "r": null,
      "s": null,
      "t": 1000,
      "u": null
    })
  })

  it("should have correct default values for form one (schema)", async () => {
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
        const form = useOmegaForm(schema)
        return { form }
      }
    })

    await wrapper.vm.$nextTick()
    const valuesText = wrapper.find("[data-testid=\"values\"]").text()
    const values = JSON.parse(valuesText)

    expect(values).toEqual({
      "a": "default",
      "b": "",
      "c": ["C", "Non Empty Array"],
      "d": [{ "e": "default" }],
      "f": { "_tag": "taggo1", "g": "default", "i": "default", "h": "default" },
      "j": 0,
      "k": true,
      "l": null,
      "m": { "n": null },
      "p": null,
      "r": null,
      "s": null,
      "t": 1000,
      "u": null
    })
  })

  it("should have correct default values for form two (Union)", async () => {
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
        const form = useOmegaForm(Union)
        return { form }
      }
    })

    await wrapper.vm.$nextTick()
    const valuesText = wrapper.find("[data-testid=\"values\"]").text()
    const values = JSON.parse(valuesText)

    expect(values).toEqual({
      "_tag": "tag1",
      "a": "default",
      "b": "default",
      "c": {
        "a": "default",
        "b": "",
        "c": ["C", "Non Empty Array"],
        "d": [{ "e": "default" }],
        "f": { "_tag": "taggo1", "g": "default", "i": "default", "h": "default" },
        "j": 0,
        "k": true,
        "l": null,
        "m": { "n": null },
        "p": null,
        "r": null,
        "s": null,
        "t": 1000,
        "u": null
      }
    })
  })

  it("should have correct default values for form three (with defaultValues merged)", async () => {
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
        const form = useOmegaForm(schema, {
          defaultValues: {
            a: "aaaaah"
          }
        })
        return { form }
      }
    })

    await wrapper.vm.$nextTick()
    const valuesText = wrapper.find("[data-testid=\"values\"]").text()
    const values = JSON.parse(valuesText)

    expect(values).toEqual({
      "a": "aaaaah",
      "b": "",
      "c": ["C", "Non Empty Array"],
      "d": [{ "e": "default" }],
      "f": { "_tag": "taggo1", "g": "default", "i": "default", "h": "default" },
      "j": 0,
      "k": true,
      "l": null,
      "m": { "n": null },
      "p": null,
      "r": null,
      "s": null,
      "t": 1000,
      "u": null
    })
  })

  it("should have correct default values for form four (defaultFromSchema: only)", async () => {
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
        const form = useOmegaForm(schema, {
          defaultValues: {
            a: "aaaaah"
          }
        }, {
          defaultFromSchema: "only"
        })
        return { form }
      }
    })

    await wrapper.vm.$nextTick()
    const valuesText = wrapper.find("[data-testid=\"values\"]").text()
    const values = JSON.parse(valuesText)

    expect(values).toEqual({
      "a": "default",
      "b": "",
      "c": ["C", "Non Empty Array"],
      "d": [{ "e": "default" }],
      "f": { "_tag": "taggo1", "g": "default", "i": "default", "h": "default" },
      "j": 0,
      "k": true,
      "l": null,
      "m": { "n": null },
      "p": null,
      "r": null,
      "s": null,
      "t": 1000,
      "u": null
    })
  })

  it("should have correct default values for form five (defaultFromSchema: nope)", async () => {
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
        const form = useOmegaForm(schema, {
          defaultValues: {
            a: "aaaaah"
          }
        }, {
          defaultFromSchema: "nope"
        })
        return { form }
      }
    })

    await wrapper.vm.$nextTick()
    const valuesText = wrapper.find("[data-testid=\"values\"]").text()
    const values = JSON.parse(valuesText)

    expect(values).toEqual({
      "a": "aaaaah"
    })
  })

  it("should have correct default values for form six (defaultFromSchema: merge)", async () => {
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
        const form = useOmegaForm(schema, {
          defaultValues: {
            a: "aaaaah"
          }
        }, {
          defaultFromSchema: "merge"
        })
        return { form }
      }
    })

    await wrapper.vm.$nextTick()
    const valuesText = wrapper.find("[data-testid=\"values\"]").text()
    const values = JSON.parse(valuesText)

    expect(values).toEqual({
      "a": "aaaaah",
      "b": "",
      "c": ["C", "Non Empty Array"],
      "d": [{ "e": "default" }],
      "f": { "_tag": "taggo1", "g": "default", "i": "default", "h": "default" },
      "j": 0,
      "k": true,
      "l": null,
      "m": { "n": null },
      "p": null,
      "r": null,
      "s": null,
      "t": 1000,
      "u": null
    })
  })

  it("should have correct default values for form seven (Union with different structure)", async () => {
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
        const form = useOmegaForm(S.Union(
          S.Struct({
            _tag: S.Literal("tag1").pipe(S.withDefaultConstructor(() => "tag1")),
            a: S.NonEmptyString,
            s: S.NullOr(S.Number).withDefault
          }),
          S.Struct({
            _tag: S.Literal("tag2"),
            b: S.NonEmptyString,
            t: S.Number
          })
        ))
        return { form }
      }
    })

    await wrapper.vm.$nextTick()
    const valuesText = wrapper.find("[data-testid=\"values\"]").text()
    const values = JSON.parse(valuesText)

    expect(values).toEqual({
      "_tag": "tag1",
      "a": "",
      "s": null,
      "b": ""
    })
  })

  it("should have correct default values for form eight (ClassSchema with filter)", async () => {
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
        const form = useOmegaForm(ClassSchema
          .pipe(
            S.filter((form) => {
              if (form.a !== form.b) {
                return {
                  path: ["a"],
                  message: "Email and confirmation must match!"
                }
              }
            })
          ))
        return { form }
      }
    })

    await wrapper.vm.$nextTick()
    const valuesText = wrapper.find("[data-testid=\"values\"]").text()
    const values = JSON.parse(valuesText)

    expect(values).toEqual({
      "a": "default",
      "b": "",
      "c": ["C", "Non Empty Array"],
      "d": [{ "e": "default" }],
      "f": { "_tag": "taggo1", "g": "default", "i": "default", "h": "default" },
      "j": 0,
      "k": true,
      "l": null,
      "m": { "n": null },
      "p": null,
      "r": null,
      "s": null,
      "t": 1000,
      "u": null
    })
  })

  it("should have correct default values for form nine (ClassSchema with filter inline)", async () => {
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
        const form = useOmegaForm(ClassSchema.pipe(S.filter((form) => {
          if (form.a !== form.b) {
            return {
              path: ["a"],
              message: "Email and confirmation must match!"
            }
          }
        })))
        return { form }
      }
    })

    await wrapper.vm.$nextTick()
    const valuesText = wrapper.find("[data-testid=\"values\"]").text()
    const values = JSON.parse(valuesText)

    expect(values).toEqual({
      "a": "default",
      "b": "",
      "c": ["C", "Non Empty Array"],
      "d": [{ "e": "default" }],
      "f": { "_tag": "taggo1", "g": "default", "i": "default", "h": "default" },
      "j": 0,
      "k": true,
      "l": null,
      "m": { "n": null },
      "p": null,
      "r": null,
      "s": null,
      "t": 1000,
      "u": null
    })
  })
})

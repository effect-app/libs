import { mount } from "@vue/test-utils"
import * as S from "effect-app/Schema"
import { NonEmptyString255 } from "effect-app/Schema"
import { describe, expect, it } from "vitest"
import { generateMetaFromSchema, type MetaRecord } from "../src/components/OmegaForm"
import OmegaIntlProvider from "./OmegaIntlProvider.vue"

class kkk extends S.Class<kkk>("kkk")({
  lll: S.String.pipe(S.minLength(10)).pipe(S.maxLength(21)),
  mmm: S.Number.pipe(S.between(10, 20))
}) {}

class bbb extends S.Class<bbb>("bbb")({
  ccc: S.String.pipe(S.minLength(1)).pipe(S.maxLength(2)),
  ddd: S.NullOr(S.String.pipe(S.maxLength(3))),
  jjj: S.UndefinedOr(S.String.pipe(S.maxLength(4))),
  nnn: S.Number.pipe(S.between(10, 20)),
  kkk,
  ooo: S.String.pipe(S.minLength(1)).pipe(S.maxLength(23))
}) {}

describe("OmegaForm", () => {
  describe("addRecursiveAnnotations", () => {
    it("should properly extract metadata from complex schema", () => {
      const testSchema = S.Struct({
        aaa: NonEmptyString255,
        bbb: S.NullOr(bbb),
        eee: S.Number.pipe(S.between(10, 20)),
        fff: S.Union(S.Literal("left"), S.Literal("right"), S.Literal("both")),
        zzz: S.NullOr(S.Number.pipe(S.between(10, 20))).pipe(
          S.annotations({
            message: () => "foobar"
          })
        )
      })

      const expectedMeta = {
        aaa: {
          maxLength: 255,
          minLength: 1,
          nullableOrUndefined: false,
          required: true,
          type: "string"
        },
        "bbb.ccc": {
          maxLength: 2,
          minLength: 1,
          nullableOrUndefined: false,
          required: true,
          type: "string"
        },
        "bbb.ddd": {
          maxLength: 3,
          nullableOrUndefined: "null",
          required: false,
          type: "string"
        },
        "bbb.jjj": {
          maxLength: 4,
          nullableOrUndefined: "undefined",
          required: false,
          type: "string"
        },
        "bbb.kkk.lll": {
          maxLength: 21,
          minLength: 10,
          nullableOrUndefined: false,
          required: true,
          type: "string"
        },
        "bbb.kkk.mmm": {
          maximum: 20,
          minimum: 10,
          nullableOrUndefined: false,
          required: true,
          type: "number"
        },
        "bbb.nnn": {
          maximum: 20,
          minimum: 10,
          nullableOrUndefined: false,
          required: true,
          type: "number"
        },
        "bbb.ooo": {
          maxLength: 23,
          minLength: 1,
          nullableOrUndefined: false,
          required: true,
          type: "string"
        },
        eee: {
          maximum: 20,
          minimum: 10,
          nullableOrUndefined: false,
          required: true,
          type: "number"
        },
        fff: {
          members: ["left", "right", "both"],

          nullableOrUndefined: false,
          required: true,
          type: "select"
        },
        zzz: {
          maximum: 20,
          minimum: 10,
          nullableOrUndefined: "null",
          required: false,
          type: "number"
        }
      }

      const result = generateMetaFromSchema(testSchema)

      expect(result).toHaveProperty("schema")
      expect(result).toHaveProperty("meta")

      expect(result.schema).toBe(testSchema)

      expect(result.meta).toEqual(expectedMeta)
    })
  })

  describe("generateMetaFromSchema", () => {
    it("should generate meta from schema", () => {
      const testSchema = S.Struct({
        aaa: S.String,
        bbb: S.NullOr(
          S.Struct({
            ccc: S.String.pipe(S.minLength(1)).pipe(S.maxLength(2)),
            ddd: S.NullOr(S.String.pipe(S.maxLength(3))),
            jjj: S.UndefinedOr(S.String.pipe(S.maxLength(4))),
            nnn: S.Number.pipe(S.between(10, 20)),
            kkk: S.Struct({
              lll: S.String.pipe(S.minLength(10)).pipe(S.maxLength(21)),
              mmm: S.Number.pipe(S.between(10, 20))
            }),
            ooo: S.String.pipe(S.minLength(1)).pipe(S.maxLength(23))
          })
        ),
        eee: S.Number.pipe(S.between(10, 20)),
        fff: S.Union(S.Literal("left"), S.Literal("right"), S.Literal("both")),
        zzz: S.NullOr(S.Number.pipe(S.between(10, 20)))
      })

      const result = generateMetaFromSchema(testSchema)

      // Type check: ensure the meta record has the correct keys
      type TestType = typeof testSchema extends S.Schema<infer _, infer T, any> ? T : never
      const meta: MetaRecord<TestType> = result.meta

      // Value check
      expect(meta["aaa"]).toBeDefined()
      expect(meta["bbb.ccc"]).toBeDefined()
      expect(meta["bbb.kkk.lll"]).toBeDefined()
      expect(meta["eee"]).toBeDefined()
      expect(meta["fff"]).toBeDefined()
      expect(result.schema).toBe(testSchema)
    })
  })
})

// Create a wrapper component that includes the OmegaIntlProvider
const OmegaFormWithProvider = {
  components: {
    OmegaIntlProvider
  },
  template: `
    <OmegaIntlProvider>
      <OmegaForm />
    </OmegaIntlProvider>
  `
}

describe("OmegaForm UI", () => {
  it("renders", () => {
    const wrapper = mount(OmegaFormWithProvider)
    expect(wrapper.exists()).toBe(true)
  })

  it("should display the sum of first and second inputs", async () => {
    const wrapper = mount(OmegaFormWithProvider)

    // Find the input elements
    const firstInput = wrapper.find("input[id=\"first\"]")
    const secondInput = wrapper.find("input[id=\"second\"]")

    // Set values
    await firstInput.setValue(10)
    await secondInput.setValue(20)

    // Trigger change events
    await firstInput.trigger("change")
    await secondInput.trigger("change")

    // Get the element showing the sum
    const sumElement = wrapper.find("[data-testid=\"valuez\"]")

    // Assert the sum is correct (10 + 20 = 30)
    expect(sumElement.text()).toBe("30")
  })
})

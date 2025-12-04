import { S } from "effect-app"
import { describe, expect, it } from "vitest"
import { generateInputStandardSchemaFromFieldMeta, generateMetaFromSchema } from "../src/components/OmegaForm/OmegaFormStuff"

// mock German translations
const germanTranslations: Record<string, string> = {
  "validation.integer.expected": "Es wird eine ganze Zahl erwartet, tatsächlich: {actualValue}",
  "validation.number.expected": "Es wird eine Zahl erwartet, tatsächlich: {actualValue}",
  "validation.empty": "Das Feld darf nicht leer sein"
}

const mockTrans = (id: string, values?: Record<string, any>) => {
  let text = germanTranslations[id] || id
  if (values) {
    Object.entries(values).forEach(([key, value]) => {
      text = text.replace(`{${key}}`, String(value))
    })
  }
  return text
}

describe("Integer validation with German translations", () => {
  it("should generate int metadata for S.Int fields", () => {
    const TestSchema = S.Struct({
      value: S.Int
    })

    const { meta } = generateMetaFromSchema(TestSchema)
    console.log("Meta:", JSON.stringify(meta, null, 2))

    expect(meta.value?.type).toBe("int")
  })

  it("should show German error for decimal values", async () => {
    const TestSchema = S.Struct({
      value: S.Int
    })

    const { meta } = generateMetaFromSchema(TestSchema)
    const schema = generateInputStandardSchemaFromFieldMeta(meta.value!, mockTrans)

    // test with a decimal value
    const result = await schema["~standard"].validate(59.5)
    console.log("Validation result for 59.5:", JSON.stringify(result, null, 2))

    expect(result.issues).toBeDefined()
    expect(result.issues?.[0]?.message).toContain("ganze Zahl")
  })

  it("should show German error for undefined values", async () => {
    const TestSchema = S.Struct({
      value: S.Int
    })

    const { meta } = generateMetaFromSchema(TestSchema)
    const schema = generateInputStandardSchemaFromFieldMeta(meta.value!, mockTrans)

    // test with undefined value
    const result = await schema["~standard"].validate(undefined)
    console.log("Validation result for undefined:", JSON.stringify(result, null, 2))

    expect(result.issues).toBeDefined()
    // should be German empty message
    expect(result.issues?.[0]?.message).toBe("Das Feld darf nicht leer sein")
  })

  it("should accept valid integer values", async () => {
    const TestSchema = S.Struct({
      value: S.Int
    })

    const { meta } = generateMetaFromSchema(TestSchema)
    const schema = generateInputStandardSchemaFromFieldMeta(meta.value!, mockTrans)

    // test with a valid integer
    const result = await schema["~standard"].validate(59)
    console.log("Validation result for 59:", JSON.stringify(result, null, 2))

    expect(result.issues).toBeUndefined()
    expect("value" in result && result.value).toBe(59)
  })
})

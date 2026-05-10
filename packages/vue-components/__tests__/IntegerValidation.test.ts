import * as S from "effect-app/Schema"
import { describe, expect, it } from "vitest"
import { generateMetaFromSchema, type NumberFieldMeta, toLocalizedStandardSchemaV1 } from "../src/components/OmegaForm"

const germanTranslations: Record<string, string> = {
  "validation.integer.expected": "Es wird eine ganze Zahl erwartet, tatsächlich: {actualValue}",
  "validation.number.expected": "Es wird eine Zahl erwartet, tatsächlich: {actualValue}",
  "validation.empty": "Das Feld darf nicht leer sein"
}

const germanTrans = (id: string, values?: Record<string, any>) => {
  let text = germanTranslations[id] || id
  if (values) {
    for (const [k, v] of Object.entries(values)) text = text.replace(`{${k}}`, String(v))
  }
  return text
}

describe("Integer validation with German translations (form-level localized schema)", () => {
  it("should generate number metadata with int refinement for S.Int fields", () => {
    const TestSchema = S.Struct({ value: S.Int })
    const { meta } = generateMetaFromSchema(TestSchema)
    expect(meta.value?.type).toBe("number")
    expect((meta.value as NumberFieldMeta).refinement).toBe("int")
  })

  it("shows German error for decimal value at form-level validation", async () => {
    const standardSchema = toLocalizedStandardSchemaV1(S.Struct({ value: S.Int }) as any, germanTrans)
    const result = await standardSchema["~standard"].validate({ value: 59.5 })
    expect(result.issues).toBeDefined()
    const issue = result.issues?.find((i: any) => i.path?.[0] === "value")
    expect(issue?.message).toContain("ganze Zahl")
  })

  it("shows German empty message for undefined required int at form-level validation", async () => {
    const standardSchema = toLocalizedStandardSchemaV1(S.Struct({ value: S.Int }) as any, germanTrans)
    const result = await standardSchema["~standard"].validate({ value: undefined })
    expect(result.issues).toBeDefined()
    const issue = result.issues?.find((i: any) => i.path?.[0] === "value")
    expect(issue?.message).toBe("Das Feld darf nicht leer sein")
  })

  it("accepts valid integer at form-level validation", async () => {
    const standardSchema = toLocalizedStandardSchemaV1(S.Struct({ value: S.Int }) as any, germanTrans)
    const result = await standardSchema["~standard"].validate({ value: 59 })
    expect(result.issues).toBeUndefined()
    expect("value" in result && (result as any).value).toEqual({ value: 59 })
  })
})

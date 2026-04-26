import { S } from "effect-app"
import { describe, expect, it } from "vitest"
import { generateMetaFromSchema, toLocalizedStandardSchemaV1 } from "../../src/components/OmegaForm/OmegaFormStuff"

const identityTrans: Parameters<typeof toLocalizedStandardSchemaV1>[1] = (id, values) => {
  if (!values) {
    return id
  }
  return Object.entries(values).reduce(
    (acc, [key, value]) => acc.replaceAll(`{${key}}`, String(value)),
    id
  )
}

const maxLineLengthCheck = (max: number) =>
  S.makeFilter((value: string) => {
    const tooLong = value.split("\n").find((line) => line.length > max)
    return tooLong !== undefined ? `Line "${tooLong}" exceeds ${max} chars` : undefined
  })

describe("OmegaForm field schema custom checks", () => {
  it("includes custom filter checks in field-level standard schema", async () => {
    const schema = S.Struct({
      height: S.NonEmptyString100.pipe(
        S.check(S.isMinLength(10)),
        S.check(maxLineLengthCheck(20))
      )
    })

    const { meta } = generateMetaFromSchema(schema)
    const heightSchema = toLocalizedStandardSchemaV1(meta.height!.originalCodec, identityTrans)

    expect(heightSchema).toBeDefined()

    const invalid = "1234567890\n123456789012345678901"
    const result = await heightSchema["~standard"].validate(invalid)

    expect(result.issues).toBeDefined()
    expect(result.issues?.[0]?.message).toContain("exceeds 20 chars")
  })
})

import { S } from "effect-app"
import { describe, expect, it } from "vitest"
import { toLocalizedStandardSchemaV1 } from "../../src/components/OmegaForm"

const identityTrans = (id: string, values?: Record<string, any>) => {
  if (!values) return id
  return Object.entries(values).reduce(
    (acc, [k, v]) => acc.replaceAll(`{${k}}`, String(v)),
    id
  )
}

const maxLineLengthCheck = (max: number) =>
  S.makeFilter((value: string) => {
    const tooLong = value.split("\n").find((line) => line.length > max)
    return tooLong !== undefined ? `Line "${tooLong}" exceeds ${max} chars` : undefined
  })

describe("OmegaForm form-level schema custom checks", () => {
  it("includes custom filter checks in the form-level localized schema", async () => {
    const schema = S.Struct({
      height: S.NonEmptyString100.pipe(
        S.check(S.isMinLength(10)),
        S.check(maxLineLengthCheck(20))
      )
    })

    const standardSchema = toLocalizedStandardSchemaV1(schema as any, identityTrans)
    const invalid = "1234567890\n123456789012345678901"
    const result = await standardSchema["~standard"].validate({ height: invalid })

    expect(result.issues).toBeDefined()
    const issue = result.issues?.find((i: any) => i.path?.[0] === "height")
    expect(issue).toBeDefined()
    expect(issue?.message).toContain("exceeds 20 chars")
  })
})

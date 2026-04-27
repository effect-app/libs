import { S } from "effect-app"
import { describe, expect, it } from "vitest"
import * as OmegaFormStuff from "../../src/components/OmegaForm"
import { type FieldMeta, generateMetaFromSchema } from "../../src/components/OmegaForm"

const identityTrans = (id: string, values?: Record<string, string | number | boolean>) => {
  if (!values) {
    return id
  }
  return Object.entries(values).reduce(
    (acc, [key, value]) => acc.replaceAll(`{${key}}`, String(value)),
    id
  )
}

const makeFieldStandardSchema = (fieldMeta: FieldMeta) => {
  const toLocalizedStandardSchemaV1 = Reflect.get(OmegaFormStuff, "toLocalizedStandardSchemaV1")
  if (
    typeof toLocalizedStandardSchemaV1 === "function"
    && "originalCodec" in fieldMeta
    && fieldMeta.originalCodec
  ) {
    return toLocalizedStandardSchemaV1(fieldMeta.originalCodec, identityTrans)
  }

  const generateInputStandardSchemaFromFieldMeta = Reflect.get(
    OmegaFormStuff,
    "generateInputStandardSchemaFromFieldMeta"
  )
  if (typeof generateInputStandardSchemaFromFieldMeta === "function") {
    return generateInputStandardSchemaFromFieldMeta(fieldMeta, identityTrans)
  }

  throw new Error("No field-level standard schema builder available")
}

describe("OmegaForm discriminator field validation", () => {
  it("validates root union branch discriminator metadata", async () => {
    const schema = S.Union([
      S.TaggedStruct("alpha", { alpha: S.NonEmptyString }),
      S.TaggedStruct("beta", { beta: S.NonEmptyString })
    ])

    const { unionMeta } = generateMetaFromSchema(schema)

    for (const tag of ["alpha", "beta"]) {
      const tagMeta = unionMeta[tag]?._tag
      expect(tagMeta, `Missing _tag metadata for ${tag}`).toBeDefined()
      if (!tagMeta) {
        continue
      }

      const tagSchema = makeFieldStandardSchema(tagMeta)
      expect(await tagSchema["~standard"].validate(tag)).toEqual({ value: tag })
    }
  })

  it("validates every merged nested discriminator member", async () => {
    const schema = S.Struct({
      myUnion: S.Union([
        S.TaggedStruct("alpha", { alpha: S.NonEmptyString }),
        S.TaggedStruct("beta", { beta: S.NonEmptyString })
      ])
    })

    const { meta } = generateMetaFromSchema(schema)
    const tagMeta = meta["myUnion._tag"]
    expect(tagMeta?.type).toBe("select")

    if (!tagMeta || tagMeta.type !== "select") {
      return
    }

    const tagSchema = makeFieldStandardSchema(tagMeta)
    for (const member of tagMeta.members) {
      expect(await tagSchema["~standard"].validate(member)).toEqual({ value: member })
    }
  })
})

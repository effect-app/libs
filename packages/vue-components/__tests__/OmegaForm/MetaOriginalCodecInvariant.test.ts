import { S, SchemaGetter } from "effect-app"
import { describe, expect, it } from "vitest"
import { generateMetaFromSchema } from "../../src/components/OmegaForm"
import { type MetaRecord, toLocalizedStandardSchemaV1 } from "../../src/components/OmegaForm/OmegaFormStuff"

const identityTrans: Parameters<typeof toLocalizedStandardSchemaV1>[1] = (id, values) => {
  if (!values) {
    return id
  }
  return Object.entries(values).reduce(
    (acc, [key, value]) => acc.replaceAll(`{${key}}`, String(value)),
    id
  )
}

const assertMetaHasOriginalCodec = (meta: MetaRecord<any>) => {
  const entries = Object.entries(meta)
  expect(entries.length).toBeGreaterThan(0)

  for (const [path, fieldMeta] of entries) {
    expect(fieldMeta, `Missing field meta at path: ${path}`).toBeDefined()
    expect(fieldMeta?.originalCodec, `Missing originalCodec at path: ${path}`).toBeDefined()
    if (fieldMeta?.originalCodec) {
      expect(() => toLocalizedStandardSchemaV1(fieldMeta.originalCodec, identityTrans)).not.toThrow()
    }
  }
}

describe("OmegaForm meta originalCodec invariant", () => {
  it("ensures originalCodec exists for nested struct fields", () => {
    const schema = S.Struct({
      user: S.Struct({
        name: S.NonEmptyString,
        age: S.Int,
        tags: S.Array(S.String)
      })
    })

    const { meta } = generateMetaFromSchema(schema)
    assertMetaHasOriginalCodec(meta)
  })

  it("ensures originalCodec exists for discriminated union branch fields", () => {
    const alpha = S.Struct({
      first: S.Literal("alpha"),
      alpha: S.NonEmptyString
    })

    const beta = S.Struct({
      first: S.Literal("beta"),
      beta: S.NonEmptyString
    })

    const schema = S.Struct({
      myUnion: S.Union([alpha, beta])
    })

    const { meta } = generateMetaFromSchema(schema)
    assertMetaHasOriginalCodec(meta)
    expect(meta["myUnion.first"]?.originalCodec).toBeDefined()
    expect(meta["myUnion.alpha"]?.originalCodec).toBeDefined()
    expect(meta["myUnion.beta"]?.originalCodec).toBeDefined()
  })

  it("ensures originalCodec exists for transformed schemas", () => {
    const base = S.Struct({
      name: S.String,
      age: S.String
    })

    const transformed = base.pipe(S.decodeTo(base, {
      decode: SchemaGetter.passthrough({ strict: false }),
      encode: SchemaGetter.passthrough({ strict: false })
    }))

    const { meta } = generateMetaFromSchema(transformed)
    assertMetaHasOriginalCodec(meta)
  })
})

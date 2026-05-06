// __tests__/OmegaForm/Meta.test.ts
import { S } from "effect-app"
import { describe, expect, it } from "vitest"
import { generateMetaFromSchema } from "../../src/components/OmegaForm"

const subStruct = {
  a: S.NullOr(S.String),
  b: S.UndefinedOr(S.Finite),
  c: S.NullishOr(S.Finite),
  d: S.String,
  e: S.Finite,
  f: S.Boolean
}

const schema = S.Struct({
  ...subStruct,
  struct: S.Struct(subStruct),
  nullableStruct: S.NullOr(S.Struct(subStruct))
})

const expectedSubMeta = {
  a: { required: false, nullableOrUndefined: "null", type: "string" },
  b: { required: false, nullableOrUndefined: "undefined", type: "number" },
  c: { required: false, nullableOrUndefined: "undefined", type: "number" },
  d: { type: "string", required: false, nullableOrUndefined: false },
  e: { type: "number", required: true, nullableOrUndefined: false },
  f: { type: "boolean", required: true, nullableOrUndefined: false }
}

describe("Meta story characterization", () => {
  it("matches the rendered meta keys and values", () => {
    const { meta } = generateMetaFromSchema(schema)

    for (const [key, value] of Object.entries(expectedSubMeta)) {
      expect(meta[key as keyof typeof meta], `root.${key}`).toMatchObject(value)
      expect(meta[`struct.${key}` as keyof typeof meta], `struct.${key}`).toMatchObject(value)
      expect(meta[`nullableStruct.${key}` as keyof typeof meta], `nullableStruct.${key}`).toMatchObject(value)
    }
  })
})

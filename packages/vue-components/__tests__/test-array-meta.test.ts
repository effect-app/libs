import { S } from "effect-app"
import { describe, expect, it } from "vitest"
import { generateMetaFromSchema } from "../src/components/OmegaForm/OmegaFormStuff"

const schema = S.Struct({
  a: S.Array(S.Struct({
    b: S.String,
    c: S.Array(S.Struct({
      d: S.String
    })),
    e: S.Array(S.Number)
  })),
  aMultiple: S.Array(S.String),
  aNullable: S.NullOr(S.Struct({
    a: S.String
  })),
  foo: S
    .NullOr(
      S.Struct({
        bar: S.UndefinedOr(S.Array(S.Struct({
          baz: S.String,
          items: S.NonEmptyArray(S.Struct({
            baz: S.String,
            value: S.Number
          }))
        })))
      })
    )
})

describe("test-array-meta", () => {
  it("should generate metadata for arrays", () => {
    const result = generateMetaFromSchema(schema)
    console.log("Generated metadata:", JSON.stringify(result.meta, null, 2))
    console.log("Keys:", Object.keys(result.meta))

    expect(result.meta).toHaveProperty("a.b")
    expect(result.meta["a.b"].type).toBe("string")
    expect(result.meta).toHaveProperty("a.c.d")
    expect(result.meta["a.c.d"].type).toBe("string")
    expect(result.meta).toHaveProperty("a.e")
    expect(result.meta["a.e"].type).toBe("multiple")
    expect(result.meta).toHaveProperty("aMultiple")
    expect(result.meta["aMultiple"]?.type).toBe("multiple")
    expect(result.meta).toHaveProperty("aNullable.a")
    expect(result.meta["aNullable.a"]?.type).toBe("string")
    expect(result.meta).not.toHaveProperty("aNullable")
    expect(result.meta).toHaveProperty("foo.bar.items.baz")
    expect(result.meta["foo.bar.items.baz"]?.type).toBe("string")
    expect(result.meta).toHaveProperty("foo.bar.items.value")
    expect(result.meta["foo.bar.items.value"]?.type).toBe("number")
    expect(result.meta).toHaveProperty("foo.bar.baz")
    expect(result.meta["foo.bar.baz"]?.type).toBe("string")
  })
})

import { Effect, S } from "effect-app"
import { describe, expect, it } from "vitest"
import { generateMetaFromSchema } from "../../src/components/OmegaForm/OmegaFormStuff"

describe("optionalKey required handling", () => {
  it("should mark optionalKey fields as not required", () => {
    const schema = S.Struct({
      number: S.optionalKey(S.Int.pipe(S.check(S.isBetween({ minimum: 1, maximum: 20 })))),
      height: S.NonEmptyString100.pipe(S.check(S.isMinLength(10)))
    })

    const { meta } = generateMetaFromSchema(schema)

    // optionalKey field should NOT be required
    expect(meta.number?.required).toBe(false)

    // regular field should still be required
    expect(meta.height?.required).toBe(true)
  })

  it("should mark optionalKey with decodingDefault as not required", () => {
    const schema = S.Struct({
      name: S.optionalKey(S.String).pipe(S.withDecodingDefault(Effect.succeed("defaultName"))),
      age: S.NonEmptyString255
    })

    const { meta } = generateMetaFromSchema(schema)

    expect(meta.name?.required).toBe(false)
    expect(meta.age?.required).toBe(true)
  })

  it("should handle optionalKey in tagged union branches", () => {
    const schema = S.Union([
      S.TaggedStruct("one", {
        a: S.Struct({
          number: S.optionalKey(S.Int.pipe(S.check(S.isBetween({ minimum: 1, maximum: 20 })))),
          height: S.NonEmptyString100.pipe(S.check(S.isMinLength(10))),
          z: S.NonEmptyString100.pipe(S.check(S.isMinLength(10)))
        })
      }),
      S.TaggedStruct("two", {
        a: S.Struct({
          number: S.optionalKey(S.Int.pipe(S.check(S.isBetween({ minimum: 1, maximum: 20 })))),
          height: S.NonEmptyString100.pipe(S.check(S.isMinLength(10))),
          y: S.NonEmptyString100.pipe(S.check(S.isMinLength(10)))
        })
      })
    ])

    const { meta } = generateMetaFromSchema(schema)

    // optionalKey in both union branches should not be required
    expect(meta["a.number"]?.required).toBe(false)

    // regular fields should be required
    expect(meta["a.height"]?.required).toBe(true)
    expect(meta["a.z"]?.required).toBe(true)
    expect(meta["a.y"]?.required).toBe(true)
  })
})

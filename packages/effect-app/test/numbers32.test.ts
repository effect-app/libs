import * as S from "effect-app/Schema"
import { flattenSimpleAllOf, specialJsonSchemaDocument } from "effect-app/Schema/SpecialJsonSchema"
import { deduplicateOpenApiSchemas } from "effect-app/Schema/SpecialOpenApi"
import * as Arbitrary from "effect/Arbitrary"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import { HttpApi, HttpApiEndpoint, HttpApiGroup, OpenApi } from "effect/http-api"
import { describe, expect, test } from "vitest"

const { FLOAT32_MAX, FLOAT32_MIN_POSITIVE, INT32_MAX, INT32_MIN } = S
const binary32Max = (2 - 2 ** -23) * 2 ** 127
// next double above FLOAT32_MAX (its ulp is 2^75)
const aboveFloat32Max = FLOAT32_MAX + 2 ** 75
// genuine binary32 overflow / underflow
const overflows = 3.4028236e38
const underflows = 7e-46
const nonFinite = [NaN, Infinity, -Infinity]

const cases = [
  {
    name: "Int32",
    schema: S.Int32,
    accept: [INT32_MIN, -1, 0, 1, INT32_MAX],
    reject: [INT32_MIN - 1, INT32_MAX + 1, Number.MAX_SAFE_INTEGER, 1.5, -0.5, ...nonFinite]
  },
  {
    name: "NonNegativeInt32",
    schema: S.NonNegativeInt32,
    accept: [0, 1, INT32_MAX],
    reject: [-1, INT32_MIN, INT32_MAX + 1, 0.5, ...nonFinite]
  },
  {
    name: "PositiveInt32",
    schema: S.PositiveInt32,
    accept: [1, INT32_MAX],
    reject: [0, -1, INT32_MAX + 1, 0.5, 1.5, ...nonFinite]
  },
  {
    name: "NonNegativeNumber32",
    schema: S.NonNegativeNumber32,
    // underflow to 0 in binary32 keeps the value non-negative: accepted
    accept: [0, underflows, 2 ** -149, FLOAT32_MIN_POSITIVE, 0.1, 1.5, INT32_MAX + 0.5, binary32Max, FLOAT32_MAX],
    reject: [-0.1, -FLOAT32_MIN_POSITIVE, aboveFloat32Max, overflows, Number.MAX_VALUE, ...nonFinite]
  },
  {
    name: "PositiveNumber32",
    schema: S.PositiveNumber32,
    accept: [FLOAT32_MIN_POSITIVE, 2 ** -149, 0.1, 1, 1.5, INT32_MAX + 0.5, binary32Max, FLOAT32_MAX],
    reject: [0, -0.1, underflows, aboveFloat32Max, overflows, Number.MAX_VALUE, ...nonFinite]
  }
] as const

test("bounds match Java Integer / Float", () => {
  expect(INT32_MIN).toBe(-(2 ** 31))
  expect(INT32_MAX).toBe(2 ** 31 - 1)
  expect(INT32_MAX + 1 | 0).toBe(INT32_MIN)
  // Java Float.toString(Float.MAX_VALUE / Float.MIN_VALUE)
  expect(FLOAT32_MAX).toBe(Number("3.4028235E38"))
  expect(FLOAT32_MIN_POSITIVE).toBe(Number("1.4E-45"))
  expect(Math.fround(FLOAT32_MAX)).toBe(binary32Max)
  expect(Math.fround(FLOAT32_MIN_POSITIVE)).toBe(2 ** -149)
  expect(Math.fround(overflows)).toBe(Infinity)
  expect(Math.fround(underflows)).toBe(0)
})

describe.each(cases)("$name", ({ accept, reject, schema }) => {
  test("decode/encode accept boundaries, keeping fractions as-is", () => {
    for (const n of accept) {
      expect(S.decodeUnknownSync(schema)(n)).toBe(n)
      expect(S.encodeUnknownSync(schema)(n)).toBe(n)
      expect(schema(n)).toBe(n)
    }
  })

  test("decode/encode reject out-of-range, fractions where integer, NaN and Infinity", () => {
    for (const n of reject) {
      expect(Exit.isFailure(S.decodeUnknownExit(schema)(n)), `decode ${n}`).toBe(true)
      expect(Exit.isFailure(S.encodeUnknownExit(schema)(n)), `encode ${n}`).toBe(true)
      expect(() => schema(n), `make ${n}`).toThrow()
    }
  })

  test("native Arbitrary samples valid values", () => {
    const samples = Effect.runSync(Arbitrary.sampleEffect(Arbitrary.schema(schema), { count: 100, seed: 1 }))
    for (const n of samples) expect(S.is(schema)(n), `${n}`).toBe(true)
  })
})

test("withConstructorDefault is construction-only", () => {
  const s = S.Struct({
    i: S.Int32.withConstructorDefault,
    nni: S.NonNegativeInt32.withConstructorDefault,
    pi: S.PositiveInt32.withConstructorDefault,
    nnn: S.NonNegativeNumber32.withConstructorDefault,
    pn: S.PositiveNumber32.withConstructorDefault
  })
  expect(s.make({})).toStrictEqual({ i: 0, nni: 0, pi: 1, nnn: 0, pn: 1 })
  expect(Exit.isFailure(S.decodeUnknownExit(s)({}))).toBe(true)
})

test("brands extend the existing numeric brands", () => {
  const pi: S.PositiveInt32 = S.PositiveInt32(1)
  const nni: S.NonNegativeInt32 = pi
  const i: S.Int32 = nni
  const pn: S.PositiveNumber32 = pi
  const nnn: S.NonNegativeNumber32 = pn
  const wide: Array<S.Int> = [i, nni, S.NonNegativeInt(1), S.PositiveInt(1)]
  const existing: [S.PositiveInt, S.NonNegativeInt, S.PositiveNumber, S.NonNegativeNumber] = [pi, nni, pn, nnn]
  // @ts-expect-error Int is not bounded to 32 bit
  const _narrow: S.Int32 = S.Int(1)
  // @ts-expect-error PositiveNumber is not bounded to binary32
  const _narrowN: S.PositiveNumber32 = S.PositiveNumber(1)
  expect([...wide, ...existing]).toHaveLength(8)
})

describe("JSON Schema / OpenAPI", () => {
  const expected = {
    Int32: { type: "integer", minimum: INT32_MIN, maximum: INT32_MAX, format: "int32" },
    NonNegativeInt32: { type: "integer", minimum: 0, maximum: INT32_MAX, format: "int32" },
    PositiveInt32: { type: "integer", minimum: 1, maximum: INT32_MAX, format: "int32" },
    NonNegativeNumber32: { type: "number", minimum: 0, maximum: FLOAT32_MAX, format: "float" },
    PositiveNumber32: { type: "number", minimum: FLOAT32_MIN_POSITIVE, maximum: FLOAT32_MAX, format: "float" }
  }

  test.each(cases)("$name JSON Schema", ({ name, schema }) => {
    expect(specialJsonSchemaDocument(schema).definitions[name]).toStrictEqual(expected[name])
  })

  test("OpenAPI components keep 32-bit and existing schemas apart", () => {
    const Payload = S.Struct({
      int: S.Int,
      positiveInt: S.PositiveInt,
      nonNegativeInt: S.NonNegativeInt,
      int32: S.Int32,
      positiveInt32: S.PositiveInt32,
      nonNegativeInt32: S.NonNegativeInt32,
      positiveNumber32: S.PositiveNumber32,
      nonNegativeNumber32: S.NonNegativeNumber32
    })
    const api = HttpApi.make("api").add(
      HttpApiGroup.make("g").add(HttpApiEndpoint.post("p", "/p", { payload: Payload }))
    )
    const schemas = deduplicateOpenApiSchemas(OpenApi.fromApi(api))["components"]["schemas"]
    expect(schemas).toStrictEqual({
      ...expected,
      Int: { type: "integer", minimum: Number.MIN_SAFE_INTEGER, maximum: Number.MAX_SAFE_INTEGER },
      PositiveInt: { type: "integer", exclusiveMinimum: 0, maximum: Number.MAX_SAFE_INTEGER },
      NonNegativeInt: { type: "integer", minimum: 0, maximum: Number.MAX_SAFE_INTEGER }
    })
  })

  test("flattenSimpleAllOf intersects bounds of composed checks", () => {
    const doc = specialJsonSchemaDocument(S.Number.check(S.isInt32(), S.isGreaterThanOrEqualTo(0)))
    expect(doc.schema).toStrictEqual({ type: "integer", minimum: 0, maximum: INT32_MAX })
  })

  test("flattenSimpleAllOf keeps allOf on conflicting non-bound keywords", () => {
    const input = { type: "string", format: "uuid", allOf: [{ format: "email" }] }
    expect(flattenSimpleAllOf(input)).toStrictEqual(input)
    expect(flattenSimpleAllOf({ type: "string", "x-a": 1, allOf: [{ "x-a": 2, deprecated: true }] }))
      .toStrictEqual({ type: "string", "x-a": 2, deprecated: true })
  })
})

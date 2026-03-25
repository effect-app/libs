import { Redacted } from "effect"
import * as S from "effect-app/Schema"
import { describe, expect, it } from "vitest"
import { generateMetaFromSchema, toFormSchema } from "../../src/components/OmegaForm"

describe("S.Redacted meta generation", () => {
  it("should generate correct meta for S.Redacted(S.NonEmptyString255)", () => {
    const schema = S.Struct({
      email: S.NonEmptyString255,
      password: S.Redacted(S.NonEmptyString255)
    })

    const result = generateMetaFromSchema(schema)

    expect(result.meta["email"]).toMatchObject({
      type: "string",
      minLength: 1,
      maxLength: 255,
      required: true,
      nullableOrUndefined: false
    })

    expect(result.meta["password"]).toMatchObject({
      type: "string",
      minLength: 1,
      maxLength: 255,
      required: true,
      nullableOrUndefined: false
    })
  })

  it("should generate correct meta for S.Redacted(S.String) — not required since empty string is valid", () => {
    const schema = S.Struct({
      secret: S.Redacted(S.String)
    })

    const result = generateMetaFromSchema(schema)

    expect(result.meta["secret"]).toMatchObject({
      type: "string",
      required: false,
      nullableOrUndefined: false
    })
  })

  it("should generate correct meta for S.NullOr(S.Redacted(S.NonEmptyString255))", () => {
    const schema = S.Struct({
      optionalSecret: S.NullOr(S.Redacted(S.NonEmptyString255))
    })

    const result = generateMetaFromSchema(schema)

    expect(result.meta["optionalSecret"]).toMatchObject({
      type: "string",
      required: false,
      nullableOrUndefined: "null"
    })
  })
})

describe("toFormSchema — S.Redacted validation", () => {
  it("should accept plain strings for S.Redacted fields and decode to Redacted", () => {
    const schema = S.Struct({
      email: S.NonEmptyString255,
      password: S.Redacted(S.NonEmptyString255)
    })

    const formSchema = toFormSchema(schema)
    const result = S.decodeUnknownSync(formSchema)({
      email: "test@test.com",
      password: "secret123"
    })

    expect(result.email).toBe("test@test.com")
    expect(Redacted.isRedacted(result.password)).toBe(true)
    expect(Redacted.value(result.password as Redacted.Redacted)).toBe("secret123")
  })

  it("should accept plain strings for S.Redacted(S.String)", () => {
    const schema = S.Struct({
      secret: S.Redacted(S.String)
    })

    const formSchema = toFormSchema(schema)
    const result = S.decodeUnknownSync(formSchema)({ secret: "hello" })

    expect(Redacted.isRedacted(result.secret)).toBe(true)
  })

  it("should pass standard schema validation with plain string values", () => {
    const schema = S.Struct({
      email: S.NonEmptyString255,
      password: S.Redacted(S.NonEmptyString255)
    })

    const formSchema = toFormSchema(schema)
    const ssv = S.toStandardSchemaV1(formSchema)
    const result = (ssv as any)["~standard"].validate({
      email: "test@test.com",
      password: "secret123"
    })

    expect(result.issues).toBeUndefined()
  })

  it("should still reject invalid inner values", () => {
    const schema = S.Struct({
      password: S.Redacted(S.NonEmptyString255)
    })

    const formSchema = toFormSchema(schema)
    expect(() => S.decodeUnknownSync(formSchema)({ password: "" })).toThrow()
  })

  it("should handle NullOr(S.Redacted(...))", () => {
    const schema = S.Struct({
      secret: S.NullOr(S.Redacted(S.NonEmptyString255))
    })

    const formSchema = toFormSchema(schema)

    const result1 = S.decodeUnknownSync(formSchema)({ secret: "hello" })
    expect(Redacted.isRedacted(result1.secret)).toBe(true)

    const result2 = S.decodeUnknownSync(formSchema)({ secret: null })
    expect(result2.secret).toBeNull()
  })

  it("should return the original schema when no S.Redacted fields exist", () => {
    const schema = S.Struct({
      email: S.NonEmptyString255,
      name: S.String
    })

    const formSchema = toFormSchema(schema)
    expect(formSchema).toBe(schema)
  })

  it("should work with S.Class schemas", () => {
    class Credentials extends S.Class<Credentials>("Credentials")({
      email: S.NonEmptyString255,
      password: S.Redacted(S.NonEmptyString255)
    }) {}

    const formSchema = toFormSchema(Credentials)
    const result = S.decodeUnknownSync(formSchema)({
      email: "test@test.com",
      password: "secret"
    })

    expect(Redacted.isRedacted(result.password)).toBe(true)
  })
})

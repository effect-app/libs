import { Option, Predicate, Schema, SchemaGetter } from "effect"
import * as S from "effect/Schema"
import { Class, TaggedClass } from "effect-app/Schema/Class"
import { specialJsonSchemaDocument } from "effect-app/Schema/SpecialJsonSchema"
import { deduplicateOpenApiSchemas } from "effect-app/Schema/SpecialOpenApi"
import { describe, expect, it } from "vitest"

describe("Class", () => {
  it("encoding accepts plain objects matching the struct (Fields argument)", () => {
    class A extends Class<A>("A")({ a: S.String }) {}

    // Encoding a class instance still works
    expect(S.encodeUnknownSync(A)(new A({ a: "hello" }))).toStrictEqual({ a: "hello" })

    // Encoding a plain object matching the struct now succeeds
    expect(S.encodeUnknownSync(A)({ a: "world" })).toStrictEqual({ a: "world" })

    // Encoding null still fails
    expect(() => S.encodeUnknownSync(A)(null)).toThrow()
  })

  it("encoding accepts plain objects matching the struct (Struct argument)", () => {
    class A extends Class<A>("A")(S.Struct({ a: S.String })) {}

    expect(S.encodeUnknownSync(A)(new A({ a: "hello" }))).toStrictEqual({ a: "hello" })
    expect(S.encodeUnknownSync(A)({ a: "world" })).toStrictEqual({ a: "world" })
    expect(() => S.encodeUnknownSync(A)(null)).toThrow()
  })

  it("decoding still works normally", () => {
    class A extends Class<A>("A")({ a: S.String }) {}

    const decoded = S.decodeUnknownSync(A)({ a: "hello" })
    expect(decoded).toBeInstanceOf(A)
    expect((decoded as A).a).toBe("hello")

    expect(() => S.decodeUnknownSync(A)(null)).toThrow()
    expect(() => S.decodeUnknownSync(A)({ a: 1 })).toThrow()
  })

  it("rejects values that don't match the struct", () => {
    class A extends Class<A>("A")({ a: S.String }) {}

    expect(() => S.encodeUnknownSync(A)({ a: 123 })).toThrow()
    expect(() => S.encodeUnknownSync(A)("not an object")).toThrow()
  })

  it("returns a class constructor — new and instanceof work", () => {
    class A extends Class<A>("A")({ a: S.String }) {}

    const instance = new A({ a: "hello" })
    expect(instance).toBeInstanceOf(A)
    expect(instance.a).toBe("hello")
  })

  it("preserves fields and identifier", () => {
    class A extends Class<A>("A")({ a: S.String, b: S.Number }) {}

    expect(A.identifier).toBe("A")
    expect(Object.keys(A.fields)).toStrictEqual(["a", "b"])
  })
})

describe("Class constructor", () => {
  it("works as a base class — new, instanceof, encoding plain objects", () => {
    class A extends Class<A>("A")({ a: S.String }) {}

    // Construction
    const instance = new A({ a: "hello" })
    expect(instance).toBeInstanceOf(A)
    expect(instance.a).toBe("hello")

    // Encoding a class instance
    expect(S.encodeUnknownSync(A)(instance)).toStrictEqual({ a: "hello" })

    // Encoding a plain object
    expect(S.encodeUnknownSync(A)({ a: "world" })).toStrictEqual({ a: "world" })

    // Encoding invalid input fails
    expect(() => S.encodeUnknownSync(A)(null)).toThrow()
    expect(() => S.encodeUnknownSync(A)({ a: 123 })).toThrow()
  })

  it("decoding works normally", () => {
    class A extends Class<A>("A")({ a: S.String }) {}

    const decoded = S.decodeUnknownSync(A)({ a: "hello" })
    expect(decoded).toBeInstanceOf(A)
    expect((decoded as A).a).toBe("hello")

    expect(() => S.decodeUnknownSync(A)({ a: 1 })).toThrow()
  })

  it("exposes fields, identifier, pick, omit", () => {
    class A extends Class<A>("A")({ a: S.String, b: S.Number }) {}

    expect(A.identifier).toBe("A")
    expect(Object.keys(A.fields)).toStrictEqual(["a", "b"])
    expect(A.pick("a")).toStrictEqual({ a: A.fields.a })
    expect(A.omit("b")).toStrictEqual({ a: A.fields.a })
  })
})

describe("TaggedClass constructor", () => {
  it("works as a base class with _tag — new, instanceof, encoding plain objects", () => {
    class Circle extends TaggedClass<Circle>()("Circle", { radius: S.Number }) {}

    // Construction
    const instance = new Circle({ radius: 5 })
    expect(instance).toBeInstanceOf(Circle)
    expect(instance._tag).toBe("Circle")
    expect(instance.radius).toBe(5)

    // Encoding a class instance
    expect(S.encodeUnknownSync(Circle)(instance)).toStrictEqual({ _tag: "Circle", radius: 5 })

    // Encoding a plain object
    expect(S.encodeUnknownSync(Circle)({ _tag: "Circle", radius: 10 })).toStrictEqual({ _tag: "Circle", radius: 10 })

    // Encoding invalid input fails
    expect(() => S.encodeUnknownSync(Circle)(null)).toThrow()
    expect(() => S.encodeUnknownSync(Circle)({ _tag: "Circle", radius: "nope" })).toThrow()
  })

  it("decoding works normally", () => {
    class Circle extends TaggedClass<Circle>()("Circle", { radius: S.Number }) {}

    const decoded = S.decodeUnknownSync(Circle)({ _tag: "Circle", radius: 5 })
    expect(decoded).toBeInstanceOf(Circle)
    expect((decoded as Circle).radius).toBe(5)
    expect((decoded as Circle)._tag).toBe("Circle")
  })

  it("exposes fields, identifier, pick, omit", () => {
    class Circle extends TaggedClass<Circle>()("Circle", { radius: S.Number }) {}

    expect(Circle.identifier).toBe("Circle")
    expect(Object.keys(Circle.fields)).toContain("_tag")
    expect(Object.keys(Circle.fields)).toContain("radius")
    expect(Circle.pick("radius")).toStrictEqual({ radius: Circle.fields.radius })
  })
})

describe("SpecialJsonSchema", () => {
  it("nullable to optional — from NullOr", () => {
    const nullableDecodedUndefinedEncoded = (schema: Schema.Top) => {
      const isNullableSchema = "members" in schema
        && globalThis.Array.isArray((schema as any).members)
        && (schema as any).members.length === 2
        && (schema as any).members.some((member: any) => member.ast._tag === "Null")

      const nullableMembers = isNullableSchema ? (schema as any).members as ReadonlyArray<Schema.Top> : undefined
      const innerSchema = nullableMembers
        ? nullableMembers.find((member: any) => member.ast._tag !== "Null")!
        : schema

      const nullableSchema = isNullableSchema ? schema : Schema.NullOr(schema)

      return nullableSchema.pipe(
        Schema.encodeTo(Schema.optionalKey(innerSchema), {
          decode: SchemaGetter.transformOptional(Option.orElseSome(() => null)),
          encode: SchemaGetter.transformOptional(Option.filter(Predicate.isNotNull))
        })
      )
    }

    const fromNullOr = nullableDecodedUndefinedEncoded(Schema.NullOr(Schema.String))
    const structFromNullOr = Schema.Struct({ status: fromNullOr })

    const encode = Schema.encodeUnknownSync(structFromNullOr as any)
    const encodedNull = encode({ status: null }) as any
    expect("status" in encodedNull).toBe(false)
    expect(encode({ status: "test" })).toStrictEqual({ status: "test" })

    const decode = Schema.decodeUnknownSync(structFromNullOr as any)
    expect(decode({})).toStrictEqual({ status: null })
    expect(decode({ status: "test" })).toStrictEqual({ status: "test" })

    const doc = specialJsonSchemaDocument(structFromNullOr)
    expect(doc).toStrictEqual({
      dialect: "draft-2020-12",
      schema: {
        "type": "object",
        "properties": {
          "status": { "type": "string" }
        },
        "additionalProperties": false
      },
      definitions: {}
    })
  })

  it("identifies X universally — deduplicates same-fingerprint references", () => {
    const X = Schema.String.annotate({ title: "X", identifier: "X" })

    const s = Schema.Struct({
      a: Schema.NullOr(X).pipe(
        Schema.encodeTo(Schema.optionalKey(X), {
          decode: SchemaGetter.transformOptional(Option.orElseSome(() => null)),
          encode: SchemaGetter.transformOptional(Option.filter(Predicate.isNotNull))
        })
      ),
      b: Schema.NullOr(X).pipe(
        Schema.encodeTo(Schema.optionalKey(X), {
          decode: SchemaGetter.transformOptional(Option.orElseSome(() => null)),
          encode: SchemaGetter.transformOptional(Option.filter(Predicate.isNotNull))
        })
      ),
      c: Schema.NullOr(X),
      d: X,
      e: X.pipe(Schema.optionalKey)
    })

    const doc = specialJsonSchemaDocument(s)
    expect(doc).toStrictEqual({
      dialect: "draft-2020-12",
      schema: {
        "type": "object",
        "properties": {
          "a": { "$ref": "#/$defs/X" },
          "b": { "$ref": "#/$defs/X" },
          "c": {
            "anyOf": [
              { "$ref": "#/$defs/X" },
              { "type": "null" }
            ]
          },
          "d": { "$ref": "#/$defs/X" },
          "e": { "$ref": "#/$defs/X" }
        },
        "required": ["c", "d"],
        "additionalProperties": false
      },
      definitions: {
        X: {
          "type": "string",
          "title": "X"
        }
      }
    })
  })

  it("shared annotated schema via helper — deduplicates", () => {
    const X = Schema.String.annotate({ title: "X", identifier: "X" })

    const cache = new WeakMap()
    const nullableDecodedUndefinedEncoded = (schema: Schema.Top) => {
      const isNullableSchema = "members" in schema
        && globalThis.Array.isArray((schema as any).members)
        && (schema as any).members.length === 2
        && (schema as any).members.some((member: any) => member.ast._tag === "Null")

      const nullableMembers = isNullableSchema ? (schema as any).members as ReadonlyArray<Schema.Top> : undefined
      const innerSchema = nullableMembers
        ? nullableMembers.find((member: any) => member.ast._tag !== "Null")!
        : schema

      const cached = cache.get(innerSchema.ast)
      if (cached !== undefined) return cached

      const nullableSchema = isNullableSchema ? schema : Schema.NullOr(schema)
      const out = nullableSchema.pipe(
        Schema.encodeTo(Schema.optionalKey(innerSchema), {
          decode: SchemaGetter.transformOptional(Option.orElseSome(() => null)),
          encode: SchemaGetter.transformOptional(Option.filter(Predicate.isNotNull))
        })
      )

      cache.set(innerSchema.ast, out)
      return out
    }

    const structWithShared = Schema.Struct({
      a: nullableDecodedUndefinedEncoded(X),
      b: nullableDecodedUndefinedEncoded(Schema.NullOr(X)),
      c: Schema.NullOr(X),
      d: X,
      e: X.pipe(Schema.optionalKey)
    })

    const doc = specialJsonSchemaDocument(structWithShared)
    expect(doc).toStrictEqual({
      dialect: "draft-2020-12",
      schema: {
        "type": "object",
        "properties": {
          "a": { "$ref": "#/$defs/X" },
          "b": { "$ref": "#/$defs/X" },
          "c": {
            "anyOf": [
              { "$ref": "#/$defs/X" },
              { "type": "null" }
            ]
          },
          "d": { "$ref": "#/$defs/X" },
          "e": { "$ref": "#/$defs/X" }
        },
        "required": ["c", "d"],
        "additionalProperties": false
      },
      definitions: {
        X: {
          "type": "string",
          "title": "X"
        }
      }
    })
  })
})

describe("SpecialOpenApi", () => {
  it("deduplicates identical components.schemas entries with same base identifier", () => {
    const spec = {
      openapi: "3.1.0",
      info: { title: "Test", version: "1.0" },
      paths: {
        "/foo": {
          get: {
            responses: {
              200: {
                content: {
                  "application/json": {
                    schema: { $ref: "#/components/schemas/X" }
                  }
                }
              }
            }
          }
        },
        "/bar": {
          get: {
            responses: {
              200: {
                content: {
                  "application/json": {
                    schema: { $ref: "#/components/schemas/X1" }
                  }
                }
              }
            }
          }
        }
      },
      components: {
        schemas: {
          X: { type: "string", title: "X" },
          X1: { type: "string", title: "X" }
        }
      }
    }

    const result = deduplicateOpenApiSchemas(spec) as any

    // X1 should be removed, and $ref to X1 rewritten to X
    expect(result.components.schemas).toStrictEqual({
      X: { type: "string", title: "X" }
    })
    expect(
      result.paths["/bar"].get.responses[200].content["application/json"].schema
    ).toStrictEqual({ $ref: "#/components/schemas/X" })
  })

  it("does not deduplicate entries with different representations", () => {
    const spec = {
      openapi: "3.1.0",
      info: { title: "Test", version: "1.0" },
      paths: {},
      components: {
        schemas: {
          X: { type: "string", title: "X" },
          X1: { type: "number", title: "X" }
        }
      }
    }

    const result = deduplicateOpenApiSchemas(spec) as any

    // Both should remain since they have different representations
    expect(result.components.schemas).toStrictEqual({
      X: { type: "string", title: "X" },
      X1: { type: "number", title: "X" }
    })
  })

  it("returns spec unchanged when no duplicates exist", () => {
    const spec = {
      openapi: "3.1.0",
      info: { title: "Test", version: "1.0" },
      paths: {},
      components: {
        schemas: {
          Foo: { type: "string" },
          Bar: { type: "number" }
        }
      }
    }

    const result = deduplicateOpenApiSchemas(spec)
    expect(result).toBe(spec) // same reference, no cloning needed
  })

  it("rewrites nested $ref pointers in allOf/anyOf/oneOf", () => {
    const spec = {
      openapi: "3.1.0",
      info: { title: "Test", version: "1.0" },
      paths: {
        "/baz": {
          post: {
            requestBody: {
              content: {
                "application/json": {
                  schema: {
                    anyOf: [
                      { $ref: "#/components/schemas/Y1" },
                      { type: "null" }
                    ]
                  }
                }
              }
            }
          }
        }
      },
      components: {
        schemas: {
          Y: { type: "object", properties: { name: { type: "string" } } },
          Y1: { type: "object", properties: { name: { type: "string" } } }
        }
      }
    }

    const result = deduplicateOpenApiSchemas(spec) as any

    expect(result.components.schemas).toStrictEqual({
      Y: { type: "object", properties: { name: { type: "string" } } }
    })
    expect(
      result.paths["/baz"].post.requestBody.content["application/json"].schema.anyOf[0]
    ).toStrictEqual({ $ref: "#/components/schemas/Y" })
  })

  it("rewrites $ref pointers inside definitions themselves", () => {
    const spec = {
      openapi: "3.1.0",
      info: { title: "Test", version: "1.0" },
      paths: {},
      components: {
        schemas: {
          Inner: { type: "string" },
          Inner1: { type: "string" },
          Outer: {
            type: "object",
            properties: {
              field: { $ref: "#/components/schemas/Inner1" }
            }
          }
        }
      }
    }

    const result = deduplicateOpenApiSchemas(spec) as any

    expect(Object.keys(result.components.schemas)).toStrictEqual(["Inner", "Outer"])
    expect(result.components.schemas.Outer.properties.field).toStrictEqual({
      $ref: "#/components/schemas/Inner"
    })
  })

  it("handles spec without components gracefully", () => {
    const spec = { openapi: "3.1.0", info: { title: "Test", version: "1.0" }, paths: {} }
    expect(deduplicateOpenApiSchemas(spec)).toBe(spec)
  })
})

import { Option, Predicate, Schema, SchemaGetter } from "effect"
import { InvalidStateError, LoginError, NotFoundError, NotLoggedInError, OptimisticConcurrencyException, ServiceUnavailableError, UnauthorizedError, ValidationError } from "effect-app/client/errors"
import * as AppSchema from "effect-app/Schema"
import { Class, TaggedClass } from "effect-app/Schema/Class"
import { flattenNestedAnyOf, flattenSimpleAllOf, specialJsonSchemaDocument } from "effect-app/Schema/SpecialJsonSchema"
import { deduplicateOpenApiSchemas } from "effect-app/Schema/SpecialOpenApi"
import * as S from "effect/Schema"
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

  it("S.is accepts class instances and matching plain objects", () => {
    class A extends Class<A>("A")({ a: S.String }) {}

    expect(S.is(A)(new A({ a: "hello" }))).toBe(true)
    expect(S.is(A)({ a: "world" })).toBe(true)
    expect(S.is(A)({ a: 1 })).toBe(false)
    expect(S.is(A)(null)).toBe(false)
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

  it("exposes fields, identifier", () => {
    class A extends Class<A>("A")({ a: S.String, b: S.Number }) {}

    expect(A.identifier).toBe("A")
    expect(Object.keys(A.fields)).toStrictEqual(["a", "b"])
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

  it("S.decodeSync(S.toType(X)) should report n length schema error", () => {
    class X extends TaggedClass<X>()("X", { n: S.String.pipe(S.check(S.isMinLength(3))) }) {}

    try {
      S.decodeSync(S.toType(X))({ _tag: "X", n: "a" /* not length 3 */ })
      expect.fail("expected decode to fail with a SchemaError")
    } catch (error) {
      expect(error).toBeInstanceOf(Error)
      if (error instanceof Error) {
        expect(error.message).toContain("n")
        expect(error.message.toLowerCase()).toContain("length")
      }
    }
  })

  it("exposes fields, identifier", () => {
    class Circle extends TaggedClass<Circle>()("Circle", { radius: S.Number }) {}

    expect(Circle.identifier).toBe("Circle")
    expect(Object.keys(Circle.fields)).toContain("_tag")
    expect(Object.keys(Circle.fields)).toContain("radius")
  })
})

describe("strict declaration option", () => {
  it("Class strict: true keeps class-level expected errors", () => {
    class X extends Class<X>("X")({ n: S.String.pipe(S.check(S.isMinLength(3))) }, undefined, { strict: true }) {}

    expect(() => S.decodeSync(S.toType(X))({ n: "a" })).toThrow("Expected X")
  })

  it("TaggedClass strict: true keeps class-level expected errors", () => {
    class X extends TaggedClass<X>()("X", { n: S.String.pipe(S.check(S.isMinLength(3))) }, undefined, {
      strict: true
    }) {}

    expect(() => S.decodeSync(S.toType(X))({ _tag: "X", n: "a" })).toThrow("Expected X")
  })

  it("Class with encoded override strict: true keeps class-level expected errors", () => {
    class X extends Class<X, never>("X")({ n: S.String.pipe(S.check(S.isMinLength(3))) }, undefined, {
      strict: true
    }) {}

    expect(() => S.decodeSync(S.toType(X))({ n: "a" })).toThrow("Expected X")
  })

  it("TaggedClass with encoded override strict: true keeps class-level expected errors", () => {
    class X extends TaggedClass<X, never>()("X", { n: S.String.pipe(S.check(S.isMinLength(3))) }, undefined, {
      strict: true
    }) {}

    expect(() => S.decodeSync(S.toType(X))({ _tag: "X", n: "a" })).toThrow("Expected X")
  })
})

describe("Class.copy", () => {
  it("creates a new instance with updated fields", () => {
    class A extends Class<A>("A")({ a: S.String, b: S.Number }) {}

    const instance = new A({ a: "hello", b: 1 })
    const copied: A = A.copy(instance, { b: 2 })
    expect(copied).toBeInstanceOf(A)
    expect(copied.a).toBe("hello")
    expect(copied.b).toBe(2)
  })

  it("accepts a function for updates", () => {
    class A extends Class<A>("A")({ a: S.String, b: S.Number }) {}

    const instance = new A({ a: "hello", b: 1 })
    const copied: A = A.copy(instance, (a) => ({ b: a.b + 1 }))
    expect(copied).toBeInstanceOf(A)
    expect(copied.b).toBe(2)
  })

  it("is pipeable", () => {
    class A extends Class<A>("A")({ a: S.String, b: S.Number }) {}

    const instance = new A({ a: "hello", b: 1 })
    const copied: A = A.copy({ b: 2 })(instance)
    expect(copied).toBeInstanceOf(A)
    expect(copied.b).toBe(2)
  })
})

describe("TaggedClass.copy", () => {
  it("creates a new instance with updated fields", () => {
    class Circle extends TaggedClass<Circle>()("Circle", { radius: S.Number }) {}

    const instance = new Circle({ radius: 5 })
    const copied: Circle = Circle.copy(instance, { radius: 10 })
    expect(copied).toBeInstanceOf(Circle)
    expect(copied._tag).toBe("Circle")
    expect(copied.radius).toBe(10)
  })

  it("accepts a function for updates", () => {
    class Circle extends TaggedClass<Circle>()("Circle", { radius: S.Number }) {}

    const instance = new Circle({ radius: 5 })
    const copied: Circle = Circle.copy(instance, (c) => ({ radius: c.radius * 2 }))
    expect(copied).toBeInstanceOf(Circle)
    expect(copied.radius).toBe(10)
  })
})

describe("Struct.copy", () => {
  it("creates a new value with updated fields", () => {
    const A = AppSchema.Struct({ a: S.String, b: S.Number })

    const instance = A.make({ a: "hello", b: 1 })
    const copied = A.copy(instance, { b: 2 })

    expect(copied).toEqual({ a: "hello", b: 2 })
    expect(copied).not.toBe(instance)
  })

  it("accepts a function for updates", () => {
    const A = AppSchema.Struct({ a: S.String, b: S.Number })

    const instance = A.make({ a: "hello", b: 1 })
    const copied = A.copy(instance, (a) => ({ b: a.b + 1 }))

    expect(copied).toEqual({ a: "hello", b: 2 })
  })
})

describe("TaggedStruct.copy", () => {
  it("creates a new tagged value with updated fields", () => {
    const Circle = AppSchema.TaggedStruct("Circle", { radius: S.Number })

    const instance = Circle.make({ radius: 5 })
    const copied = Circle.copy(instance, { radius: 10 })

    expect(copied).toEqual({ _tag: "Circle", radius: 10 })
    expect(copied).not.toBe(instance)
  })
})

describe("TaggedError", () => {
  it("InvalidStateError toString includes the message", () => {
    const error = new InvalidStateError("something went wrong")
    expect(error.toString()).toContain("something went wrong")
  })

  it("NotFoundError toString includes the message", () => {
    const error = new NotFoundError({ type: "User", id: "123" })
    expect(error.toString()).toContain("Didn't find User")
    expect(error.toString()).toContain("123")
  })

  it("ServiceUnavailableError toString includes the message", () => {
    const error = new ServiceUnavailableError("service down")
    expect(error.toString()).toContain("service down")
  })

  it("ValidationError toString includes the message", () => {
    const error = new ValidationError({ errors: ["field required"] })
    expect(error.toString()).toContain("Validation failed")
    expect(error.toString()).toContain("field required")
  })

  it("NotLoggedInError toString includes the message", () => {
    const error = new NotLoggedInError("not logged in")
    expect(error.toString()).toContain("not logged in")
  })

  it("LoginError toString includes the message", () => {
    const error = new LoginError("login failed")
    expect(error.toString()).toContain("login failed")
  })

  it("UnauthorizedError toString includes the message", () => {
    const error = new UnauthorizedError("forbidden")
    expect(error.toString()).toContain("forbidden")
  })

  it("OptimisticConcurrencyException toString includes the message", () => {
    const error = new OptimisticConcurrencyException({ message: "conflict" })
    expect(error.toString()).toContain("conflict")
  })

  it("OptimisticConcurrencyException from details toString includes the message", () => {
    const error = new OptimisticConcurrencyException({ type: "User", id: "123", code: 409 })
    expect(error.toString()).toContain("Existing User 123 record changed")
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
        }
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
        "required": ["c", "d"]
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
        "required": ["c", "d"]
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
    )
      .toStrictEqual({ $ref: "#/components/schemas/X" })
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
    expect(result).toStrictEqual(spec)
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
    )
      .toStrictEqual({ $ref: "#/components/schemas/Y" })
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
    const result = deduplicateOpenApiSchemas(spec)
    expect(result).toStrictEqual(spec)
  })

  it("flattens allOf in components.schemas", () => {
    const spec = {
      openapi: "3.1.0",
      info: { title: "Test", version: "1.0" },
      paths: {},
      components: {
        schemas: {
          PositiveInt: {
            type: "integer",
            allOf: [{ exclusiveMinimum: 0, title: "PositiveInt" }]
          }
        }
      }
    }

    const result = deduplicateOpenApiSchemas(spec) as any

    expect(result.components.schemas.PositiveInt).toStrictEqual({
      type: "integer",
      exclusiveMinimum: 0,
      title: "PositiveInt"
    })
  })

  it("does not flatten allOf containing $ref entries", () => {
    const spec = {
      openapi: "3.1.0",
      info: { title: "Test", version: "1.0" },
      paths: {},
      components: {
        schemas: {
          Composed: {
            type: "object",
            allOf: [{ $ref: "#/components/schemas/Base" }]
          },
          Base: { type: "object", properties: { id: { type: "string" } } }
        }
      }
    }

    const result = deduplicateOpenApiSchemas(spec) as any

    expect(result.components.schemas.Composed).toStrictEqual({
      type: "object",
      allOf: [{ $ref: "#/components/schemas/Base" }]
    })
  })

  it("does not flatten allOf entries that define their own type", () => {
    const spec = {
      openapi: "3.1.0",
      info: { title: "Test", version: "1.0" },
      paths: {},
      components: {
        schemas: {
          Mixed: {
            type: "object",
            allOf: [{ type: "string", minLength: 1 }]
          }
        }
      }
    }

    const result = deduplicateOpenApiSchemas(spec) as any

    expect(result.components.schemas.Mixed).toStrictEqual({
      type: "object",
      allOf: [{ type: "string", minLength: 1 }]
    })
  })
})

describe("flattenSimpleAllOf", () => {
  it("flattens constraint-only allOf into parent with type", () => {
    const input = {
      type: "integer",
      allOf: [{ exclusiveMinimum: 0, title: "PositiveInt" }]
    }
    expect(flattenSimpleAllOf(input)).toStrictEqual({
      type: "integer",
      exclusiveMinimum: 0,
      title: "PositiveInt"
    })
  })

  it("flattens string type with multiple constraints", () => {
    const input = {
      type: "string",
      allOf: [
        { minLength: 1, maxLength: 255 },
        { title: "NonEmptyString255" }
      ]
    }
    expect(flattenSimpleAllOf(input)).toStrictEqual({
      type: "string",
      minLength: 1,
      maxLength: 255,
      title: "NonEmptyString255"
    })
  })

  it("does not flatten allOf with $ref", () => {
    const input = {
      type: "object",
      allOf: [{ $ref: "#/components/schemas/Base" }]
    }
    expect(flattenSimpleAllOf(input)).toStrictEqual(input)
  })

  it("does not flatten allOf entries with their own type", () => {
    const input = {
      type: "object",
      allOf: [{ type: "string", minLength: 1 }]
    }
    expect(flattenSimpleAllOf(input)).toStrictEqual(input)
  })

  it("allOf entry wins on property conflict", () => {
    const input = {
      type: "integer",
      title: "OldTitle",
      allOf: [{ title: "NewTitle", minimum: 0 }]
    }
    expect(flattenSimpleAllOf(input)).toStrictEqual({
      type: "integer",
      title: "NewTitle",
      minimum: 0
    })
  })
})

describe("Post-processing integration — real Effect Schema types", () => {
  it("PositiveInt — allOf flattened, no wrapping", () => {
    const doc = specialJsonSchemaDocument(AppSchema.PositiveInt)
    expect(doc.definitions["PositiveInt"]).toStrictEqual({
      type: "integer",
      exclusiveMinimum: 0,
      title: "PositiveInt"
    })
  })

  it("NonEmptyString255 — multiple allOf constraints merged", () => {
    const doc = specialJsonSchemaDocument(AppSchema.NonEmptyString255)
    expect(doc.definitions["NonEmptyString255"]).toStrictEqual({
      type: "string",
      minLength: 1,
      maxLength: 255,
      title: "NonEmptyString255"
    })
  })

  it("NullOr(NonEmptyString64k) — null preserved in anyOf, allOf flattened in definition", () => {
    const schema = S.Struct({ note: S.NullOr(AppSchema.NonEmptyString64k) })
    const doc = specialJsonSchemaDocument(schema)

    // null variant preserved (correct JSON Schema for NullOr)
    expect(doc.schema).toStrictEqual({
      type: "object",
      properties: {
        note: {
          anyOf: [
            { $ref: "#/$defs/NonEmptyString64k" },
            { type: "null" }
          ]
        }
      },
      required: ["note"]
    })

    // allOf flattened in the referenced definition
    expect(doc.definitions["NonEmptyString64k"]).toStrictEqual({
      type: "string",
      minLength: 1,
      maxLength: 65536,
      title: "NonEmptyString64k"
    })
  })

  it("NonNegativeInt — allOf flattened", () => {
    const doc = specialJsonSchemaDocument(AppSchema.NonNegativeInt)
    expect(doc.definitions["NonNegativeInt"]).toStrictEqual({
      type: "integer",
      minimum: 0,
      title: "NonNegativeInt"
    })
  })

  it("NullOr union flattens nested anyOf members", () => {
    const A = S.String.annotate({ identifier: "A" })
    const B = S.Boolean.annotate({ identifier: "B" })
    const schema = S.Struct({
      value: S.NullOr(S.Union([A, B]))
    })
    const doc = specialJsonSchemaDocument(schema)
    const valueProp = (doc.schema as Record<string, any>)["properties"]["value"]

    expect(valueProp).toStrictEqual({
      anyOf: [
        { $ref: "#/$defs/A" },
        { $ref: "#/$defs/B" },
        { type: "null" }
      ]
    })
  })
})

describe("flattenNestedAnyOf", () => {
  it("flattens nested anyOf with no sibling keys", () => {
    const input = {
      anyOf: [
        { anyOf: [{ type: "string" }, { type: "number" }] },
        { type: "null" }
      ]
    }
    expect(flattenNestedAnyOf(input)).toStrictEqual({
      anyOf: [
        { type: "string" },
        { type: "number" },
        { type: "null" }
      ]
    })
  })

  it("does not flatten anyOf entry with sibling keys", () => {
    const input = {
      anyOf: [
        { anyOf: [{ type: "string" }], title: "X" },
        { type: "null" }
      ]
    }
    // The inner anyOf is not flattened into the outer (sibling "title" prevents it),
    // but the single-element inner anyOf is unwrapped within the entry itself
    expect(flattenNestedAnyOf(input)).toStrictEqual({
      anyOf: [
        { type: "string", title: "X" },
        { type: "null" }
      ]
    })
  })

  it("unwraps anyOf with single item after flattening", () => {
    const input = {
      anyOf: [
        { anyOf: [{ type: "string" }] }
      ]
    }
    expect(flattenNestedAnyOf(input)).toStrictEqual({ type: "string" })
  })

  it("unwraps anyOf with single item, merging sibling properties", () => {
    const input = {
      title: "MyField",
      anyOf: [{ type: "string" }]
    }
    expect(flattenNestedAnyOf(input)).toStrictEqual({
      title: "MyField",
      type: "string"
    })
  })

  it("recurses into nested objects", () => {
    const input = {
      properties: {
        field: {
          anyOf: [
            { anyOf: [{ $ref: "#/defs/A" }, { $ref: "#/defs/B" }] },
            { type: "null" }
          ]
        }
      }
    }
    expect(flattenNestedAnyOf(input)).toStrictEqual({
      properties: {
        field: {
          anyOf: [
            { $ref: "#/defs/A" },
            { $ref: "#/defs/B" },
            { type: "null" }
          ]
        }
      }
    })
  })

  it("passes through non-objects unchanged", () => {
    expect(flattenNestedAnyOf(null)).toBe(null)
    expect(flattenNestedAnyOf(42)).toBe(42)
    expect(flattenNestedAnyOf("hello")).toBe("hello")
  })
})

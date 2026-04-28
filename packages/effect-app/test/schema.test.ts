// import { generateFromArbitrary } from "@effect-app/infra/test"
import { Array, S } from "effect-app"
import { specialJsonSchemaDocument } from "effect-app/Schema/SpecialJsonSchema"
import { describe, expect, expectTypeOf, test } from "vitest"

const A = S.Struct({ a: S.NonEmptyString255, email: S.NullOr(S.Email) })
test("works", () => {
  console.log(S.StringId.make())
  // console.log(generateFromArbitrary(S.A.make(A)).value)
  console.log(S.AST.resolveTitle(S.Email.ast))
  console.log(S.AST.resolveDescription(S.Email.ast))
  console.log(S.toJsonSchemaDocument(S.Email))
  console.log(S.toJsonSchemaDocument(S.Email))
  console.log(S.decodeExit(A)({ a: Array.range(1, 256).join(""), email: "hello" }))
})

test("literal default works", () => {
  const l = S.Literals(["a", "b"])
  expect(l.Default).toBe("a")
  expectTypeOf(l.Default).toEqualTypeOf<"a">()
  const s = S.Struct({ l: l.withDefault })
  expect(s.make({}).l).toBe("a")

  const l2 = l.changeDefault("b")
  const s2 = S.Struct({ l: l2.withDefault })
  expect(s2.make({}).l).toBe("b")
})

test("NonEmptyString255.Type uses the named brand alias", () => {
  type A = typeof S.NonEmptyString255.Type
  type B = string & S.NonEmptyString255Brand
  expectTypeOf<A>().toEqualTypeOf<B>()
})

test("Opaque accepts an explicit Encoded type", () => {
  interface User {
    readonly id: string
    readonly _tag: "User"
  }

  interface UserEncoded {
    readonly id: string
  }

  const baseSchema = S.Struct({ id: S.String, name: S.String })
  const _UserSchema = S.Opaque<User, UserEncoded>()(baseSchema)

  expectTypeOf<S.Codec.Encoded<typeof _UserSchema>>().toEqualTypeOf<UserEncoded>()
  expectTypeOf<S.Schema.Type<typeof _UserSchema>>().toEqualTypeOf<User>()
  expectTypeOf<S.Codec.Encoded<typeof _UserSchema>>().not.toEqualTypeOf<S.Codec.Encoded<typeof baseSchema>>()
})

test("Opaque with one generic keeps the base encoded shape", () => {
  interface User {
    readonly id: string
  }

  const baseSchema = S.Struct({ id: S.String })
  const _UserSchema = S.Opaque<User>()(baseSchema)

  expectTypeOf<S.Codec.Encoded<typeof _UserSchema>>().toEqualTypeOf<{ readonly id: string }>()
  expectTypeOf<S.Schema.Type<typeof _UserSchema>>().toEqualTypeOf<User>()
})

test("Opaque preserves optional Struct.make input", () => {
  interface User {
    readonly a?: string | undefined
    readonly b?: number | undefined
  }

  const schema = S.Opaque<User>()(S.Struct({
    a: S.optional(S.String),
    b: S.optional(S.Number)
  }))

  const made = schema.make()
  expect(made).toEqual({})
  expectTypeOf(made).toEqualTypeOf<User>()
})

test("Opaque preserves optional TaggedStruct.make input", () => {
  interface OnlyTag {
    readonly _tag: "OnlyTag"
  }

  const schema = S.Opaque<OnlyTag>()(S.TaggedStruct("OnlyTag", {}))

  const made = schema.make()
  expect(made).toEqual({ _tag: "OnlyTag" })
  expectTypeOf(made).toEqualTypeOf<OnlyTag>()
})

test("S.Literals([\"A\", \"B\"]).Default is typed as \"A\"", () => {
  const l = S.Literals(["A", "B"])
  expect(l.Default).toBe("A")
  expectTypeOf(l.Default).toEqualTypeOf<"A">()
})

test("Struct.make accepts void when all fields are optional", () => {
  const schema = S.Struct({
    a: S.optional(S.String),
    b: S.optional(S.Number)
  })

  const made = schema.make()
  expect(made).toEqual({})
  expectTypeOf(made).toEqualTypeOf<{ readonly a?: string | undefined; readonly b?: number | undefined }>()
})

test("TaggedStruct.make accepts void when only constructor-default fields exist", () => {
  const schema = S.TaggedStruct("OnlyTag", {})

  const made = schema.make()
  expect(made).toEqual({ _tag: "OnlyTag" })
  expectTypeOf(made).toEqualTypeOf<{ readonly _tag: "OnlyTag" }>()
})

test("tagged union derives tag map and tags from v4 literal ast", () => {
  const schema = S.TaggedUnion([
    S.TaggedStruct("A", { a: S.String }),
    S.TaggedStruct("B", { b: S.Finite }),
    S.TaggedStruct("C", { c: S.Boolean })
  ])
  const caseA = schema.cases["A"]
  const caseB = schema.cases["B"]
  const caseC = schema.cases["C"]
  const isAOrB = schema.isAnyOf(["A", "B"])

  expect(caseA.fields._tag.ast.literal).toBe("A")
  expect(caseB.fields._tag.ast.literal).toBe("B")
  expect(caseC.fields._tag.ast.literal).toBe("C")
  expect(S.decodeSync(schema.tags)("A")).toBe("A")
  expect(S.decodeSync(schema.tags)("B")).toBe("B")
  expect(S.decodeSync(schema.tags)("C")).toBe("C")
  expect(() => S.decodeUnknownSync(schema.tags)("D")).toThrow()

  expect(schema.guards.A({ _tag: "A", a: "ok" })).toBe(true)
  expect(schema.guards.A({ _tag: "B", b: 1 })).toBe(false)
  expect(schema.guards.B({ _tag: "B", b: 1 })).toBe(true)
  expect(schema.guards.B({ _tag: "A", a: "ok" })).toBe(false)
  expect(schema.guards.C({ _tag: "C", c: true })).toBe(true)
  expect(schema.guards.C({ _tag: "A", a: "ok" })).toBe(false)

  expect(isAOrB({ _tag: "A", a: "ok" })).toBe(true)
  expect(isAOrB({ _tag: "B", b: 1 })).toBe(true)
  expect(isAOrB({ _tag: "C", c: true })).toBe(false)
})

test("TaggedUnion tags returns a Literals schema with correct literal values", () => {
  const schema = S.TaggedUnion([
    S.TaggedStruct("X", { x: S.String }),
    S.TaggedStruct("Y", { y: S.Finite })
  ])

  expect(schema.tags.literals).toEqual(["X", "Y"])
  expectTypeOf(schema.tags.literals).toMatchTypeOf<readonly ["X", "Y"]>()
})

test("TaggedUnion tags.pick returns a subset of the tag literals", () => {
  const schema = S.TaggedUnion([
    S.TaggedStruct("A", { a: S.String }),
    S.TaggedStruct("B", { b: S.Finite }),
    S.TaggedStruct("C", { c: S.Boolean })
  ])

  const subset = schema.tags.pick(["A", "C"])
  expect(subset.literals).toEqual(["A", "C"])
  expect(S.decodeSync(subset)("A")).toBe("A")
  expect(S.decodeSync(subset)("C")).toBe("C")
  expect(() => S.decodeUnknownSync(subset)("B")).toThrow()
})

test("tags standalone function extracts tags from member schemas", () => {
  const members = [
    S.TaggedStruct("Foo", { foo: S.String }),
    S.TaggedStruct("Bar", { bar: S.Finite })
  ] as const

  const tagSchema = S.tags(members)
  expect(tagSchema.literals).toEqual(["Foo", "Bar"])
  expect(S.decodeSync(tagSchema)("Foo")).toBe("Foo")
  expect(S.decodeSync(tagSchema)("Bar")).toBe("Bar")
  expect(() => S.decodeUnknownSync(tagSchema)("Baz")).toThrow()
})

test("ExtendTaggedUnion adds tags to an existing Union", () => {
  const union = S.Union([
    S.TaggedStruct("P", { p: S.String }),
    S.TaggedStruct("Q", { q: S.Finite })
  ])
  const extended = S.ExtendTaggedUnion(union)

  expect(extended.tags.literals).toEqual(["P", "Q"])
  expect(S.decodeSync(extended.tags)("P")).toBe("P")
  expect(S.decodeSync(extended.tags)("Q")).toBe("Q")
  expect(() => S.decodeUnknownSync(extended.tags)("R")).toThrow()
  expect(extended.cases["P"].fields._tag.ast.literal).toBe("P")
  expect(extended.guards.P({ _tag: "P", p: "ok" })).toBe(true)
  expect(extended.guards.P({ _tag: "Q", q: 1 })).toBe(false)
})

test("TaggedUnion match dispatches on _tag", () => {
  const schema = S.TaggedUnion([
    S.TaggedStruct("A", { a: S.String }),
    S.TaggedStruct("B", { b: S.Finite })
  ])
  type T = S.Schema.Type<typeof schema>

  const matcher = schema.match({
    A: (v) => `got A: ${v.a}`,
    B: (v) => `got B: ${v.b}`
  })
  expect(matcher({ _tag: "A", a: "hello" } as T)).toBe("got A: hello")
  expect(matcher({ _tag: "B", b: 42 } as T)).toBe("got B: 42")
})

test("TaggedUnion with single member", () => {
  const schema = S.TaggedUnion([
    S.TaggedStruct("Only", { val: S.String })
  ])

  expect(schema.tags.literals).toEqual(["Only"])
  expect(S.decodeSync(schema.tags)("Only")).toBe("Only")
  expect(() => S.decodeUnknownSync(schema.tags)("Other")).toThrow()
  expect(schema.guards.Only({ _tag: "Only", val: "x" })).toBe(true)
})

test("TaggedUnion tags type is narrowed to the exact tag literals", () => {
  const schema = S.TaggedUnion([
    S.TaggedStruct("Alpha", { a: S.String }),
    S.TaggedStruct("Beta", { b: S.Finite }),
    S.TaggedStruct("Gamma", { c: S.Boolean })
  ])

  type Tags = S.Schema.Type<typeof schema.tags>
  expectTypeOf<Tags>().toEqualTypeOf<"Alpha" | "Beta" | "Gamma">()
})

test("TaggedUnion with encodeKeys renaming a non-tag key", () => {
  const MemberA = S.TaggedStruct("A", { firstName: S.String }).pipe(
    S.encodeKeys({ firstName: "first_name" })
  )
  const MemberB = S.TaggedStruct("B", { lastName: S.Finite }).pipe(
    S.encodeKeys({ lastName: "last_name" })
  )

  const schema = S.TaggedUnion([MemberA, MemberB])

  expect(schema.tags.literals).toEqual(["A", "B"])
  expect(S.decodeSync(schema.tags)("A")).toBe("A")
  expect(S.decodeSync(schema.tags)("B")).toBe("B")

  // decode from encoded (snake_case) to decoded (camelCase)
  const decoded = S.decodeUnknownSync(schema)({ _tag: "A", first_name: "Alice" })
  expect(decoded).toEqual({ _tag: "A", firstName: "Alice" })

  const decoded2 = S.decodeUnknownSync(schema)({ _tag: "B", last_name: 42 })
  expect(decoded2).toEqual({ _tag: "B", lastName: 42 })

  // encode back to snake_case
  type T = S.Schema.Type<typeof schema>
  const encoded = S.encodeSync(schema)({ _tag: "A", firstName: "Alice" } as T)
  expect(encoded).toEqual({ _tag: "A", first_name: "Alice" })

  // guards work on decoded values
  expect(schema.guards.A({ _tag: "A", firstName: "Alice" })).toBe(true)
  expect(schema.guards.A({ _tag: "B", lastName: 42 })).toBe(false)
  expect(schema.guards.B({ _tag: "B", lastName: 42 })).toBe(true)
})

test("TaggedUnion with TaggedClass members", () => {
  class Foo extends S.TaggedClass<Foo>()("Foo", { name: S.String }) {}
  class Bar extends S.TaggedClass<Bar>()("Bar", { count: S.Finite }) {}

  const schema = S.TaggedUnion([Foo, Bar])

  expect(schema.tags.literals).toEqual(["Foo", "Bar"])
  expect(S.decodeSync(schema.tags)("Foo")).toBe("Foo")
  expect(S.decodeSync(schema.tags)("Bar")).toBe("Bar")
  expect(() => S.decodeUnknownSync(schema.tags)("Baz")).toThrow()

  const decoded = S.decodeUnknownSync(schema)({ _tag: "Foo", name: "Alice" })
  expect(decoded).toBeInstanceOf(Foo)
  expect(decoded).toEqual(new Foo({ name: "Alice" }))

  const decoded2 = S.decodeUnknownSync(schema)({ _tag: "Bar", count: 3 })
  expect(decoded2).toBeInstanceOf(Bar)
  expect(decoded2).toEqual(new Bar({ count: 3 }))

  expect(schema.guards.Foo(new Foo({ name: "Alice" }))).toBe(true)
  expect(schema.guards.Foo(new Bar({ count: 3 }))).toBe(false)
  expect(schema.guards.Bar(new Bar({ count: 3 }))).toBe(true)
})

describe("ReadonlySetFromArray", () => {
  test("decodes an array of strings to a Set", () => {
    const schema = S.ReadonlySetFromArray(S.String)
    const decoded = S.decodeUnknownSync(schema)(["a", "b", "c"])
    expect(decoded).toEqual(new Set(["a", "b", "c"]))
  })

  test("encodes a Set back to an array", () => {
    const schema = S.ReadonlySetFromArray(S.String)
    const encoded = S.encodeSync(schema)(new Set(["a", "b"]))
    expect(encoded).toEqual(["a", "b"])
  })

  test("decodes with NumberFromString as value", () => {
    const schema = S.ReadonlySetFromArray(S.NumberFromString)
    const decoded = S.decodeUnknownSync(schema)(["1", "2", "3"])
    expect(decoded).toEqual(new Set([1, 2, 3]))
    expectTypeOf(decoded).toEqualTypeOf<ReadonlySet<number>>()
  })

  test("encodes with NumberFromString as value", () => {
    const schema = S.ReadonlySetFromArray(S.NumberFromString)
    const encoded = S.encodeSync(schema)(new Set([1, 2, 3]))
    expect(encoded).toEqual(["1", "2", "3"])
  })

  test("rejects invalid input", () => {
    const schema = S.ReadonlySetFromArray(S.NumberFromString)
    expect(() => S.decodeUnknownSync(schema)([1, 2])).toThrow()
  })
})

describe("ReadonlyMapFromArray", () => {
  test("decodes an array of tuples to a Map", () => {
    const schema = S.ReadonlyMap({ key: S.String, value: S.Finite })
    const decoded = S.decodeUnknownSync(schema)([["a", 1], ["b", 2]])
    expect(decoded).toEqual(new Map([["a", 1], ["b", 2]]))
  })

  test("encodes a Map back to an array of tuples", () => {
    const schema = S.ReadonlyMapFromArray({ key: S.String, value: S.Finite })
    const encoded = S.encodeSync(schema)(new Map([["a", 1], ["b", 2]]))
    expect(encoded).toEqual([["a", 1], ["b", 2]])
  })

  test("decodes with NumberFromString as key", () => {
    const schema = S.ReadonlyMapFromArray({ key: S.NumberFromString, value: S.String })
    const decoded = S.decodeUnknownSync(schema)([["1", "one"], ["2", "two"]])
    expect(decoded).toEqual(new Map([[1, "one"], [2, "two"]]))
    expectTypeOf(decoded).toEqualTypeOf<ReadonlyMap<number, string>>()
  })

  test("encodes with NumberFromString as key", () => {
    const schema = S.ReadonlyMapFromArray({ key: S.NumberFromString, value: S.String })
    const encoded = S.encodeSync(schema)(new Map([[1, "one"], [2, "two"]]))
    expect(encoded).toEqual([["1", "one"], ["2", "two"]])
  })

  test("decodes with NumberFromString as value", () => {
    const schema = S.ReadonlyMapFromArray({ key: S.String, value: S.NumberFromString })
    const decoded = S.decodeUnknownSync(schema)([["a", "10"], ["b", "20"]])
    expect(decoded).toEqual(new Map([["a", 10], ["b", 20]]))
    expectTypeOf(decoded).toEqualTypeOf<ReadonlyMap<string, number>>()
  })

  test("encodes with NumberFromString as value", () => {
    const schema = S.ReadonlyMapFromArray({ key: S.String, value: S.NumberFromString })
    const encoded = S.encodeSync(schema)(new Map([["a", 10], ["b", 20]]))
    expect(encoded).toEqual([["a", "10"], ["b", "20"]])
  })

  test("decodes with NumberFromString as both key and value", () => {
    const schema = S.ReadonlyMapFromArray({ key: S.NumberFromString, value: S.NumberFromString })
    const decoded = S.decodeUnknownSync(schema)([["1", "10"], ["2", "20"]])
    expect(decoded).toEqual(new Map([[1, 10], [2, 20]]))
    expectTypeOf(decoded).toEqualTypeOf<ReadonlyMap<number, number>>()
  })

  test("rejects invalid input", () => {
    const schema = S.ReadonlyMapFromArray({ key: S.NumberFromString, value: S.String })
    expect(() => S.decodeUnknownSync(schema)([[1, "val"]])).toThrow()
  })
})

describe("ReadonlySet (with withDefault)", () => {
  test("make provides withDefault", () => {
    const schema = S.ReadonlySet(S.NumberFromString)
    const struct = S.Struct({ items: schema.withDefault })
    const made = struct.make({})
    expect(made.items).toEqual(new Set())
  })

  test("decodes array with NumberFromString values", () => {
    const schema = S.ReadonlySet(S.NumberFromString)
    const decoded = S.decodeUnknownSync(schema)(["1", "2"])
    expect(decoded).toEqual(new Set([1, 2]))
  })
})

describe("ReadonlyMap (with withDefault)", () => {
  test("make provides withDefault", () => {
    const schema = S.ReadonlyMap({ key: S.NumberFromString, value: S.String })
    const struct = S.Struct({ items: schema.withDefault })
    const made = struct.make({})
    expect(made.items).toEqual(new Map())
  })

  test("decodes array of tuples with NumberFromString keys", () => {
    const schema = S.ReadonlyMap({ key: S.NumberFromString, value: S.String })
    const decoded = S.decodeUnknownSync(schema)([["1", "one"]])
    expect(decoded).toEqual(new Map([[1, "one"]]))
  })
})

describe("JSON Schema", () => {
  test("Email has format, minLength, maxLength", () => {
    const doc = S.toJsonSchemaDocument(S.Email)
    expect(doc).toStrictEqual({
      dialect: "draft-2020-12",
      schema: { "$ref": "#/$defs/Email" },
      definitions: {
        Email: {
          type: "string",
          title: "Email",
          description: "an email according to RFC 5322",
          format: "email",
          allOf: [
            { minLength: 3 },
            { maxLength: 998 }
          ]
        }
      }
    })
  })

  test("Email specialJsonSchemaDocument flattens allOf", () => {
    const doc = specialJsonSchemaDocument(S.Email)
    expect(doc).toStrictEqual({
      dialect: "draft-2020-12",
      schema: { "$ref": "#/$defs/Email" },
      definitions: {
        Email: {
          type: "string",
          title: "Email",
          description: "an email according to RFC 5322",
          format: "email",
          minLength: 3,
          maxLength: 998
        }
      }
    })
  })

  test("Date has format date-time and description", () => {
    const doc = S.toJsonSchemaDocument(S.Date)
    expect(doc).toStrictEqual({
      dialect: "draft-2020-12",
      schema: { "$ref": "#/$defs/Date" },
      definitions: {
        Date: {
          type: "string",
          description: "a string in ISO 8601 format that will be decoded as a Date",
          format: "date-time"
        }
      }
    })
  })

  test("DateValid has format date-time", () => {
    const doc = S.toJsonSchemaDocument(S.DateValid)
    expect(doc).toStrictEqual({
      dialect: "draft-2020-12",
      schema: { "$ref": "#/$defs/Date" },
      definitions: {
        Date: {
          type: "string",
          description: "a string in ISO 8601 format that will be decoded as a Date",
          format: "date-time"
        }
      }
    })
  })

  test("PhoneNumber has format phone", () => {
    const doc = specialJsonSchemaDocument(S.PhoneNumber)
    expect(doc).toStrictEqual({
      dialect: "draft-2020-12",
      schema: { "$ref": "#/$defs/PhoneNumber" },
      definitions: {
        PhoneNumber: {
          type: "string",
          title: "PhoneNumber",
          description: "a phone number with at least 7 digits",
          format: "phone"
        }
      }
    })
  })

  test("Url has format uri", () => {
    const doc = specialJsonSchemaDocument(S.Url)
    expect(doc).toStrictEqual({
      dialect: "draft-2020-12",
      schema: { "$ref": "#/$defs/Url" },
      definitions: {
        Url: {
          type: "string",
          title: "Url",
          format: "uri"
        }
      }
    })
  })
})

describe("generateGuards", () => {
  const StateSchema = S.TaggedUnion([
    S.TaggedStruct("Active", { since: S.String }),
    S.TaggedStruct("Inactive", { reason: S.String }),
    S.TaggedStruct("Pending", { eta: S.Finite })
  ])

  type State = S.Schema.Type<typeof StateSchema>
  type Entity = { readonly state: State; readonly name: string }

  const { isActive, isAnyOf, isInactive, isPending } = StateSchema.generateGuards("state")

  test("isActive narrows to Active member", () => {
    const entity: Entity = { state: { _tag: "Active", since: "2024-01-01" }, name: "foo" }
    expect(isActive(entity)).toBe(true)
    if (isActive(entity)) {
      expectTypeOf(entity.state).toEqualTypeOf<{ readonly _tag: "Active"; readonly since: string }>()
    }
  })

  test("isActive returns false for non-Active", () => {
    const entity: Entity = { state: { _tag: "Inactive", reason: "expired" }, name: "foo" }
    expect(isActive(entity)).toBe(false)
  })

  test("isInactive narrows to Inactive member", () => {
    const entity: Entity = { state: { _tag: "Inactive", reason: "expired" }, name: "foo" }
    expect(isInactive(entity)).toBe(true)
  })

  test("isPending narrows to Pending member", () => {
    const entity: Entity = { state: { _tag: "Pending", eta: 42 }, name: "foo" }
    expect(isPending(entity)).toBe(true)
  })

  test("isAnyOf narrows to union of specified members", () => {
    const isActiveOrPending = isAnyOf(["Active", "Pending"])
    const active: Entity = { state: { _tag: "Active", since: "2024-01-01" }, name: "foo" }
    const pending: Entity = { state: { _tag: "Pending", eta: 5 }, name: "bar" }
    const inactive: Entity = { state: { _tag: "Inactive", reason: "expired" }, name: "baz" }

    expect(isActiveOrPending(active)).toBe(true)
    expect(isActiveOrPending(pending)).toBe(true)
    expect(isActiveOrPending(inactive)).toBe(false)

    if (isActiveOrPending(active)) {
      expectTypeOf(active.state).toEqualTypeOf<
        { readonly _tag: "Active"; readonly since: string } | { readonly _tag: "Pending"; readonly eta: number }
      >()
    }
  })

  test("guards use schema-based validation (built-in guards)", () => {
    expect(StateSchema.guards.Active({ _tag: "Active" })).toBe(false)
    expect(StateSchema.guards.Active({ _tag: "Active", since: "2024-01-01" })).toBe(true)
  })
})

describe("generateGuardsFor", () => {
  const StateSchema = S.TaggedUnion([
    S.TaggedStruct("Active", { since: S.String }),
    S.TaggedStruct("Inactive", { reason: S.String }),
    S.TaggedStruct("Pending", { eta: S.Finite })
  ])

  type State = S.Schema.Type<typeof StateSchema>
  type Entity = { readonly state: State; readonly name: string }

  const { isActive, isAnyOf } = StateSchema.generateGuardsFor<Entity>()("state")

  test("isActive narrows to Active member", () => {
    const entity: Entity = { state: { _tag: "Active", since: "2024-01-01" }, name: "foo" }
    expect(isActive(entity)).toBe(true)
    if (isActive(entity)) {
      expectTypeOf(entity.state).toEqualTypeOf<{ readonly _tag: "Active"; readonly since: string }>()
    }
  })

  test("isActive returns false for non-Active", () => {
    const entity: Entity = { state: { _tag: "Inactive", reason: "expired" }, name: "foo" }
    expect(isActive(entity)).toBe(false)
  })

  test("isAnyOf narrows to union of specified members", () => {
    const isActiveOrPending = isAnyOf(["Active", "Pending"])
    const active: Entity = { state: { _tag: "Active", since: "2024-01-01" }, name: "foo" }
    const inactive: Entity = { state: { _tag: "Inactive", reason: "expired" }, name: "baz" }

    expect(isActiveOrPending(active)).toBe(true)
    expect(isActiveOrPending(inactive)).toBe(false)
  })

  test("ExtendTaggedUnion also exposes generateGuardsFor", () => {
    const union = S.Union([
      S.TaggedStruct("X", { x: S.String }),
      S.TaggedStruct("Y", { y: S.Finite })
    ])
    const extended = S.ExtendTaggedUnion(union)
    type Obj = { readonly field: S.Schema.Type<typeof extended> }
    const { isX, isY } = extended.generateGuardsFor<Obj>()("field")

    expect(isX({ field: { _tag: "X", x: "hi" } })).toBe(true)
    expect(isX({ field: { _tag: "Y", y: 1 } })).toBe(false)
    expect(isY({ field: { _tag: "Y", y: 1 } })).toBe(true)
  })
})

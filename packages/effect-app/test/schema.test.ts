// import { generateFromArbitrary } from "@effect-app/infra/test"
import { Array, S } from "effect-app"
import { expect, expectTypeOf, test } from "vitest"

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
  const l = S.Literal("a", "b")
  expect(l.Default).toBe("a")
  const s = S.Struct({ l: l.withDefault })
  expect(s.makeUnsafe({}).l).toBe("a")

  const l2 = l.changeDefault("b")
  const s2 = S.Struct({ l: l2.withDefault })
  expect(s2.makeUnsafe({}).l).toBe("b")
})

test("tagged union derives tag map and tags from v4 literal ast", () => {
  const schema = S.TaggedUnion(
    S.TaggedStruct("A", { a: S.String }),
    S.TaggedStruct("B", { b: S.Number }),
    S.TaggedStruct("C", { c: S.Boolean })
  )
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
  const schema = S.TaggedUnion(
    S.TaggedStruct("X", { x: S.String }),
    S.TaggedStruct("Y", { y: S.Number })
  )

  expect(schema.tags.literals).toEqual(["X", "Y"])
  expectTypeOf(schema.tags.literals).toMatchTypeOf<readonly ["X", "Y"]>()
})

test("TaggedUnion tags.pick returns a subset of the tag literals", () => {
  const schema = S.TaggedUnion(
    S.TaggedStruct("A", { a: S.String }),
    S.TaggedStruct("B", { b: S.Number }),
    S.TaggedStruct("C", { c: S.Boolean })
  )

  const subset = schema.tags.pick(["A", "C"])
  expect(subset.literals).toEqual(["A", "C"])
  expect(S.decodeSync(subset)("A")).toBe("A")
  expect(S.decodeSync(subset)("C")).toBe("C")
  expect(() => S.decodeUnknownSync(subset)("B")).toThrow()
})

test("tags standalone function extracts tags from member schemas", () => {
  const members = [
    S.TaggedStruct("Foo", { foo: S.String }),
    S.TaggedStruct("Bar", { bar: S.Number })
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
    S.TaggedStruct("Q", { q: S.Number })
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
  const schema = S.TaggedUnion(
    S.TaggedStruct("A", { a: S.String }),
    S.TaggedStruct("B", { b: S.Number })
  )
  type T = S.Schema.Type<typeof schema>

  const matcher = schema.match({
    A: (v) => `got A: ${v.a}`,
    B: (v) => `got B: ${v.b}`
  })
  expect(matcher({ _tag: "A", a: "hello" } as T)).toBe("got A: hello")
  expect(matcher({ _tag: "B", b: 42 } as T)).toBe("got B: 42")
})

test("TaggedUnion with single member", () => {
  const schema = S.TaggedUnion(
    S.TaggedStruct("Only", { val: S.String })
  )

  expect(schema.tags.literals).toEqual(["Only"])
  expect(S.decodeSync(schema.tags)("Only")).toBe("Only")
  expect(() => S.decodeUnknownSync(schema.tags)("Other")).toThrow()
  expect(schema.guards.Only({ _tag: "Only", val: "x" })).toBe(true)
})

test("TaggedUnion tags type is narrowed to the exact tag literals", () => {
  const schema = S.TaggedUnion(
    S.TaggedStruct("Alpha", { a: S.String }),
    S.TaggedStruct("Beta", { b: S.Number }),
    S.TaggedStruct("Gamma", { c: S.Boolean })
  )

  type Tags = S.Schema.Type<typeof schema.tags>
  expectTypeOf<Tags>().toEqualTypeOf<"Alpha" | "Beta" | "Gamma">()
})

test("TaggedUnion with encodeKeys renaming a non-tag key", () => {
  const MemberA = S.TaggedStruct("A", { firstName: S.String }).pipe(
    S.encodeKeys({ firstName: "first_name" })
  )
  const MemberB = S.TaggedStruct("B", { lastName: S.Number }).pipe(
    S.encodeKeys({ lastName: "last_name" })
  )

  const schema = S.TaggedUnion(MemberA, MemberB)

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
  class Bar extends S.TaggedClass<Bar>()("Bar", { count: S.Number }) {}

  const schema = S.TaggedUnion(Foo, Bar)

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

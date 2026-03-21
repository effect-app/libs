// import { generateFromArbitrary } from "@effect-app/infra/test"
import { Array, S } from "effect-app"
import { expect, test } from "vitest"

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
    S.TaggedStruct("B", { b: S.Number })
  )
  const caseA = schema.tagMap["A"]
  const caseB = schema.tagMap["B"]

  expect(caseA.fields._tag.ast.literal).toBe("A")
  expect(caseB.fields._tag.ast.literal).toBe("B")
  expect(S.decodeSync(schema.tags)("A")).toBe("A")
  expect(S.decodeSync(schema.tags)("B")).toBe("B")
  expect(() => S.decodeUnknownSync(schema.tags)("C")).toThrow()
})

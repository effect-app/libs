// import { generateFromArbitrary } from "@effect-app/infra/test"
import { Array, S } from "effect-app"
import { test } from "vitest"

const A = S.Struct({ a: S.NonEmptyString255, email: S.NullOr(S.Email) })
test("works", () => {
  console.log(S.StringId.make())
  // console.log(generateFromArbitrary(S.A.make(A)).value)
  console.log(S.AST.resolveTitle(S.Email.ast))
  console.log(S.AST.resolveDescription(S.Email.ast))
  // TODO: getJSONSchemaAnnotation removed in v4 - use S.toJsonSchemaDocument instead
  console.log(S.toJsonSchemaDocument(S.Email))
  console.log(S.decodeExit(A as any)(({ a: Array.range(1, 256).join(""), email: "hello" })))
})

test("literal default works", () => {
  const l = S.Literal("a", "b")
  expect(l.Default).toBe("a")
  const s = S.Struct({ l: l.withDefault })
  expect((s as any).make().l).toBe("a")

  const l2 = l.changeDefault("b")
  const s2 = S.Struct({ l: l2.withDefault })
  expect((s2 as any).make().l).toBe("b")
})

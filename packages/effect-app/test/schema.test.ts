// import { generateFromArbitrary } from "@effect-app/infra/test"
import { Array, JSONSchema, S } from "effect-app"
import { test } from "vitest"

const A = S.Struct({ a: S.NonEmptyString255, email: S.NullOr(S.Email) })
test("works", () => {
  console.log(S.StringId.make())
  // console.log(generateFromArbitrary(S.A.make(A)).value)
  console.log(S.AST.getTitleAnnotation(S.Email.ast))
  console.log(S.AST.getDescriptionAnnotation(S.Email.ast))
  console.log(S.AST.getJSONSchemaAnnotation(S.Email.ast))
  console.log(JSONSchema.make(S.Email))
  console.log(S.decodeEither(A, { errors: "all" })({ a: Array.range(1, 256).join(""), email: "hello" }))
})

test("literal default works", () => {
  const l = S.Literal("a", "b")
  expect(l.Default).toBe("a")
  const s = S.Struct({ l: l.withDefault })
  expect(s.make().l).toBe("a")

  const l2 = l.changeDefault("b")
  const s2 = S.Struct({ l: l2.withDefault })
  expect(s2.make().l).toBe("b")
})

/* eslint-disable @typescript-eslint/no-explicit-any */
import { S } from "effect-app"
import { makeQueryKey } from "../src/lib.js"
import { Something, SomethingElse, SomethingElseReq, SomethingReq, useClient, useExperimental } from "./stubs.js"

it("TaggedRequestFor .moduleName and request .id / .moduleName", () => {
  expectTypeOf(SomethingReq.moduleName).toEqualTypeOf<"Something">()
  expectTypeOf(SomethingElseReq.moduleName).toEqualTypeOf<"SomethingElse">()

  expectTypeOf(Something.GetSomething2.moduleName).toEqualTypeOf<"Something">()
  expectTypeOf(Something.GetSomething2.id).toEqualTypeOf<"Something.GetSomething2">()
  expectTypeOf(Something.GetSomething2.type).toEqualTypeOf<"query">()
  expectTypeOf(Something.DoSomething.type).toEqualTypeOf<"command">()

  expectTypeOf(SomethingElse.GetSomething2.moduleName).toEqualTypeOf<"SomethingElse">()
  expectTypeOf(SomethingElse.GetSomething2.id).toEqualTypeOf<"SomethingElse.GetSomething2">()
})

it.skip("query type tests", () => {
  const { clientFor } = useClient()
  const client = clientFor(Something, () => ({
    GetSomething2WithDependencies: (queryKey) => [
      { filters: { queryKey } },
      {
        filters: {
          queryKey: makeQueryKey(
            SomethingElse
              .GetSomething2
          )
        }
      }
    ]
  }))

  const q = client.GetSomething2.query

  const [, z] = q({ id: "a" })
  const valz = z.value
  expectTypeOf(valz).toEqualTypeOf<number | undefined>()

  const [, a] = q({ id: "a" }, { placeholderData: () => 123 })
  const val1 = a.value
  expectTypeOf(val1).toEqualTypeOf<number>()

  const [, bbbb] = q({ id: "a" }, { select: (data) => data.toString() })
  const val = bbbb.value
  expectTypeOf(val).toEqualTypeOf<string | undefined>()

  const [, ccc] = q({ id: "a" }, { placeholderData: () => 123, select: (data) => data.toString() })
  const val2 = ccc.value
  expectTypeOf(val2).toEqualTypeOf<string>()

  const [, ddd] = q({ id: "a" }, { initialData: 123, select: (data) => data.toString() })
  const val3 = ddd.value
  expectTypeOf(val3).toEqualTypeOf<string>()

  const [, eee] = q({ id: "a" }, { initialData: 123, placeholderData: () => 123, select: (data) => data.toString() })
  const val4 = eee.value
  expectTypeOf(val4).toEqualTypeOf<string>()
})

it.skip("works", () => {
  const { clientFor } = useClient()
  const client = clientFor(Something)
  const Command = useExperimental()

  // just for jsdoc / type testing.
  const a0 = client.GetSomething2.request(null as any)
  const a00 = client.DoSomething.mutate(null as any)
  const a = client.GetSomething2.suspense(null as any)
  const b = client.GetSomething2.query(null as any)

  // @ts-expect-error query requests no longer expose command helpers
  const e = client.GetSomething2.wrap(null as any)
  // @ts-expect-error query requests no longer expose command helpers
  const f = client.GetSomething2.fn(null as any)

  // @ts-expect-error query requests no longer expose command helpers
  const e0 = client.GetSomething2WithDependencies.wrap
  // @ts-expect-error query request does not match Command.wrap mutation signature
  const e000 = Command.wrap(client.GetSomething2WithDependencies)
  const e00 = client.GetSomething2WithDependencies.request(null as any)
  // @ts-expect-error dependencies required that are not provided
  const e1 = client.GetSomething2WithDependencies.suspense(null as any)
  // @ts-expect-error dependencies required that are not provided
  const e2 = client.GetSomething2WithDependencies.query(null as any)
  // @ts-expect-error query requests no longer expose command helpers
  const f0 = client.GetSomething2WithDependencies.fn(null as any)

  const g0 = client.DoSomething.wrap(null as any)
  const g = client.DoSomething.mutate.wrap(null as any)
  const g1 = client.DoSomething.mutate.project(S.String)
  const g2 = g1(null as any)
  const g3 = g1.wrap(null as any)
  const g4 = client.helpers.doSomethingMutation.project(S.String)
  const g5 = g4(null as any)
  const g6 = g4.wrap(null as any)
  // @ts-expect-error mutate no longer exposes fn, use client.DoSomething.fn
  const h = client.DoSomething.mutate.fn(null as any)

  // projection
  // GetSomething2 uses FiniteFromString, that means Codec is String -> Number
  // when we project that to S.String, it should work as the encoded shapes are identical
  // aka, when we project, we skip decoding with the original codec, and instead use the provided one
  // we have to make sure the Encoded shape of the provided projection schema matches the Encoded Shape of the original codec.
  const projected = client.GetSomething2.project(S.String)
  const p0 = projected.request(null as any)
  // and we have to make sure that for query or suspense the R of the projection schema is not more than what the client was built with, otherwise they should have the MissingDependencies like in the other test cases
  const p00 = projected.query(null as any)
  const p = projected.suspense(null as any)

  expect(true).toBe(true)
  console.log({
    a,
    a0,
    a00,
    b,
    e,
    e0,
    e00,
    e000,
    e1,
    e2,
    f,
    f0,
    g0,
    g,
    g1,
    g2,
    g3,
    g4,
    g5,
    g6,
    h,
    p0,
    p00,
    p
  })
})

/* eslint-disable @typescript-eslint/no-explicit-any */
import { type Effect } from "effect-app"
import { makeQueryKey } from "../src/lib.js"
import { Something, SomethingElse, SomethingElseReq, SomethingReq, useClient, useExperimental } from "./stubs.js"

it("TaggedRequestFor .moduleName and request .id / .moduleName", () => {
  expectTypeOf(SomethingReq.moduleName).toEqualTypeOf<"Something">()
  expectTypeOf(SomethingElseReq.moduleName).toEqualTypeOf<"SomethingElse">()

  expectTypeOf(Something.GetSomething2.moduleName).toEqualTypeOf<"Something">()
  expectTypeOf(Something.GetSomething2.id).toEqualTypeOf<"Something.GetSomething2">()

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
  const a0 = client.GetSomething2.fetch(null as any)
  const a00 = client.GetSomething2.mutate(null as any)
  const a = client.GetSomething2.suspense(null as any)
  const b = client.GetSomething2.query(null as any)

  const e = client.GetSomething2.wrap(null as any)
  const f = client.GetSomething2.fn(null as any)

  // @ts-expect-error dependencies required that are not provided
  const e0 = client.GetSomething2WithDependencies.wrap().handle // not available as we require dependencies not provided by the runtime
  // @ts-expect-error dependencies required that are not provided
  const e000 = Command.wrap(client.GetSomething2WithDependencies)().handle // not available as we require dependencies not provided by the runtime
  const e00 = client.GetSomething2WithDependencies.wrap((_) => _ as Effect.Effect<number, never, never>).handle(
    null as any
  )
  const e0000 =
    Command.wrap(client.GetSomething2WithDependencies)((_) => _ as Effect.Effect<number, never, never>).handle
  // @ts-expect-error dependencies required that are not provided
  const e1 = client.GetSomething2WithDependencies.suspense(null as any)
  // @ts-expect-error dependencies required that are not provided
  const e2 = client.GetSomething2WithDependencies.query(null as any)
  const f0 = client.GetSomething2WithDependencies.fn(null as any)

  const g = client.GetSomething2.mutate.wrap(null as any)
  // @ts-expect-error mutate no longer exposes fn, use client.GetSomething2.fn
  const h = client.GetSomething2.mutate.fn(null as any)

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
    e0000,
    e1,
    e2,
    f,
    f0,
    g,
    h
  })
})

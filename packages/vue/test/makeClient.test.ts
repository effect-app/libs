/* eslint-disable @typescript-eslint/no-explicit-any */
import { type Effect } from "effect-app"
import { Something, useClient, useExperimental } from "./stubs.js"

it.skip("works2", () => {
  const { legacy } = useClient()
  const n = legacy.useQuery({
    Request: null as any,
    handler: null as any as (a: string) => Effect.Effect<number>,
    id: "id"
  })

  const [, z] = n("a")
  const valz = z.value
  expectTypeOf(valz).toEqualTypeOf<number | undefined>()

  const [, a] = n("a", { placeholderData: () => 123 })
  const val1 = a.value
  expectTypeOf(val1).toEqualTypeOf<number>()

  const [, bbbb] = n("a", { select: (data) => data.toString() })
  const val = bbbb.value
  expectTypeOf(val).toEqualTypeOf<string | undefined>()

  const [, ccc] = n("a", { placeholderData: () => 123, select: (data) => data.toString() })
  const val2 = ccc.value
  expectTypeOf(val2).toEqualTypeOf<string>()

  const [, ddd] = n("a", { initialData: 123, select: (data) => data.toString() })
  const val3 = ddd.value
  expectTypeOf(val3).toEqualTypeOf<string>()

  const [, eee] = n("a", { initialData: 123, placeholderData: () => 123, select: (data) => data.toString() })
  const val4 = eee.value
  expectTypeOf(val4).toEqualTypeOf<string>()
})

it.skip("works", () => {
  const { clientFor, legacy } = useClient()
  const client = clientFor(Something)
  const Command = useExperimental()

  // just for jsdoc / type testing.
  const a0 = client.GetSomething2(null as any)
  const a00 = client.GetSomething2.mutate(null as any)
  const a = client.GetSomething2.suspense(null as any)
  const b = client.GetSomething2.query(null as any)

  const c0 = legacy.useSafeMutation(null as any)
  const c = legacy.useQuery(null as any)
  const d = legacy.useSuspenseQuery(null as any)

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
  const h = client.GetSomething2.mutate.fn(null as any)

  expect(true).toBe(true)
  console.log({
    a,
    a0,
    a00,
    c0,
    b,
    c,
    d,
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

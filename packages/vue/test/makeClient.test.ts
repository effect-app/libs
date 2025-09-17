/* eslint-disable @typescript-eslint/no-explicit-any */
import { Something, useClient } from "./stubs.js"

it.skip("works", () => {
  const { clientFor, legacy } = useClient()
  const client = clientFor(Something)

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
    f,
    g,
    h
  })
})

import { describe, expect, it } from "@effect/vitest"
import { type ContainerDb, createContainerIfNotExists } from "../src/cosmos-client.js"

const body = { id: "prefix-Orders", partitionKey: { paths: ["/_partitionKey"], version: 2 } }

const fakeDb = (opts: { readonly read: () => Promise<unknown>; readonly sharedOffer: boolean }) => {
  const calls = { created: [] as Array<unknown>, offerReads: 0 }
  const db: ContainerDb = {
    container: () => ({ read: opts.read }),
    containers: {
      createIfNotExists: (req) => {
        calls.created.push(req)
        return Promise.resolve({})
      }
    },
    readOffer: () => {
      calls.offerReads++
      return Promise.resolve({ resource: opts.sharedOffer ? { id: "offer" } : undefined })
    }
  }
  return { calls, db }
}

const existing = () => Promise.resolve({})
const missing = () => Promise.reject({ code: 404 })

describe("createContainerIfNotExists", () => {
  it("keeps the Cosmos default when no autoscale max is configured", async () => {
    const { calls, db } = fakeDb({ read: missing, sharedOffer: false })
    await createContainerIfNotExists(db, body)
    expect(calls.created).toEqual([body])
    expect(calls.offerReads).toBe(0)
  })

  it("creates a missing container with autoscale in a database without shared throughput", async () => {
    const { calls, db } = fakeDb({ read: missing, sharedOffer: false })
    await createContainerIfNotExists(db, body, { autoscaleMaxThroughput: 1000 })
    expect(calls.created).toEqual([{ ...body, maxThroughput: 1000 }])
  })

  it("lets a missing container share the database throughput when the database has an offer", async () => {
    const { calls, db } = fakeDb({ read: missing, sharedOffer: true })
    await createContainerIfNotExists(db, body, { autoscaleMaxThroughput: 1000 })
    expect(calls.created).toEqual([body])
  })

  it("leaves existing containers untouched", async () => {
    const { calls, db } = fakeDb({ read: existing, sharedOffer: false })
    await createContainerIfNotExists(db, body, { autoscaleMaxThroughput: 1000 })
    expect(calls.created).toEqual([])
    expect(calls.offerReads).toBe(0)
  })

  it("propagates container read errors other than not found", async () => {
    const { calls, db } = fakeDb({ read: () => Promise.reject({ code: 403 }), sharedOffer: false })
    await expect(createContainerIfNotExists(db, body, { autoscaleMaxThroughput: 1000 })).rejects.toEqual({
      code: 403
    })
    expect(calls.created).toEqual([])
  })
})

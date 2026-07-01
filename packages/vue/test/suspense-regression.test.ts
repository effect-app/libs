/* eslint-disable @typescript-eslint/no-explicit-any */
import { defaultRegistry, registryKey } from "@effect/atom-vue"
import * as Effect from "effect-app/Effect"
import * as Option from "effect-app/Option"
import * as Layer from "effect/Layer"
import { createApp, nextTick } from "vue"
import { buildQueryFamily, makeAtomClientRuntime, withQueryOptions } from "../src/atomQuery.js"
import { useAtomQuery } from "../src/query.js"

const fakeHandler = (id: string, run: (input: any) => Effect.Effect<any, any, never>) => ({ id, handler: run }) as any

it("atom engine structurally shares Effect-Equal leaves by default", async () => {
  defaultRegistry.reset()
  let calls = 0
  const handler = fakeHandler(
    "Test/StructuralSharing",
    () =>
      Effect.sync(() => {
        calls += 1
        return {
          stable: {
            date: new Date("2026-01-01T00:00:00.000Z"),
            option: Option.some({ id: "same" })
          },
          revision: calls
        }
      })
  )
  const rt = makeAtomClientRuntime(() => Layer.empty, Layer.makeMemoMapUnsafe())
  const family = buildQueryFamily(rt, handler)
  const atom = withQueryOptions(family(undefined))
  let view!: ReturnType<typeof useAtomQuery<any, any>>
  const host = document.createElement("div")
  const app = createApp({
    setup() {
      view = useAtomQuery(() => atom)
      return () => null
    }
  })
  app.provide(registryKey, defaultRegistry)
  app.mount(host)

  try {
    const first = await Effect.runPromise(view.awaitResult())
    const second = await Effect.runPromise(view.refetch())

    expect(second.revision).toBe(2)
    expect(second).not.toBe(first)
    expect(second.stable).toBe(first.stable)
    expect(second.stable.date).toBe(first.stable.date)
    expect(second.stable.option).toBe(first.stable.option)
  } finally {
    app.unmount()
    await nextTick()
    defaultRegistry.reset()
  }
})

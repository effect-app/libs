import { defaultRegistry, registryKey } from "@effect/atom-vue"
import { DataDependencies, makeQueryKey } from "effect-app/client"
import * as Context from "effect-app/Context"
import * as Effect from "effect-app/Effect"
import * as Option from "effect-app/Option"
import * as Latch from "effect/Latch"
import * as Layer from "effect/Layer"
import * as ManagedRuntime from "effect/ManagedRuntime"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import * as Reactivity from "effect/unstable/reactivity/Reactivity"
import { describe, expect, it } from "vitest"
import { createApp, nextTick } from "vue"
import { buildQueryFamily, invalidateAndAwait, makeAtomClientRuntime, withQueryOptions } from "../src/atomQuery.js"
import { useAtomSuspense } from "../src/query.js"

const tick = () => new Promise((resolve) => setTimeout(resolve, 0))
const ticks = async (n: number) => {
  for (let i = 0; i < n; i++) {
    await nextTick()
    await tick()
  }
}

const makeEnv = () => {
  const mrt = ManagedRuntime.make(Reactivity.layer)
  const baseContext = mrt.runSync(Effect.context<Reactivity.Reactivity>())
  const reactivity = Context.get(baseContext, Reactivity.Reactivity)
  const rt = makeAtomClientRuntime(
    () => Layer.succeedContext(baseContext) as Layer.Layer<any, never, never>,
    mrt.memoMap
  )
  return {
    rt,
    invalidate: (keys: ReadonlyArray<ReadonlyArray<unknown>>) =>
      invalidateAndAwait(keys).pipe(Effect.provideService(Reactivity.Reactivity, reactivity))
  }
}

const makeCounted = (id: string, repo: DataDependencies.DataDependency) => {
  let starts = 0
  const self = {
    id,
    handler: () =>
      Effect.gen(function*() {
        yield* DataDependencies.read(repo)
        return ++starts
      })
  }
  return { self, starts: () => starts }
}

const served = (atom: any): number | undefined => Option.getOrUndefined(AsyncResult.value(defaultRegistry.get(atom)))

const queryAtom = (rt: any, self: any) =>
  withQueryOptions(buildQueryFamily(rt, self)(undefined), { gcTime: "infinity", revalidateOnFocus: false })

const mountSuspense = (atom: any) => {
  let promise: Promise<any> | undefined
  const host = document.createElement("div")
  const app = createApp({
    setup() {
      promise = useAtomSuspense(() => atom)
      return () => null
    }
  })
  app.provide(registryKey, defaultRegistry)
  app.mount(host)
  return { app, getPromise: () => promise }
}

const settle = (p: Promise<any> | undefined) =>
  Promise.race([
    Promise.resolve(p).then(() => "resolved" as const, () => "rejected" as const),
    new Promise<"pending">((resolve) => setTimeout(() => resolve("pending"), 40))
  ])

const fullKeyOf = (self: { id: string }) => [...makeQueryKey(self), undefined]

describe("inactive invalidation (refetchType: active)", () => {
  it("does not refetch an unmounted query; remount does", async () => {
    defaultRegistry.reset()
    const { rt, invalidate } = makeEnv()
    const repo = DataDependencies.repo("IdleRepo")
    const g = makeCounted("Idle.List", repo)
    const atom = queryAtom(rt, g.self)

    const m1 = mountSuspense(atom)
    await settle(m1.getPromise())
    await ticks(2)
    expect(served(atom)).toBe(1)

    m1.app.unmount()
    await ticks(2)

    await Effect.runPromise(invalidate([fullKeyOf(g.self)]))
    await ticks(2)
    expect(g.starts()).toBe(1)

    const m2 = mountSuspense(atom)
    await settle(m2.getPromise())
    await ticks(2)
    expect(g.starts()).toBeGreaterThanOrEqual(2)
    expect(served(atom)).not.toBe(1)
    m2.app.unmount()
    defaultRegistry.reset()
  })

  it("still refetches a mounted query immediately", async () => {
    defaultRegistry.reset()
    const { rt, invalidate } = makeEnv()
    const repo = DataDependencies.repo("ActiveRepo")
    const g = makeCounted("Active.List", repo)
    const atom = queryAtom(rt, g.self)

    const mounted = mountSuspense(atom)
    await settle(mounted.getPromise())
    await ticks(2)
    expect(g.starts()).toBe(1)

    await Effect.runPromise(invalidate([fullKeyOf(g.self)]))
    await ticks(2)
    expect(g.starts()).toBeGreaterThanOrEqual(2)
    mounted.app.unmount()
    defaultRegistry.reset()
  })

  it("waits for a mounted refetch to finish before invalidateAndAwait resolves", async () => {
    defaultRegistry.reset()
    const { rt, invalidate } = makeEnv()
    const repo = DataDependencies.repo("AwaitRepo")
    let starts = 0
    let completes = 0
    const latches: Array<Latch.Latch> = []
    const self = {
      id: "Await.List",
      handler: () =>
        Effect.gen(function*() {
          yield* DataDependencies.read(repo)
          const n = ++starts
          if (n > 1) {
            const latch = Latch.makeUnsafe(false)
            latches.push(latch)
            yield* latch.await
          }
          completes++
          return n
        })
    }
    const atom = queryAtom(rt, self)

    const mounted = mountSuspense(atom)
    await settle(mounted.getPromise())
    await ticks(2)
    expect(completes).toBe(1)

    let settled = false
    const waiting = Effect.runPromise(invalidate([fullKeyOf(self)])).then(() => {
      settled = true
    })
    await ticks(4)
    expect(starts).toBeGreaterThanOrEqual(2)
    expect(settled, "must not resolve while the mounted refetch is in flight").toBe(false)

    latches.splice(0).forEach((latch) => latch.openUnsafe())
    await waiting
    expect(settled).toBe(true)
    expect(completes).toBeGreaterThanOrEqual(2)
    mounted.app.unmount()
    defaultRegistry.reset()
  })
})

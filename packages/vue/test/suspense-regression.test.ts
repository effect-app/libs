/* eslint-disable @typescript-eslint/no-explicit-any */
import { defaultRegistry, registryKey } from "@effect/atom-vue"
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query"
import * as Context from "effect-app/Context"
import * as Effect from "effect-app/Effect"
import * as Option from "effect-app/Option"
import * as Layer from "effect/Layer"
import * as ManagedRuntime from "effect/ManagedRuntime"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import { createApp, effectScope, nextTick, ref } from "vue"
import { makeAtomClientRuntime } from "../src/atomQuery.js"
import { makeTanstackQuery } from "../src/internal/tanstackQuery.js"
import { QueryImpl } from "../src/makeClient.js"

const fakeHandler = (id: string, run: (input: any) => Effect.Effect<any, any, never>) => ({ id, handler: run }) as any

function makeContext(queryClient: QueryClient) {
  const app = createApp({ render: () => null })
  app.use(VueQueryPlugin, { queryClient })
  const scope = effectScope(true)
  const run = <T>(fn: () => T): T => {
    let out!: T
    app.runWithContext(() => {
      scope.run(() => {
        out = fn()
      })
    })
    return out
  }
  return { run, dispose: () => scope.stop() }
}

it("makeClient .suspense(): observer re-pointed mid-flight -> resolves (seeded) instead of dying", async () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity, staleTime: 0 } }
  })
  const getRuntime = () => Context.empty()
  const qi = new QueryImpl(
    getRuntime,
    (() => {
      throw new Error("atom runtime is unused by this legacy TanStack regression")
    }) as any,
    makeTanstackQuery(getRuntime, queryClient)
  )

  // key "a" resolves via this deferred; any other key hangs forever.
  let resolveA!: (v: string) => void
  const aData = new Promise<string>((res) => {
    resolveA = res
  })
  const handler = fakeHandler(
    "Test/KeyRace",
    (input: any) => Effect.promise(() => (input.id === "a" ? aData : new Promise<string>(() => {})))
  )

  const ctx = makeContext(queryClient)

  // Keep-alive observer pins key "a" so flipping the suspense arg below does NOT cancel "a".
  ctx.run(() => qi.useQuery(handler)(ref({ id: "a" }) as any, {} as any))
  await nextTick()

  // Suspense on key "a" (shares the in-flight "a" query -> no extra handler call).
  const suspenseId = ref<{ id: string }>({ id: "a" })
  const suspense = qi.useSuspenseQuery(handler)
  const promise = ctx.run(() => suspense(suspenseId as any, {} as any))

  // Re-point the suspense observer to "b" (pending). "a" still has the keep-alive observer.
  suspenseId.value = { id: "b" }
  await nextTick()
  await nextTick()

  // Resolve "a": suspense() resolves with DATA_A while resultRef is parked on the pending "b".
  resolveA("DATA_A")

  // BEFORE fix: rejects (die). AFTER fix: resolves, seeded from the suspense value.
  const [resultRef, latestRef] = (await promise) as any

  expect(AsyncResult.isSuccess(resultRef.value)).toBe(true)
  expect(Option.getOrUndefined(AsyncResult.value(resultRef.value))).toBe("DATA_A")
  expect(latestRef.value).toBe("DATA_A")

  ctx.dispose()
})

// Prod crash (Sentry "Internal Error: suspense resolved without a latest value"): a reactive arg
// re-points the suspense view at a DIFFERENT family atom. The new atom starts Initial (no
// previousSuccess carried over), so the always-defined `latest` computed found undefined and threw
// during the next render flush. The suspense contract is kept by serving the last defined value
// while the new atom fetches.
it("atom engine .suspense(): reactive arg switched to an uncached input serves the previous value", async () => {
  defaultRegistry.reset()
  const mrt = ManagedRuntime.make(Layer.empty)
  const baseContext = mrt.runSync(Effect.context<never>())
  const rt = makeAtomClientRuntime(
    () => Layer.succeedContext(baseContext) as Layer.Layer<any, never, never>,
    mrt.memoMap
  )
  const qi = new QueryImpl(() => Context.empty(), () => rt)

  // "a" resolves immediately; any other input hangs forever (stays Initial+waiting).
  const handler = fakeHandler(
    "TestSuspense/ReactiveArg",
    (input: any) => (input.id === "a" ? Effect.succeed("DATA_A") : Effect.never)
  )

  const argRef = ref({ id: "a" })
  let promise: Promise<any> | undefined
  const host = document.createElement("div")
  const app = createApp({
    setup() {
      promise = qi.useSuspenseQuery(handler)(argRef as any, {} as any)
      return () => null
    }
  })
  app.provide(registryKey, defaultRegistry)
  app.mount(host)

  const [resultRef, latestRef] = (await promise) as any
  expect(latestRef.value).toBe("DATA_A")

  // Re-point to an input whose atom has never fetched -> Initial, no previousSuccess.
  argRef.value = { id: "b" }
  await nextTick()

  // BEFORE fix: throws "Internal Error: suspense resolved without a latest value".
  expect(latestRef.value).toBe("DATA_A")
  // The result ref itself does reflect the in-flight fetch for the new input.
  expect(AsyncResult.isInitial(resultRef.value)).toBe(true)

  app.unmount()
  defaultRegistry.reset()
})

it("makeTanstackQuery structurally shares Effect-Equal leaves by default", async () => {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity, staleTime: 0 } }
  })
  const getRuntime = () => Context.empty()
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
  const query = makeTanstackQuery(getRuntime, queryClient)(handler)
  const ctx = makeContext(queryClient)

  const [, , , handle] = ctx.run(() => query(undefined, {}))
  const first = await Effect.runPromise(handle.awaitResult())
  const second = await Effect.runPromise(handle.refetch())

  expect(second.revision).toBe(2)
  expect(second).not.toBe(first)
  expect(second.stable).toBe(first.stable)
  expect(second.stable.date).toBe(first.stable.date)
  expect(second.stable.option).toBe(first.stable.option)

  ctx.dispose()
})

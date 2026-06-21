/* eslint-disable @typescript-eslint/no-explicit-any */
import { QueryClient, VueQueryPlugin } from "@tanstack/vue-query"
import * as Context from "effect-app/Context"
import * as Effect from "effect-app/Effect"
import * as Option from "effect-app/Option"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import { createApp, effectScope, nextTick, ref } from "vue"
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

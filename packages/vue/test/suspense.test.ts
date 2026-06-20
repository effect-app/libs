import { defaultRegistry, registryKey } from "@effect/atom-vue"
import { Effect, Option } from "effect-app"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import * as Atom from "effect/unstable/reactivity/Atom"
import { computed, createApp, nextTick, ref } from "vue"
import { withQueryOptions } from "../src/atomQuery.js"
import { useAtomQuery, useAtomSuspense } from "../src/query.js"
import { awaitResolvedSuspenseResult } from "../src/suspense.js"

const listenerCount = (atom: Atom.Atom<unknown>) => defaultRegistry.getNodes().get(atom)?.listeners.size ?? 0

it("waits for the query result ref after suspense resolves", async () => {
  const result = ref<AsyncResult.AsyncResult<number, never>>(AsyncResult.initial(true))
  const promise = Effect.runPromise(awaitResolvedSuspenseResult(computed(() => result.value)))

  result.value = AsyncResult.success(123)

  expect(Option.getOrUndefined(AsyncResult.value(await promise))).toBe(123)
})

it("keeps unresolved query results initial", async () => {
  const result = ref<AsyncResult.AsyncResult<number, never>>(AsyncResult.initial(true))
  const settled = await Effect.runPromise(awaitResolvedSuspenseResult(computed(() => result.value)))

  expect(AsyncResult.isInitial(settled)).toBe(true)
})

it("stops atom suspense subscriptions when the setup scope is disposed", async () => {
  defaultRegistry.reset()
  const atom = Atom.make(Effect.succeed(123))
  let promise: ReturnType<typeof useAtomSuspense<number, never>> | undefined
  const host = document.createElement("div")
  const app = createApp({
    setup() {
      promise = useAtomSuspense(() => atom)
      return () => null
    }
  })
  app.provide(registryKey, defaultRegistry)
  app.mount(host)

  if (promise === undefined) {
    throw new Error("suspense setup did not initialize")
  }

  await promise
  expect(listenerCount(atom)).toBe(1)

  app.unmount()
  await nextTick()
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(listenerCount(atom)).toBe(0)
  defaultRegistry.reset()
})

it("does not keep query option wrapper subscriptions after unmount", async () => {
  defaultRegistry.reset()
  const atom = Atom.make(Effect.succeed(123))
  const observed = withQueryOptions(atom)
  let promise: ReturnType<typeof useAtomSuspense<number, never>> | undefined
  const host = document.createElement("div")
  const app = createApp({
    setup() {
      promise = useAtomSuspense(() => observed)
      return () => null
    }
  })
  app.provide(registryKey, defaultRegistry)
  app.mount(host)

  if (promise === undefined) {
    throw new Error("suspense setup did not initialize")
  }

  await promise
  expect(listenerCount(atom)).toBe(1)

  app.unmount()
  await nextTick()
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(listenerCount(atom)).toBe(0)
  defaultRegistry.reset()
})

it("aborts atom suspense promises when the component unmounts", async () => {
  defaultRegistry.reset()
  const atom = Atom.make(Effect.never)
  let promise: ReturnType<typeof useAtomSuspense<number, never>> | undefined
  const host = document.createElement("div")
  const app = createApp({
    setup() {
      promise = useAtomSuspense(() => atom)
      return () => null
    }
  })
  app.provide(registryKey, defaultRegistry)
  app.mount(host)

  if (promise === undefined) {
    throw new Error("suspense setup did not initialize")
  }

  app.unmount()
  await nextTick()
  const settled = await Promise.race([
    promise.then(() => "resolved" as const, () => "rejected" as const),
    new Promise<"pending">((resolve) => setTimeout(() => resolve("pending"), 20))
  ])
  expect(settled).toBe("rejected")
  defaultRegistry.reset()
})

it("stops atom query subscriptions when the component unmounts", async () => {
  defaultRegistry.reset()
  const atom = Atom.make(Effect.succeed(123))
  const host = document.createElement("div")
  const app = createApp({
    setup() {
      useAtomQuery(() => atom)
      return () => null
    }
  })
  app.provide(registryKey, defaultRegistry)
  app.mount(host)

  await nextTick()
  expect(listenerCount(atom)).toBe(1)

  app.unmount()
  await nextTick()
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(listenerCount(atom)).toBe(0)
  defaultRegistry.reset()
})

it("does not keep non-suspense query option wrapper subscriptions after unmount", async () => {
  defaultRegistry.reset()
  const atom = Atom.make(Effect.succeed(123))
  const observed = withQueryOptions(atom)
  const host = document.createElement("div")
  const app = createApp({
    setup() {
      useAtomQuery(() => observed)
      return () => null
    }
  })
  app.provide(registryKey, defaultRegistry)
  app.mount(host)

  await nextTick()
  expect(listenerCount(observed)).toBe(1)
  expect(listenerCount(atom)).toBe(1)

  app.unmount()
  await nextTick()
  await new Promise((resolve) => setTimeout(resolve, 0))
  expect(listenerCount(observed)).toBe(0)
  expect(listenerCount(atom)).toBe(0)
  defaultRegistry.reset()
})

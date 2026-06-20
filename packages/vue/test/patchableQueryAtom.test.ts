import { expect, it } from "@effect/vitest"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import * as Atom from "effect/unstable/reactivity/Atom"
import * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry"
import { patchableQueryAtom } from "../src/atomQuery.js"

it("patchableQueryAtom: applies the updater to the cached Success value", () => {
  const registry = AtomRegistry.make()
  // writable source standing in for a resolved query result
  const source = Atom.make(AsyncResult.success({ count: 1 }))
  const query = patchableQueryAtom<{ count: number }, never>(source)

  expect(registry.get(query)).toMatchObject({ _tag: "Success", value: { count: 1 } })

  // patch the cache in place (the useUpdateQuery path)
  registry.set(query, (data) => ({ count: data.count + 10 }))
  expect(registry.get(query)).toMatchObject({ _tag: "Success", value: { count: 11 } })

  // successive patches compose off the latest displayed value
  registry.set(query, (data) => ({ count: data.count + 1 }))
  expect(registry.get(query)).toMatchObject({ _tag: "Success", value: { count: 12 } })
})

it("patchableQueryAtom: the underlying query value overrides the optimistic patch on refresh", () => {
  const registry = AtomRegistry.make()
  const source = Atom.make(AsyncResult.success({ count: 1 }))
  const query = patchableQueryAtom<{ count: number }, never>(source)

  // mount so the patch node has a listener and recomputes on source change
  const unmount = registry.subscribe(query, () => {}, { immediate: true })

  registry.set(query, () => ({ count: 99 }))
  expect(registry.get(query)).toMatchObject({ _tag: "Success", value: { count: 99 } })

  // the real query produces a new value -> patch is discarded, real value shown
  registry.set(source, AsyncResult.success({ count: 2 }))
  expect(registry.get(query)).toMatchObject({ _tag: "Success", value: { count: 2 } })

  unmount()
})

it("patchableQueryAtom: non-Success states are left untouched", () => {
  const registry = AtomRegistry.make()
  const source = Atom.make(AsyncResult.initial<{ count: number }, never>(false))
  const query = patchableQueryAtom<{ count: number }, never>(source)

  registry.set(query, (data) => ({ count: data.count + 1 }))
  expect(registry.get(query)).toMatchObject({ _tag: "Initial" })
})

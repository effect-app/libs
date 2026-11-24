import { defaultRegistry } from "@effect/atom-vue"
import { DataDependencies, makeQueryKey } from "effect-app/client"
import * as Context from "effect-app/Context"
import * as Effect from "effect-app/Effect"
import * as Option from "effect-app/Option"
import * as Layer from "effect/Layer"
import * as ManagedRuntime from "effect/ManagedRuntime"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import type * as Atom from "effect/reactivity/Atom"
import * as AtomRegistry from "effect/reactivity/AtomRegistry"
import * as Reactivity from "effect/reactivity/Reactivity"
import { afterEach, describe, expect, it } from "vitest"
import {
  awaitAtomResult,
  buildQueryFamily,
  invalidateAndAwait,
  invalidateSoft,
  makeAtomClientRuntime,
  withQueryOptions
} from "../src/atomQuery.js"

const makeEnv = () => {
  const mrt = ManagedRuntime.make(Reactivity.layer)
  const baseContext = mrt.runSync(Effect.context<Reactivity.Reactivity>())
  const reactivity = Context.get(baseContext, Reactivity.Reactivity)
  const rt = makeAtomClientRuntime(() => Layer.succeedContext(baseContext), mrt.memoMap)
  return { rt, reactivity, mrt }
}

const served = <E>(
  registry: AtomRegistry.AtomRegistry,
  atom: Atom.Atom<AsyncResult.AsyncResult<number, E>>
): number | undefined => Option.getOrUndefined(AsyncResult.value(registry.get(atom)))

const fullKeyOf = (self: { readonly id: string }) => [...makeQueryKey(self), undefined]

describe("AtomRegistry context resolution in invalidateSoft / invalidateAndAwait", () => {
  afterEach(() => {
    defaultRegistry.reset()
  })

  it("refreshes and awaits query atoms in an in-context AtomRegistry without touching defaultRegistry", async () => {
    const { rt, reactivity, mrt } = makeEnv()
    const isolatedRegistry = AtomRegistry.make()
    const repo = DataDependencies.repo("IsolatedAwaitRepo")
    let count = 0
    const self = {
      id: "IsolatedAwait.List",
      handler: () =>
        Effect.gen(function* () {
          yield* DataDependencies.read(repo)
          return ++count
        })
    }
    const atom = withQueryOptions(buildQueryFamily(rt, self)(undefined), {
      gcTime: "infinity",
      revalidateOnFocus: false
    })

    const unsubDefault = defaultRegistry.subscribe(atom, () => {})
    const unsubIsolated = isolatedRegistry.subscribe(atom, () => {})
    try {
      expect(await Effect.runPromise(awaitAtomResult(defaultRegistry, atom))).toBe(1)
      expect(await Effect.runPromise(awaitAtomResult(isolatedRegistry, atom))).toBe(2)

      await Effect.runPromise(
        invalidateAndAwait([fullKeyOf(self)]).pipe(
          Effect.provideService(Reactivity.Reactivity, reactivity),
          Effect.provideService(AtomRegistry.AtomRegistry, isolatedRegistry)
        )
      )

      expect(served(isolatedRegistry, atom)).toBe(3)
      expect(served(defaultRegistry, atom)).toBe(1)
    } finally {
      unsubIsolated()
      unsubDefault()
      isolatedRegistry.dispose()
      await mrt.dispose()
    }
  })

  it("refreshes query atoms in an in-context AtomRegistry via invalidateSoft without touching defaultRegistry", async () => {
    const { rt, reactivity, mrt } = makeEnv()
    const isolatedRegistry = AtomRegistry.make()
    const repo = DataDependencies.repo("IsolatedSoftRepo")
    let count = 0
    const self = {
      id: "IsolatedSoft.List",
      handler: () =>
        Effect.gen(function* () {
          yield* DataDependencies.read(repo)
          return ++count
        })
    }
    const atom = withQueryOptions(buildQueryFamily(rt, self)(undefined), {
      gcTime: "infinity",
      revalidateOnFocus: false
    })

    const unsubDefault = defaultRegistry.subscribe(atom, () => {})
    const unsubIsolated = isolatedRegistry.subscribe(atom, () => {})
    try {
      expect(await Effect.runPromise(awaitAtomResult(defaultRegistry, atom))).toBe(1)
      expect(await Effect.runPromise(awaitAtomResult(isolatedRegistry, atom))).toBe(2)

      await Effect.runPromise(
        invalidateSoft([fullKeyOf(self)]).pipe(
          Effect.provideService(Reactivity.Reactivity, reactivity),
          Effect.provideService(AtomRegistry.AtomRegistry, isolatedRegistry)
        )
      )
      expect(await Effect.runPromise(awaitAtomResult(isolatedRegistry, atom))).toBe(3)
      expect(served(defaultRegistry, atom)).toBe(1)
    } finally {
      unsubIsolated()
      unsubDefault()
      isolatedRegistry.dispose()
      await mrt.dispose()
    }
  })

  it("falls back to defaultRegistry when AtomRegistry is not provided in context", async () => {
    const { rt, reactivity, mrt } = makeEnv()
    const repo = DataDependencies.repo("FallbackDefaultRepo")
    let count = 0
    const self = {
      id: "FallbackDefault.List",
      handler: () =>
        Effect.gen(function* () {
          yield* DataDependencies.read(repo)
          return ++count
        })
    }
    const atom = withQueryOptions(buildQueryFamily(rt, self)(undefined), {
      gcTime: "infinity",
      revalidateOnFocus: false
    })

    const unsubDefault = defaultRegistry.subscribe(atom, () => {})
    try {
      expect(await Effect.runPromise(awaitAtomResult(defaultRegistry, atom))).toBe(1)

      await Effect.runPromise(
        invalidateAndAwait([fullKeyOf(self)]).pipe(Effect.provideService(Reactivity.Reactivity, reactivity))
      )
      expect(served(defaultRegistry, atom)).toBe(2)

      await Effect.runPromise(
        invalidateSoft([fullKeyOf(self)]).pipe(Effect.provideService(Reactivity.Reactivity, reactivity))
      )
      expect(await Effect.runPromise(awaitAtomResult(defaultRegistry, atom))).toBe(3)
    } finally {
      unsubDefault()
      await mrt.dispose()
    }
  })
})

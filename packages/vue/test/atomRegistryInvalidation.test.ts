import { defaultRegistry } from "@effect/atom-vue"
import { DataDependencies, makeQueryKey } from "effect-app/client"
import * as Context from "effect-app/Context"
import * as Effect from "effect-app/Effect"
import * as Option from "effect-app/Option"
import * as Layer from "effect/Layer"
import * as ManagedRuntime from "effect/ManagedRuntime"
import * as AsyncResult from "effect/reactivity/AsyncResult"
import * as Atom from "effect/reactivity/Atom"
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
import { initializeAsync } from "../src/runtime.js"

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

  it("shares one built Context and Reactivity instance across initializeAsync, makeAtomClientRuntime, and Atom.runtime when given Atom.runtime.memoMap", async () => {
    class SharedProbe extends Context.Service<SharedProbe, { readonly id: number }>()("SharedProbe") {}
    let builds = 0
    const probeLayer = Layer.effect(
      SharedProbe,
      Effect.sync(() => ({ id: ++builds }))
    )
    const globalLayers = probeLayer.pipe(
      Layer.provideMerge(Reactivity.layer),
      Layer.provideMerge(Layer.succeed(AtomRegistry.AtomRegistry, defaultRegistry))
    )

    const sharedMemoMap = defaultRegistry.get(Atom.runtime.memoMap)
    const rt = await initializeAsync(globalLayers, { memoMap: sharedMemoMap })
    const builtCtx = await rt.context()
    Atom.runtime.addGlobalLayer(Layer.succeedContext(builtCtx))

    const clientMrt = ManagedRuntime.make(globalLayers, { memoMap: rt.memoMap })
    const clientCtx = await clientMrt.context()
    const atomClientRt = makeAtomClientRuntime(() => Layer.succeedContext(clientCtx), clientMrt.memoMap)

    const atomRt = Atom.runtime(globalLayers)
    const probeAtom = atomRt.atom(
      Effect.gen(function* () {
        return { probe: yield* SharedProbe, reactivity: yield* Reactivity.Reactivity }
      })
    )

    let atomReactiveRuns = 0
    const atomReactive = Atom.withReactivity(["shared-ping"])(atomRt.atom(Effect.sync(() => ++atomReactiveRuns)))
    let clientReactiveRuns = 0
    const clientReactive = atomClientRt.factory.withReactivity(["shared-pong"])(
      atomClientRt.runtime.atom(Effect.sync(() => ++clientReactiveRuns))
    )

    const unsub1 = defaultRegistry.subscribe(atomReactive, () => {})
    const unsub2 = defaultRegistry.subscribe(clientReactive, () => {})
    try {
      const atomObserved = await Effect.runPromise(AtomRegistry.getResult(defaultRegistry, probeAtom))
      expect(builds).toBe(1)
      expect(Context.get(builtCtx, SharedProbe)).toBe(Context.get(clientCtx, SharedProbe))
      expect(Context.get(builtCtx, SharedProbe)).toBe(atomObserved.probe)
      expect(Context.get(builtCtx, Reactivity.Reactivity)).toBe(Context.get(clientCtx, Reactivity.Reactivity))
      expect(Context.get(builtCtx, Reactivity.Reactivity)).toBe(atomObserved.reactivity)

      expect(await Effect.runPromise(AtomRegistry.getResult(defaultRegistry, atomReactive))).toBe(1)
      await rt.runPromise(Reactivity.invalidate(["shared-ping"]))
      expect(await Effect.runPromise(AtomRegistry.getResult(defaultRegistry, atomReactive))).toBe(2)

      expect(await Effect.runPromise(AtomRegistry.getResult(defaultRegistry, clientReactive))).toBe(1)
      await rt.runPromise(Reactivity.invalidate(["shared-pong"]))
      expect(await Effect.runPromise(AtomRegistry.getResult(defaultRegistry, clientReactive))).toBe(2)
    } finally {
      unsub2()
      unsub1()
      await clientMrt.dispose()
      await rt.dispose()
    }
  })
})

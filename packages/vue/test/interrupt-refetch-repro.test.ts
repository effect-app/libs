/* eslint-disable @typescript-eslint/no-explicit-any */
//
// Reproduction matrix: an interrupted query fetch leaves the atom stuck `waiting = true` and
// frozen on its previous value, so it is never refetched until an explicit invalidation happens.
//
// Field incident (Mako Bauhaus PickList): a successful pick's `List` invalidation-refetch was
// interrupted when the pick-list component re-rendered/unmounted; the atom stayed `Success +
// waiting=true`, the list kept serving the pre-pick snapshot, and — because every subsequent pick
// then failed the backend `picking` guard (no write → no further invalidation) — nothing ever
// cleared it. Pickers re-confirmed already-picked items and hit
// "Artikel ist nicht im Kommissionierstatus".
//
// Root cause: `isStaleResult` returns false while `r.waiting` is true (atomQuery.ts), so a query
// whose fetch was interrupted (waiting never cleared) is neither completing nor considered stale —
// mount/focus/reconnect refetch triggers all skip it. Only `Reactivity.invalidate` (an explicit
// invalidation) force-refreshes it.
//
// `it.fails` = a wedge we want a fix to flip to green (asserts the DESIRED recovery, currently
// fails). Plain `it` = behaviour that already works / a characterization of the stuck state.
//
import { defaultRegistry, registryKey } from "@effect/atom-vue"
import { DataDependencies, makeQueryKey } from "effect-app/client"
import * as Context from "effect-app/Context"
import * as Effect from "effect-app/Effect"
import * as Option from "effect-app/Option"
import * as Fiber from "effect/Fiber"
import * as Latch from "effect/Latch"
import * as Layer from "effect/Layer"
import * as ManagedRuntime from "effect/ManagedRuntime"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import * as Reactivity from "effect/unstable/reactivity/Reactivity"
import { createApp, nextTick } from "vue"
import { awaitAtomResult, buildQueryFamily, invalidateAndAwait, makeAtomClientRuntime, queryFetchStates, withQueryOptions } from "../src/atomQuery.js"
import { invalidateQueries } from "../src/mutate.js"
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
  const invalidator = {
    invalidateAndAwait: (keys: ReadonlyArray<ReadonlyArray<unknown>>) =>
      invalidateAndAwait(keys).pipe(Effect.provideService(Reactivity.Reactivity, reactivity))
  }
  return { rt, invalidator }
}

// A query handler that records a repo read and (when armed) blocks each fetch on a fresh Latch, so
// a test can hold a fetch in-flight and then interrupt it (by unmounting the subscriber). The
// returned value is the fetch's start ordinal, so the served value tells us which fetch produced
// the currently-cached data (`served === 1` means "still the first, stale value").
const makeGated = (id: string, repo: DataDependencies.DataDependency) => {
  let starts = 0
  let completes = 0
  let blocking = false
  const latches: Array<Latch.Latch> = []
  const self = {
    id,
    handler: () =>
      Effect.gen(function*() {
        yield* DataDependencies.read(repo)
        const n = ++starts
        if (blocking) {
          const latch = Latch.makeUnsafe(false)
          latches.push(latch)
          yield* latch.await
        }
        completes++
        return n
      })
  }
  return {
    self,
    starts: () => starts,
    completes: () => completes,
    setBlocking: (v: boolean) => {
      blocking = v
    },
    releaseAll: () => latches.splice(0).forEach((latch) => latch.openUnsafe())
  }
}

const result = (atom: any): AsyncResult.AsyncResult<number, never> => defaultRegistry.get(atom)
const served = (atom: any): number | undefined => Option.getOrUndefined(AsyncResult.value(result(atom)))

// Default staleTime (5s): a remount within a test does NOT auto-refetch on staleness, so any refetch
// on remount is attributable to invalidation / interrupt handling — not swr staleness. gcTime
// "infinity" keeps the atom (and its cached value) alive across unmount→remount, matching a
// real cache-hit remount.
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

const ignoreSuspenseInterrupt = (p: Promise<any> | undefined) => {
  p?.catch(() => {})
}

const writeCommand = (repo: DataDependencies.DataDependency) => DataDependencies.write(repo).pipe(Effect.as(undefined))
const drain = (fiber: Fiber.Fiber<any, any>) =>
  Effect.runPromise(Fiber.interrupt(fiber) as any).then(() => {}, () => {})

// ===================================================================================
// A. Interrupt on suspense page unload (query-side)
// ===================================================================================

it.fails("A1 — unload during the INITIAL fetch: remount must refetch, not hang forever", async () => {
  defaultRegistry.reset()
  const { rt } = makeEnv()
  const g = makeGated("Repro.A1.List", DataDependencies.repo("A1Repo"))
  const atom = queryAtom(rt, g.self)

  g.setBlocking(true) // initial fetch hangs
  const m1 = mountSuspense(atom)
  await ticks(2)
  expect(g.starts()).toBe(1)

  ignoreSuspenseInterrupt(m1.getPromise())
  m1.app.unmount() // page unload -> interrupt the in-flight initial fetch
  await ticks(2)

  g.setBlocking(false)
  const m2 = mountSuspense(atom) // remount; there is NO cached value, so it MUST fetch
  const outcome = await settle(m2.getPromise())
  await ticks(4)

  // WEDGE: the interrupted initial fetch leaves the atom Initial+waiting=true; remount never
  // re-runs (starts stays 1) and the suspense promise hangs.
  expect(g.starts(), "remount with no cached value must start a fresh fetch").toBeGreaterThanOrEqual(2)
  expect(outcome).toBe("resolved")
  m2.app.unmount()
  defaultRegistry.reset()
})

it.fails("A2 — seeded, unload during a REFETCH: remount alone must serve fresh (field wedge)", async () => {
  defaultRegistry.reset()
  const { rt } = makeEnv()
  const g = makeGated("Repro.A2.List", DataDependencies.repo("A2Repo"))
  const atom = queryAtom(rt, g.self)

  const m1 = mountSuspense(atom)
  await settle(m1.getPromise())
  await ticks(2)
  expect(served(atom), "seed").toBe(1)

  g.setBlocking(true)
  defaultRegistry.refresh(atom) // refetch #2 starts, blocks
  await ticks(2)
  m1.app.unmount() // page unload -> interrupt the in-flight refetch #2
  await ticks(2)
  g.setBlocking(false)

  const m2 = mountSuspense(atom) // remount (cache-hit)
  await settle(m2.getPromise())
  await ticks(4)

  // WEDGE: atom is stuck Success+waiting=true, so remount serves the stale value 1 and never refetches.
  expect(served(atom), "remount must recover past the stale value 1").not.toBe(1)
  m2.app.unmount()
  defaultRegistry.reset()
})

it("A2b — characterization: an interrupted refetch leaves the atom Success + waiting=true (never stale)", async () => {
  defaultRegistry.reset()
  const { rt } = makeEnv()
  const g = makeGated("Repro.A2b.List", DataDependencies.repo("A2bRepo"))
  const atom = queryAtom(rt, g.self)

  const m1 = mountSuspense(atom)
  await settle(m1.getPromise())
  await ticks(2)

  g.setBlocking(true)
  defaultRegistry.refresh(atom)
  await ticks(2)
  m1.app.unmount() // interrupt refetch
  await ticks(2)

  const r = result(atom)
  expect(AsyncResult.isSuccess(r)).toBe(true)
  expect(served(atom)).toBe(1) // frozen on the stale previous value
  expect(r.waiting, "the stuck `waiting=true` is why isStaleResult never marks it refetchable").toBe(true)
  defaultRegistry.reset()
})

// ===================================================================================
// B. Interrupt during a mutation (command done; invalidation about to / mid-flight)
// ===================================================================================

it("B1 — mutation fiber interrupted while its onExit invalidation-refetch runs: query still refreshes", async () => {
  defaultRegistry.reset()
  const { rt, invalidator } = makeEnv()
  const repo = DataDependencies.repo("B1Repo")
  const g = makeGated("Repro.B1.List", repo)
  const atom = buildQueryFamily(rt as any, g.self as any)(undefined)
  const unmount = defaultRegistry.mount(atom)

  await Effect.runPromise(awaitAtomResult(defaultRegistry, atom) as any) // fetch #1
  expect(g.completes()).toBe(1)

  g.setBlocking(true)
  const mutation = invalidateQueries({ id: "Repro.B1.Save" }, undefined, invalidator)(writeCommand(repo), { id: "x" })
  const fiber = Effect.runFork(mutation as any)
  await ticks(2)
  expect(g.starts(), "invalidation should have started the refetch").toBe(2)

  // The onExit invalidation runs uninterruptibly, so releasing the refetch completes it even though
  // the mutation fiber is interrupted.
  const interrupting = drain(fiber)
  g.releaseAll()
  await interrupting
  await Effect.runPromise(awaitAtomResult(defaultRegistry, atom) as any)

  expect(g.completes(), "onExit invalidation must complete the refetch despite fiber interrupt").toBe(2)
  expect(served(atom)).toBe(2)
  unmount()
  defaultRegistry.reset()
})

// Contrast with A2: the wedge is specific to refetches NOT backed by a durable invalidation
// dirty-mark. A mutation's `Reactivity.invalidate` dirty-marks the atom, and that mark survives the
// interrupt, so a remount refetches. (The field stayed wedged because it either did not remount the
// query scope — see A2b — or the only trigger that would re-invalidate, a successful pick, could
// never happen against the stale list.)
it("B2 — query unmounts DURING a mutation-triggered refetch, then remounts: recovers (invalidation dirty-mark survives)", async () => {
  defaultRegistry.reset()
  const { rt, invalidator } = makeEnv()
  const repo = DataDependencies.repo("B2Repo")
  const g = makeGated("Repro.B2.List", repo)
  const atom = queryAtom(rt, g.self)

  const m1 = mountSuspense(atom)
  await settle(m1.getPromise())
  await ticks(2)
  expect(served(atom), "seed").toBe(1)

  g.setBlocking(true)
  const mutation = invalidateQueries({ id: "Repro.B2.Save" }, undefined, invalidator)(writeCommand(repo), { id: "x" })
  const fiber = Effect.runFork(mutation as any)
  await ticks(2)
  expect(g.starts(), "mutation should have started the refetch").toBe(2)

  m1.app.unmount() // query component unmounts mid-refetch (dialog-close re-render) -> interrupt
  await ticks(2)
  g.releaseAll()
  await drain(fiber)
  g.setBlocking(false)

  const m2 = mountSuspense(atom) // remount; no further successful mutation comes (as in the field)
  await settle(m2.getPromise())
  await ticks(4)

  // WEDGE: stuck Success+waiting=true -> the pick list stays frozen on the pre-pick snapshot.
  expect(served(atom), "remount must recover past the stale value 1").not.toBe(1)
  m2.app.unmount()
  defaultRegistry.reset()
})

it("B3 — query UNMOUNTED when the mutation invalidation lands, then remounts: refetches fresh", async () => {
  defaultRegistry.reset()
  const { rt, invalidator } = makeEnv()
  const repo = DataDependencies.repo("B3Repo")
  const g = makeGated("Repro.B3.List", repo)
  const atom = queryAtom(rt, g.self)

  const m1 = mountSuspense(atom)
  await settle(m1.getPromise())
  await ticks(2)
  expect(served(atom), "seed").toBe(1)

  m1.app.unmount() // navigate away: query is unmounted (cached)
  await ticks(2)

  // Command writes the repo; invalidation marks the (unmounted) query dirty.
  const mutation = invalidateQueries({ id: "Repro.B3.Save" }, undefined, invalidator)(writeCommand(repo), { id: "x" })
  await Effect.runPromise(mutation as any).then(() => {}, () => {})
  await ticks(2)

  const m2 = mountSuspense(atom) // remount: an invalidated query refetches on mount
  await settle(m2.getPromise())
  await ticks(2)

  expect(g.starts(), "remount of an invalidated query must refetch").toBeGreaterThanOrEqual(2)
  expect(served(atom)).not.toBe(1)
  m2.app.unmount()
  defaultRegistry.reset()
})

// ===================================================================================
// M. Multi-caller invariants: an interrupt models "this caller lost interest" — it must not
//    cascade to concurrent callers, and later callers must not inherit a poisoned result.
// ===================================================================================

it("M1 — concurrent callers share ONE in-flight fetch (re-entrant join)", async () => {
  defaultRegistry.reset()
  const { rt } = makeEnv()
  const g = makeGated("Repro.M1.List", DataDependencies.repo("M1Repo"))
  const atom = queryAtom(rt, g.self)

  g.setBlocking(true)
  const a = mountSuspense(atom) // starts fetch #1
  await ticks(2)
  const b = mountSuspense(atom) // joins the same in-flight fetch
  await ticks(2)
  expect(g.starts(), "second caller must join, not start a second fetch").toBe(1)

  g.releaseAll()
  expect(await settle(a.getPromise())).toBe("resolved")
  expect(await settle(b.getPromise())).toBe("resolved")
  expect(g.completes()).toBe(1)
  a.app.unmount()
  b.app.unmount()
  defaultRegistry.reset()
})

it("M2 — one of two concurrent callers unmounts mid-fetch: the other still resolves (no cascade)", async () => {
  defaultRegistry.reset()
  const { rt } = makeEnv()
  const g = makeGated("Repro.M2.List", DataDependencies.repo("M2Repo"))
  const atom = queryAtom(rt, g.self)

  g.setBlocking(true)
  const a = mountSuspense(atom) // fetch #1 in-flight
  await ticks(2)
  const b = mountSuspense(atom) // joins
  await ticks(2)
  expect(g.starts()).toBe(1)

  ignoreSuspenseInterrupt(a.getPromise())
  a.app.unmount() // caller A loses interest -> interrupts ITS await only
  await ticks(2)
  g.releaseAll() // the shared fetch must survive for caller B

  const outcomeB = await settle(b.getPromise())
  await ticks(2)
  expect(outcomeB, "A's interrupt must not cascade to B").toBe("resolved")
  expect(served(atom)).toBe(1)
  expect(g.completes()).toBe(1)
  b.app.unmount()
  defaultRegistry.reset()
})

// ===================================================================================
// FIX. recoverStuckWaitingOnMount: a query whose result says `waiting` while nothing is in-flight
//      (`inFlight === 0`) is a hidden interrupt left dangling — effect-core removed the result
//      observer before interrupting the fiber. Such an atom must be treated as not-yet-fetched on
//      the next mount and refetched, re-entrantly (concurrent mounts share the single recovery
//      fetch — the `recovering` guard). We do NOT auto-retry the interrupt; recovery is driven by a
//      genuine (re)mount. This validates the recovery mechanism directly.
// ===================================================================================

// Put an atom into the stuck state: a refetch is issued, then we simulate effect-core's
// interrupt-hiding — the result stays `waiting` but `inFlight` is forced to 0 (nothing running).
const induceStuckWaiting = async (g: ReturnType<typeof makeGated>, atom: any, familyAtom: any) => {
  g.setBlocking(true)
  defaultRegistry.refresh(atom)
  await ticks(2)
  expect((result(atom) as any).waiting).toBe(true)
  queryFetchStates.get(familyAtom)!.inFlight = 0
  g.setBlocking(false)
}

it("FIX2 — concurrent mounts of a stuck query share ONE recovery fetch (re-entrant)", async () => {
  defaultRegistry.reset()
  const { rt } = makeEnv()
  const g = makeGated("Repro.FIX2.List", DataDependencies.repo("FIX2Repo"))
  const familyAtom = buildQueryFamily(rt as any, g.self as any)(undefined)
  const atom = withQueryOptions(familyAtom, { gcTime: "infinity", revalidateOnFocus: false })

  const m0 = mountSuspense(atom)
  await settle(m0.getPromise())
  await ticks(2)

  await induceStuckWaiting(g, atom, familyAtom)
  m0.app.unmount()
  await ticks(2)
  g.setBlocking(true) // hold the recovery fetch so both callers are in-flight together
  // Baseline AFTER inducing the wedge (induceStuckWaiting itself starts one — then interrupted — fetch),
  // so the delta counts only the recovery fetch the mounts trigger.
  const before = g.starts()

  const a = mountSuspense(atom)
  const b = mountSuspense(atom)
  await ticks(2)
  expect(g.starts() - before, "both callers must share ONE recovery fetch").toBe(1)

  g.releaseAll()
  expect(await settle(a.getPromise())).toBe("resolved")
  expect(await settle(b.getPromise())).toBe("resolved")
  a.app.unmount()
  b.app.unmount()
  defaultRegistry.reset()
})

it("FIX3 — a result stuck `waiting` with no in-flight fetch is treated as stuck and refetched", async () => {
  defaultRegistry.reset()
  const { rt } = makeEnv()
  const g = makeGated("Repro.FIX3.List", DataDependencies.repo("FIX3Repo"))
  const familyAtom = buildQueryFamily(rt as any, g.self as any)(undefined)
  const atom = withQueryOptions(familyAtom, { gcTime: "infinity", revalidateOnFocus: false })

  const m1 = mountSuspense(atom)
  await settle(m1.getPromise())
  await ticks(2)
  expect(served(atom)).toBe(1)

  // Put the atom into a `waiting` state (a refetch), then simulate effect-core's interrupt-hiding:
  // the fetch fiber is interrupted (so nothing is in-flight) but the result was left `waiting`.
  g.setBlocking(true)
  defaultRegistry.refresh(atom)
  await ticks(2)
  expect((result(atom) as any).waiting).toBe(true)
  queryFetchStates.get(familyAtom)!.inFlight = 0 // effect-core removed its observer before interrupting → waiting is now dangling
  m1.app.unmount()
  await ticks(2)
  g.setBlocking(false)

  const m2 = mountSuspense(atom) // remount: stuck (waiting, inFlight 0) must refetch, not adopt it
  await settle(m2.getPromise())
  await ticks(2)

  expect(g.starts(), "stuck waiting must be refetched").toBeGreaterThanOrEqual(2)
  expect(served(atom), "serves the fresh value, not the stuck one").not.toBe(1)
  m2.app.unmount()
  defaultRegistry.reset()
})

// ===================================================================================
// SUP. Supersession: 3 listeners share 1 in-flight fetch; 1 leaves; a mutation makes the in-flight
//      fetch stale, so it is interrupted and re-queried; the 2 remaining listeners join the new fetch.
// ===================================================================================

// GUARD (already correct): once a query has completed once (so its read-deps are recorded), a
// mutation whose `Reactivity.invalidate` lands while a refetch is in-flight DOES supersede that
// stale in-flight fetch and re-query; the remaining listeners join the fresh fetch. (An earlier
// "invalidation dropped" reading was a test artifact: a query whose *seed* fetch is blocked never
// records read-deps, so the dependency-derived invalidation never targets it — no invalidation
// fires at all. With a completed seed, supersession works.)
it("SUP — invalidation supersedes a stale in-flight fetch; remaining listeners join the fresh one", async () => {
  defaultRegistry.reset()
  const { rt, invalidator } = makeEnv()
  const repo = DataDependencies.repo("SUPRepo")
  const g = makeGated("Repro.SUP.List", repo)
  const atom = queryAtom(rt, g.self)

  // 3 listeners; seed a COMPLETED fetch #1 so the query records its read-deps (required for the
  // mutation's dependency-derived invalidation to target it).
  const a = mountSuspense(atom)
  const b = mountSuspense(atom)
  const c = mountSuspense(atom)
  await settle(a.getPromise())
  await ticks(2)
  expect(g.starts(), "3 listeners share one fetch").toBe(1)
  expect(served(atom)).toBe(1)

  // Now a refetch is IN-FLIGHT (e.g. a live-event/staleness refresh) — this is the "stale in-flight" fetch.
  g.setBlocking(true)
  defaultRegistry.refresh(atom)
  await ticks(2)
  expect(g.starts(), "refetch #2 in-flight").toBe(2)

  // 1 listener loses interest — the shared in-flight fetch survives for the other two.
  a.app.unmount()
  await ticks(2)

  // A mutation invalidates the query while fetch #2 is still in-flight (stale) -> must supersede it.
  const mutation = invalidateQueries({ id: "Repro.SUP.Save" }, undefined, invalidator)(writeCommand(repo), { id: "x" })
  const fiber = Effect.runFork(mutation as any)
  await ticks(2)
  const superseded = g.starts()

  // Cleanup before asserting so the forked mutation never dangles.
  g.releaseAll()
  await drain(fiber)
  await settle(b.getPromise())
  await settle(c.getPromise())
  await ticks(2)
  const finalServed = served(atom)
  b.app.unmount()
  c.app.unmount()
  defaultRegistry.reset()

  // DESIRED: the in-flight fetch #2 was superseded by a fresh fetch #3, and the remaining listeners
  // see a value from a fetch that ran AFTER the mutation.
  expect(superseded, "invalidation must supersede the stale in-flight fetch").toBeGreaterThanOrEqual(3)
  expect(finalServed, "remaining listeners must see a post-mutation fetch").toBe(g.starts())
  expect(finalServed).not.toBe(1)
})

// ===================================================================================
// C. Recovery guard — the escape hatch the field never got
// ===================================================================================

it("C1 — an explicit invalidation after an interrupted refetch DOES recover the query", async () => {
  defaultRegistry.reset()
  const { rt, invalidator } = makeEnv()
  const repo = DataDependencies.repo("C1Repo")
  const g = makeGated("Repro.C1.List", repo)
  const atom = queryAtom(rt, g.self)
  const fullKey = [...makeQueryKey(g.self), undefined]

  const m1 = mountSuspense(atom)
  await settle(m1.getPromise())
  await ticks(2)

  g.setBlocking(true)
  defaultRegistry.refresh(atom)
  await ticks(2)
  m1.app.unmount() // interrupt refetch -> stuck Success+waiting=true
  await ticks(2)
  g.setBlocking(false)

  const m2 = mountSuspense(atom)
  await settle(m2.getPromise())
  await ticks(2)
  expect(served(atom), "still stale before the explicit invalidation").toBe(1)

  // A subsequent invalidation (a later successful mutation) force-refreshes and unsticks it.
  await Effect.runPromise(invalidator.invalidateAndAwait([fullKey]) as any).then(() => {}, () => {})
  await ticks(2)

  expect(g.completes()).toBeGreaterThanOrEqual(2)
  expect(served(atom), "explicit invalidation recovers fresh data").not.toBe(1)
  m2.app.unmount()
  defaultRegistry.reset()
})

// ===================================================================================
// D. Desired listener semantics (user spec):
//    D1 — a truly-interrupted in-flight request must not be joined by a later listener; the later
//         listener starts fresh (never adopts / hangs on the abandoned request).
//    D2 — with a prior success, an interrupted re-query must not strand a later listener: it should
//         serve the stale previous value immediately AND revalidate in the background (SWR).
// ===================================================================================

it.fails("D1 — sole listener interrupts an in-flight request; a NEW listener starts fresh (no join of the abandoned request)", async () => {
  defaultRegistry.reset()
  const { rt } = makeEnv()
  const g = makeGated("Repro.D1.List", DataDependencies.repo("D1Repo"))
  const atom = queryAtom(rt, g.self)

  g.setBlocking(true)
  const l1 = mountSuspense(atom) // fetch #1 in-flight
  await ticks(2)
  expect(g.starts()).toBe(1)

  ignoreSuspenseInterrupt(l1.getPromise())
  l1.app.unmount() // the only interested caller leaves -> the in-flight request should be abandoned
  await ticks(2)
  g.setBlocking(false)

  const l2 = mountSuspense(atom) // a different listener queries the same key
  const outcome = await settle(l2.getPromise())
  await ticks(2)

  // DESIRED: l2 starts a FRESH fetch rather than joining the abandoned one (which never completes).
  expect(g.starts(), "new listener must start fresh, not join the abandoned request").toBeGreaterThanOrEqual(2)
  expect(outcome, "new listener must resolve, not hang on a dead request").toBe("resolved")
  l2.app.unmount()
  defaultRegistry.reset()
})

it.fails("D2 — prior success; an interrupted re-query serves a later listener the stale value immediately, then revalidates (SWR)", async () => {
  defaultRegistry.reset()
  const { rt } = makeEnv()
  const g = makeGated("Repro.D2.List", DataDependencies.repo("D2Repo"))
  const atom = queryAtom(rt, g.self)

  const l1 = mountSuspense(atom) // fetch #1 -> previousSuccess = 1 (saved)
  await settle(l1.getPromise())
  await ticks(2)
  expect(served(atom)).toBe(1)

  g.setBlocking(true)
  defaultRegistry.refresh(atom) // same listener re-queries
  await ticks(2)
  l1.app.unmount() // ...and interrupts the ongoing re-query
  await ticks(2)
  g.setBlocking(false)

  const l2 = mountSuspense(atom) // another listener queries
  await settle(l2.getPromise())
  const immediate = served(atom)
  await ticks(4)
  const afterRevalidate = served(atom)

  // DESIRED: stale-while-revalidate — the previous value shows at once, then a background fetch refreshes it.
  expect(immediate, "stale previous result shown immediately").toBe(1)
  expect(g.starts(), "a background revalidation fetch must run").toBeGreaterThanOrEqual(2)
  expect(afterRevalidate, "background revalidate replaces the stale value with fresh data").not.toBe(1)
  l2.app.unmount()
  defaultRegistry.reset()
})

/* eslint-disable @typescript-eslint/no-explicit-any */
// Characterization of @tanstack/vue-query 5.96.2 `useQuery(...).suspense()` vs the reactive
// result refs (data/error/isFetching) that our `query.ts` turns into the `resultRef` computed.
//
// WHY THEY CAN DIVERGE
// --------------------
// `suspense()` (vue-query/src/useBaseQuery.ts) ultimately calls:
//     observer.fetchOptimistic(opts)
//   = query.fetch().then(() => createResult(query, opts))
// It CAPTURES the specific `query` object that was current when fetchOptimistic ran, and the
// returned promise resolves with THAT query's freshly-built result — read directly from the
// query-cache, independent of Vue reactivity.
//
// The reactive refs are `toRefs(reactive(state))`, and `state` is ONLY updated through
//     observer.subscribe(r => updateState(state, r))
// i.e. with whatever query the OBSERVER is currently pointed at.
//
// As long as those stay the same query, r and the refs agree (see "agree" tests below).
// They split the moment the observer is re-pointed at a different query (reactive key/arg
// change, i.e. navigating/cancelling soon after start): the captured suspense promise still
// resolves with the OLD query's data, while the refs reflect the NEW query (initial/fetching).

import { QueryClient, useQuery, VueQueryPlugin } from "@tanstack/vue-query"
import { computed, createApp, effectScope, nextTick, ref } from "vue"

type Class = "initial" | "success" | "failure"

// Mirror of query.ts' swrToQuery discriminator (initial vs success vs failure).
function classify(r: { error: unknown; data: unknown; isFetching?: boolean }): Class {
  if (r.error !== undefined && r.error !== null) return "failure"
  if (r.data !== undefined) return "success"
  return "initial"
}

function withSetup<T>(setup: () => T) {
  const app = createApp({ render: () => null })
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity, staleTime: 0 } }
  })
  app.use(VueQueryPlugin, { queryClient })
  const scope = effectScope(true)
  let result!: T
  app.runWithContext(() => {
    scope.run(() => {
      result = setup()
    })
  })
  return { result, app, queryClient, scope, dispose: () => scope.stop() }
}

const tick = async (n = 3) => {
  for (let i = 0; i < n; i++) await nextTick()
}

// External AbortController, like the user passing their own controller into the Effect handler.
function externalAbortQueryFn(controller: AbortController, value: number, ms: number) {
  return () =>
    new Promise<number>((resolve, reject) => {
      if (controller.signal.aborted) return reject(new DOMException("Aborted", "AbortError"))
      const t = setTimeout(() => resolve(value), ms)
      controller.signal.addEventListener("abort", () => {
        clearTimeout(t)
        reject(new DOMException("Aborted", "AbortError"))
      })
    })
}

describe("vue-query suspense() vs reactive result ref", () => {
  // ── Cases where they AGREE (single, stable query) ────────────────────────────

  it("happy path: r and ref both resolve to the same success (no lag)", async () => {
    const { result: uq, dispose } = withSetup(() =>
      useQuery({
        queryKey: ["agree-success"],
        throwOnError: false,
        retry: false,
        suspense: true,
        queryFn: () => new Promise<number>((res) => setTimeout(() => res(123), 10))
      } as any)
    )
    const refClass = () => classify({ error: uq.error.value, data: uq.data.value })

    const r = await (uq as any).suspense()

    // query-core sets data + notifies synchronously, so even before a tick the ref is already success.
    expect(classify({ error: r.error, data: r.data })).toBe("success")
    expect(refClass()).toBe("success")
    expect(r.data).toBe(123)
    expect(uq.data.value).toBe(123)

    dispose()
  })

  it("external abort immediately after suspense(): BOTH go to failure (consistent)", async () => {
    const controller = new AbortController()
    const { result: uq, dispose } = withSetup(() =>
      useQuery({
        queryKey: ["agree-abort"],
        throwOnError: false, // our query.ts default: turn errors into Result, don't throw
        retry: false,
        suspense: true,
        queryFn: externalAbortQueryFn(controller, 42, 50)
      } as any)
    )
    const refClass = () => classify({ error: uq.error.value, data: uq.data.value })

    const suspensePromise = (uq as any).suspense() as Promise<any>
    controller.abort()
    const r = await suspensePromise // does NOT reject: throwOnError:false -> resolve(getCurrentResult())
    await tick()

    // With throwOnError:false the abort surfaces as a failure result on BOTH sides — no silent
    // "success on r / initial on ref" split here, and notably NO thrown error from suspense().
    expect(classify({ error: r.error, data: r.data })).toBe("failure")
    expect(refClass()).toBe("failure")

    dispose()
  })

  it("query-core revert-cancel with no prior data: BOTH stay initial (suspense does not throw)", async () => {
    const controller = new AbortController()
    const { result: uq, queryClient, dispose } = withSetup(() =>
      useQuery({
        queryKey: ["agree-revert"],
        throwOnError: false,
        retry: false,
        suspense: true,
        queryFn: externalAbortQueryFn(controller, 99, 50)
      } as any)
    )
    const refClass = () => classify({ error: uq.error.value, data: uq.data.value })

    const suspensePromise = (uq as any).suspense() as Promise<any>
    await queryClient.cancelQueries({ queryKey: ["agree-revert"] }, { revert: true } as any)
    const r = await suspensePromise
    await tick()

    expect(classify({ error: r.error, data: r.data })).toBe("initial")
    expect(refClass()).toBe("initial")

    dispose()
  })

  // ── The DIVERGENCE: the observer is re-pointed at another query mid-flight ────

  it(
    "DIVERGENCE: reactive key changes before the first fetch settles -> "
      + "suspense() resolves with OLD-key data while resultRef is the NEW key (initial)",
    async () => {
      const id = ref("a")
      const { result: uq, dispose } = withSetup(() =>
        useQuery({
          queryKey: ["key-race", id] as any,
          throwOnError: false,
          retry: false,
          suspense: true,
          queryFn: ({ queryKey }: any) =>
            queryKey[1] === "a"
              ? new Promise<string>((res) => setTimeout(() => res("DATA_A"), 5))
              : new Promise<string>(() => {}) // "b" never settles within the window
        } as any)
      )
      const refClass = () => classify({ error: uq.error.value, data: uq.data.value })

      const suspensePromise = (uq as any).suspense() as Promise<any>
      // Navigate / cancel: the reactive arg switches to "b" before "a" settles.
      id.value = "b"
      await nextTick()

      const r = await suspensePromise
      await tick()

      // suspense() carries the OLD key's resolved data...
      expect(classify({ error: r.error, data: r.data })).toBe("success")
      expect(r.data).toBe("DATA_A")
      // ...but resultRef reflects the NEW key, which is still pending -> INITIAL, not DATA_A.
      // This is the exact "r has a valid result, but resultRef is initial" symptom.
      expect(refClass()).toBe("initial")
      expect(uq.data.value).toBeUndefined()
      expect(uq.fetchStatus.value).toBe("fetching")

      dispose()
    }
  )

  it(
    "DIVERGENCE (the real bug): scope disposed (navigate away) while fetch in-flight -> "
      + "suspense() still resolves with data, but resultRef stays initial (subscription gone)",
    async () => {
      // Mirrors bauhaus/package/index.vue: an earlier `await navigateTo()` begins tearing the
      // route component down, but the async setup keeps running and calls `packListClient.List.suspense()`.
      // That suspense fires on a component whose effect scope is being disposed.
      const { result: uq, scope } = withSetup(() =>
        useQuery({
          queryKey: ["navigate-away"],
          throwOnError: false,
          retry: false,
          suspense: true,
          queryFn: () => new Promise<number>((res) => setTimeout(() => res(777), 20))
        } as any)
      )
      const refClass = () => classify({ error: uq.error.value, data: uq.data.value })

      // suspense starts the fetch...
      const suspensePromise = (uq as any).suspense() as Promise<any>
      // ...navigation disposes the scope BEFORE the fetch settles -> onScopeDispose() unsubscribes
      // the observer, so `updateState(state, ...)` will never run again.
      scope.stop()

      const r = await suspensePromise // fetchOptimistic's own query.fetch() is independent -> resolves
      await new Promise((res) => setTimeout(res, 30))
      await tick()

      // suspense() resolved with valid data (read straight from the cache via createResult)...
      expect(classify({ error: r.error, data: r.data })).toBe("success")
      expect(r.data).toBe(777)
      // ...but the reactive ref never received it: subscription was torn down at scope.stop().
      // This is the production symptom: r valid, resultRef stuck initial, no error thrown.
      expect(refClass()).toBe("initial")
      expect(uq.data.value).toBeUndefined()
    }
  )

  it(
    "ABORT branch: signal-consuming queryFn + scope dispose mid-flight -> query-core revert-cancels "
      + "(removeObserver -> retryer.cancel({revert})). With no prior data, r is initial, not valid.",
    async () => {
      let aborted = false
      const { result: uq, scope } = withSetup(() =>
        useQuery({
          queryKey: ["navigate-away-signal"],
          throwOnError: false,
          retry: false,
          suspense: true,
          // CONSUMES `signal` like the real query.ts handler (runPromise(..., { signal })).
          // Reading context.signal flips query's #abortSignalConsumed = true.
          queryFn: ({ signal }: any) =>
            new Promise<number>((resolve, reject) => {
              const t = setTimeout(() => resolve(888), 20)
              signal.addEventListener("abort", () => {
                aborted = true
                clearTimeout(t)
                reject(new DOMException("Aborted", "AbortError"))
              })
            })
        } as any)
      )
      const refClass = () => classify({ error: uq.error.value, data: uq.data.value })

      const suspensePromise = (uq as any).suspense() as Promise<any>
      // navigation disposes scope -> last observer removed -> because signal was consumed,
      // query-core fires retryer.cancel({ revert: true }) -> internal AbortController.abort().
      scope.stop()

      let suspenseError: unknown
      let r: any
      try {
        r = await suspensePromise
      } catch (e) {
        suspenseError = e
      }
      await new Promise((res) => setTimeout(res, 30))
      await tick()

      // The underlying request WAS aborted by query-core (this is the "abort" the user asked about).
      expect(aborted).toBe(true)
      // revert + no prior data -> query.fetch throws CancelledError -> suspense (throwOnError:false)
      // resolves with the reverted getCurrentResult() == initial. So here r is INITIAL, not valid,
      // and suspense does NOT reject.
      expect(suspenseError).toBeUndefined()
      expect(classify({ error: r.error, data: r.data })).toBe("initial")
      expect(refClass()).toBe("initial")
    }
  )

  it(
    "DIVERGENCE: both keys resolve -> suspense() carries OLD data, resultRef carries NEW data "
      + "(r and resultRef disagree on value)",
    async () => {
      const id = ref("a")
      const { result: uq, dispose } = withSetup(() =>
        useQuery({
          queryKey: ["key-race-both", id] as any,
          throwOnError: false,
          retry: false,
          suspense: true,
          queryFn: ({ queryKey }: any) =>
            queryKey[1] === "a"
              ? new Promise<string>((res) => setTimeout(() => res("DATA_A"), 5))
              : new Promise<string>((res) => setTimeout(() => res("DATA_B"), 5))
        } as any)
      )

      const suspensePromise = (uq as any).suspense() as Promise<any>
      id.value = "b"
      await nextTick()

      const r = await suspensePromise
      await new Promise((res) => setTimeout(res, 25)) // let key "b" actually settle
      await tick()

      // r is pinned to the query captured by fetchOptimistic at call time (key "a")...
      expect(r.data).toBe("DATA_A")
      // ...while the ref follows the observer to key "b".
      expect(uq.data.value).toBe("DATA_B")
      // => returning `r` to the caller while the UI renders `resultRef` shows two different values.
      expect(r.data).not.toBe(uq.data.value)

      dispose()
    }
  )
})

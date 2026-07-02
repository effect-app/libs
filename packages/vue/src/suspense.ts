import { Effect } from "effect-app"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import { computed, type ComputedRef, nextTick } from "vue"

/**
 * The always-defined `data` ref behind a resolved suspense query.
 *
 * A reactive arg can re-point the view at a DIFFERENT cache atom after the suspense promise
 * resolved; the fresh atom starts `Initial` (no `previousSuccess` carried over), so the raw data
 * briefly reads `undefined` while it fetches. The suspense contract ("after the await there is
 * always a value") is kept by serving the last defined value across that transition — TanStack's
 * keepPreviousData, which Vue needs because it cannot re-suspend after mount. Waiting/failure of
 * the new fetch stays observable on the view's `result` ref.
 *
 * Throws only if there has never been a value, which is unreachable once the suspense await
 * resolved successfully.
 */
export const latestDefined = <TData>(source: () => TData | undefined, label: string): ComputedRef<TData> => {
  let last: TData | undefined
  return computed<TData>(() => {
    const latest = source()
    if (latest !== undefined) {
      last = latest
      return latest
    }
    if (last !== undefined) return last
    throw new Error(`Internal Error: ${label} resolved without a latest value`)
  })
}

export const awaitResolvedSuspenseResult = <A, E>(
  resultRef: ComputedRef<AsyncResult.AsyncResult<A, E>>
) =>
  Effect.gen(function*() {
    let result = resultRef.value

    for (let remainingTicks = 3; remainingTicks > 0 && AsyncResult.isInitial(result); remainingTicks--) {
      yield* Effect.promise(() => nextTick())
      result = resultRef.value
    }

    return result
  })

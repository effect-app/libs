import { Effect } from "effect-app"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import { type ComputedRef, nextTick } from "vue"

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

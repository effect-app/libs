import { Effect, Option } from "effect-app"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import { computed, ref } from "vue"
import { awaitResolvedSuspenseResult } from "../src/suspense.js"

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

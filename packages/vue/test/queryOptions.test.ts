import { expect, it } from "@effect/vitest"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import { shallowRef } from "vue"
import { retryTimesOf } from "../src/atomQuery.js"
import { withDataFallback } from "../src/query.js"

it("retryTimesOf: maps the TanStack retry option to a count", () => {
  expect(retryTimesOf(false)).toBe(0)
  expect(retryTimesOf(0)).toBe(0)
  expect(retryTimesOf(true)).toBe(5)
  expect(retryTimesOf(undefined)).toBe(5)
  expect(retryTimesOf(3)).toBe(3)
  expect(retryTimesOf(-2)).toBe(0)
})

it("withDataFallback: returns the raw ref untouched when neither option is set", () => {
  const raw = shallowRef(AsyncResult.initial<number, never>(false))
  expect(withDataFallback(raw, undefined)).toBe(raw)
  expect(withDataFallback(raw, {})).toBe(raw)
})

it("withDataFallback: initialData shows as resolved data while Initial, dropped on real success", () => {
  const raw = shallowRef<AsyncResult.AsyncResult<number, never>>(AsyncResult.initial(false))
  const out = withDataFallback(raw, { initialData: 7 })

  expect(out.value).toMatchObject({ _tag: "Success", value: 7, waiting: false })

  // function form
  const out2 = withDataFallback(raw, { initialData: () => 9 })
  expect(out2.value).toMatchObject({ _tag: "Success", value: 9 })

  // real data overrides the seed
  raw.value = AsyncResult.success(42)
  expect(out.value).toMatchObject({ _tag: "Success", value: 42 })
})

it("withDataFallback: placeholderData is provisional (waiting) and dropped once real data exists", () => {
  const raw = shallowRef<AsyncResult.AsyncResult<number, never>>(AsyncResult.initial(true))
  const out = withDataFallback(raw, { placeholderData: 1 })

  expect(out.value).toMatchObject({ _tag: "Success", value: 1, waiting: true })

  raw.value = AsyncResult.success(2)
  expect(out.value).toMatchObject({ _tag: "Success", value: 2, waiting: false })
})

it("withDataFallback: placeholderData function form receives the last seen concrete value", () => {
  const raw = shallowRef<AsyncResult.AsyncResult<number, never>>(AsyncResult.success(10))
  const out = withDataFallback(raw, { placeholderData: (prev: number | undefined) => (prev ?? 0) + 1 })

  // concrete value present -> shown as-is, recorded as "previous"
  expect(out.value).toMatchObject({ _tag: "Success", value: 10 })

  // input changed -> back to Initial: placeholder fn sees the previous value (10) -> keep-previous-ish
  raw.value = AsyncResult.initial(true)
  expect(out.value).toMatchObject({ _tag: "Success", value: 11, waiting: true })
})

it("withDataFallback: initialData takes precedence over placeholderData", () => {
  const raw = shallowRef<AsyncResult.AsyncResult<number, never>>(AsyncResult.initial(false))
  const out = withDataFallback(raw, { initialData: 1, placeholderData: 99 })
  expect(out.value).toMatchObject({ _tag: "Success", value: 1 })
})

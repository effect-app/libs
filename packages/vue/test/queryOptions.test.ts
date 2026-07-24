import { expect, it } from "@effect/vitest"
import * as Cause from "effect/Cause"
import * as Option from "effect/Option"
import * as AsyncResult from "effect/unstable/reactivity/AsyncResult"
import { shallowRef } from "vue"
import { withDataFallback } from "../src/query.js"

it("withDataFallback: returns the raw ref untouched when neither option is set", () => {
  const raw = shallowRef(AsyncResult.initial<number, never>(false))
  expect(withDataFallback(raw, undefined)).toBe(raw)
  expect(withDataFallback(raw, {})).toBe(raw)
})

it("withDataFallback: placeholderData is provisional (waiting) and dropped once real data exists", () => {
  const raw = shallowRef<AsyncResult.AsyncResult<number, never>>(AsyncResult.initial(true))
  const out = withDataFallback(raw, { placeholderData: 1 })

  // while pending with no value, surface the placeholder as provisional
  expect(out.value).toMatchObject({ _tag: "Success", value: 1, waiting: true })

  // real data replaces the placeholder (display-only — raw was never written)
  raw.value = AsyncResult.success(2)
  expect(out.value).toMatchObject({ _tag: "Success", value: 2, waiting: false })
})

it("withDataFallback: placeholderData function form receives the last seen concrete value", () => {
  const raw = shallowRef<AsyncResult.AsyncResult<number, never>>(AsyncResult.success(10))
  const out = withDataFallback(raw, { placeholderData: (prev: number | undefined) => (prev ?? 0) + 1 })

  // concrete value present -> shown as-is, recorded as "previous"
  expect(out.value).toMatchObject({ _tag: "Success", value: 10 })

  // input changed -> back to Initial: placeholder fn sees the previous value (10)
  raw.value = AsyncResult.initial(true)
  expect(out.value).toMatchObject({ _tag: "Success", value: 11, waiting: true })
})

it("withDataFallback: initialData shows as resolved data while Initial, dropped on real success", () => {
  const raw = shallowRef<AsyncResult.AsyncResult<number, never>>(AsyncResult.initial(false))
  const out = withDataFallback(raw, { initialData: 7 })

  expect(out.value).toMatchObject({ _tag: "Success", value: 7, waiting: false })

  const out2 = withDataFallback(raw, { initialData: () => 9 })
  expect(out2.value).toMatchObject({ _tag: "Success", value: 9 })

  raw.value = AsyncResult.success(42)
  expect(out.value).toMatchObject({ _tag: "Success", value: 42 })
})

it("withDataFallback: initialData takes precedence over placeholderData", () => {
  const raw = shallowRef<AsyncResult.AsyncResult<number, never>>(AsyncResult.initial(false))
  const out = withDataFallback(raw, { initialData: 1, placeholderData: 99 })
  expect(out.value).toMatchObject({ _tag: "Success", value: 1 })
})

it("withDataFallback: select applies to the placeholder when layered after the fallback", () => {
  // mirrors makeQueryView: fallback pre-select, then AsyncResult.map(select)
  const raw = shallowRef<AsyncResult.AsyncResult<number, never>>(AsyncResult.initial(true))
  const fallback = withDataFallback(raw, { placeholderData: 123 })
  const selected = () => AsyncResult.map(fallback.value, (n) => n.toString())

  expect(selected()).toMatchObject({ _tag: "Success", value: "123", waiting: true })

  raw.value = AsyncResult.success(456)
  expect(selected()).toMatchObject({ _tag: "Success", value: "456", waiting: false })
})

it("withDataFallback: does not mask Failure without previousSuccess", () => {
  const fail = AsyncResult.failure<number, string>(Cause.fail("boom"))
  const raw = shallowRef<AsyncResult.AsyncResult<number, string>>(fail)
  const out = withDataFallback(raw, { placeholderData: 1, initialData: 2 })

  // Failure has no value — old gate would have fabricated Success; must pass Failure through
  expect(out.value).toBe(fail)
  expect(AsyncResult.isFailure(out.value)).toBe(true)
})

it("withDataFallback: Failure with previousSuccess still surfaces as Failure", () => {
  const fail = AsyncResult.failureWithPrevious<number, string>(Cause.fail("boom"), {
    previous: Option.some(AsyncResult.success(10))
  })
  const raw = shallowRef<AsyncResult.AsyncResult<number, string>>(fail)
  const out = withDataFallback(raw, { placeholderData: 99 })

  expect(out.value).toBe(fail)
  expect(AsyncResult.isFailure(out.value)).toBe(true)
})

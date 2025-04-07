import { S } from "effect-app"
import { test } from "vitest"
import { copyOrigin } from "../src/utils.js"

test("works with class", () => {
  class Banana {
    name: string
    state: { a: string; _tag: "a" } | { b: number; _tag: "b" }

    constructor(params: { name: string; state: { a: string; _tag: "a" } | { b: number; _tag: "b" } }) {
      this.name = params.name
      this.state = params.state
    }
  }

  const copyBanana = copyOrigin(Banana)

  const original = new Banana({ name: "banana", state: { a: "a", _tag: "a" } })

  const res1 = copyBanana(
    original,
    (_) => ({ state: { b: 1, _tag: "b" } })
  ) satisfies Banana // must be assignable to Banana

  expectTypeOf(res1).toEqualTypeOf<{
    name: string
    state: {
      b: number
      _tag: "b"
    }
  }>()

  expect(res1).toEqual({
    name: "banana",
    state: { b: 1, _tag: "b" }
  })

  expect(Object.getPrototypeOf(res1)).toEqual(Banana.prototype)

  const res2 = copyBanana(
    original,
    { state: { b: 1, _tag: "b" } }
  ) satisfies Banana // must be assignable to Banana

  expectTypeOf(res2).toEqualTypeOf<{
    name: string
    state: {
      b: number
      _tag: "b"
    }
  }>()

  expect(res2).toEqual({
    name: "banana",
    state: { b: 1, _tag: "b" }
  })

  expect(Object.getPrototypeOf(res2)).toEqual(Banana.prototype)

  const res3 = copyBanana(
    res2,
    { state: { a: "a", _tag: "a" } }
  ) satisfies Banana // must be assignable to Banana

  expectTypeOf(res3).toEqualTypeOf<{
    name: string
    state: {
      a: string
      _tag: "a"
    }
  }>()

  expect(res3).toEqual({
    name: "banana",
    state: { a: "a", _tag: "a" }
  })

  expect(Object.getPrototypeOf(res3)).toEqual(Banana.prototype)

  // @ts-expect-error extraProp is not a valid property of Banana
  copyBanana(
    original,
    { name: "string", extraProp: "whatever" }
  )

  // @ts-expect-error extraProp is not a valid property of Banana
  copyBanana(
    original,
    { extraProp: "whatever" }
  )

  const res4 = copyBanana(
    original,
    (o) => o
  ) satisfies Banana // must be assignable to Banana

  expectTypeOf(res4).toEqualTypeOf<{
    name: string
    state: {
      a: string
      _tag: "a"
    } | {
      b: number
      _tag: "b"
    }
  }>()
})

test("works with schema class", () => {
  class Banana extends S.Class<Banana>()({
    name: S.String,
    state: S.Union(
      S.Struct({ a: S.String, _tag: S.Literal("a") }),
      S.Struct({ b: S.Number, _tag: S.Literal("b") })
    )
  }) {}

  const copyBanana = copyOrigin(Banana)

  const original = new Banana({ name: "banana", state: { a: "a", _tag: "a" } })

  const res1 = copyBanana(
    original,
    (_) => ({ state: { b: 1, _tag: "b" } })
  ) satisfies Banana // must be assignable to Banana

  expectTypeOf(res1).toEqualTypeOf<{
    name: string
    state: {
      b: number
      _tag: "b"
    }
  }>()

  expect(res1).toEqual({
    name: "banana",
    state: { b: 1, _tag: "b" }
  })

  expect(Object.getPrototypeOf(res1)).toEqual(Banana.prototype)

  const res2 = copyBanana(
    original,
    { state: { b: 1, _tag: "b" } }
  ) satisfies Banana // must be assignable to Banana

  expectTypeOf(res2).toEqualTypeOf<{
    name: string
    state: {
      b: number
      _tag: "b"
    }
  }>()

  expect(res2).toEqual({
    name: "banana",
    state: { b: 1, _tag: "b" }
  })

  expect(Object.getPrototypeOf(res2)).toEqual(Banana.prototype)

  const res3 = copyBanana(
    res2,
    { state: { a: "a", _tag: "a" } }
  ) satisfies Banana // must be assignable to Banana

  expectTypeOf(res3).toEqualTypeOf<{
    name: string
    state: {
      a: string
      _tag: "a"
    }
  }>()

  expect(res3).toEqual({
    name: "banana",
    state: { a: "a", _tag: "a" }
  })

  expect(Object.getPrototypeOf(res3)).toEqual(Banana.prototype)

  // @ts-expect-error extraProp is not a valid property of Banana
  copyBanana(
    original,
    { name: "string", extraProp: "whatever" }
  )

  // @ts-expect-error extraProp is not a valid property of Banana
  copyBanana(
    original,
    { extraProp: "whatever" }
  )

  const res4 = copyBanana(
    original,
    (o) => o
  ) satisfies Banana // must be assignable to Banana

  expectTypeOf(res4).toEqualTypeOf<{
    name: string
    state: {
      readonly a: string
      readonly _tag: "a"
    } | {
      readonly b: number
      readonly _tag: "b"
    }
  }>()
})

import { copyOrigin } from "../src/utils.js"

import { test } from "vitest"

class Banana {
  name: string
  state: { a: string; _tag: "a" } | { b: number; _tag: "b" }

  constructor(params: { name: string; state: { a: string; _tag: "a" } | { b: number; _tag: "b" } }) {
    this.name = params.name
    this.state = params.state
  }
}

const copyBanana = copyOrigin(Banana)

test("works", () => {
  const original = new Banana({ name: "banana", state: { a: "a", _tag: "a" } })

  const res1 = copyBanana(
    original,
    (_) => ({ state: { b: 1, _tag: "b" as const } })
  )

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
})

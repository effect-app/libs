import type { Ops } from "effect-app/Model/filter/filterApi"
import * as S from "effect-app/Schema"
import * as Getter from "effect/SchemaGetter"
import { describe, expect, it } from "vitest"
import { jsonifyFilter } from "../src/Store/utils.js"

class Day {
  readonly ymd: string
  constructor(ymd: string) {
    this.ymd = ymd
  }
}

const DayFromSelf = S.declare((u): u is Day => u instanceof Day, {
  expected: "Day",
  toCodecJson: () =>
    S.link<Day>()(
      S.String,
      {
        decode: Getter.transform((s: string) => new Day(s)),
        encode: Getter.transform((d: Day) => d.ymd)
      }
    )
})

const where = (path: string, op: Ops, value: unknown) => ({
  t: "where" as const,
  path,
  op,
  value
})

describe("jsonifyFilter Encoded key paths", () => {
  it("lowers encodeKeys-renamed native Encoded values via the Encoded field name", () => {
    const schema = S
      .Struct({
        id: S.String,
        day: DayFromSelf
      })
      .pipe(S.encodeKeys({ day: "the_day" }))
    const day = new Day("2024-06-01")
    expect(jsonifyFilter([where("the_day", "eq", day)], schema)).toEqual([
      where("the_day", "eq", "2024-06-01")
    ])
  })

  it("lowers Class.pipe(encodeKeys) using Encoded names, not Type .fields", () => {
    class Doc extends S.Class<Doc>("JsonLowerEncodeKeysDoc")({
      id: S.String,
      day: DayFromSelf,
      tags: S.NonEmptyArray(S.String)
    }) {}
    const schema = Doc.pipe(S.encodeKeys({ day: "the_day" }))
    const day = new Day("2024-06-01")
    expect(jsonifyFilter([where("the_day", "eq", day)], schema)).toEqual([
      where("the_day", "eq", "2024-06-01")
    ])
    expect(jsonifyFilter([where("id", "in", ["d1"])], schema)).toEqual([
      where("id", "in", ["d1"])
    ])
    expect(jsonifyFilter([where("tags", "includes-any", ["a"])], schema)).toEqual([
      where("tags", "includes-any", ["a"])
    ])
  })

  it("does not encode scalar `in` values through an array field renamed onto Encoded `id`", () => {
    class Doc extends S.Class<Doc>("JsonLowerSwappedKeysDoc")({
      id: S.String,
      items: S.NonEmptyArray(S.String)
    }) {}
    const schema = Doc.pipe(S.encodeKeys({ items: "id", id: "item_id" }))
    expect(jsonifyFilter([where("item_id", "in", ["d1"])], schema)).toEqual([
      where("item_id", "in", ["d1"])
    ])
    expect(jsonifyFilter([where("id", "includes-any", ["a"])], schema)).toEqual([
      where("id", "includes-any", ["a"])
    ])
  })

  it("lowers TaggedUnion Opaque `id in`", () => {
    const identity = S.Struct({ id: S.String, layout: S.String })
    class Available extends S.Opaque<Available>()(S.TaggedStruct("available", { ...identity.fields })) {}
    class Reserved extends S.Opaque<Reserved>()(
      S.TaggedStruct("reserved", { ...identity.fields, reservation: S.String })
    ) {}
    const Cart = S.TaggedUnion([Available, Reserved])
    expect(jsonifyFilter([where("id", "in", ["cart-1"])], Cart)).toEqual([
      where("id", "in", ["cart-1"])
    ])
  })

  it("lowers TaggedClass union array includes-any through the element schema", () => {
    class Picking extends S.TaggedClass<Picking>()("picking", {
      id: S.String,
      cartIds: S.NonEmptyArray(S.String),
      createdAt: S.Date
    }) {}
    class Assembling extends S.TaggedClass<Assembling>()("assembling", {
      id: S.String,
      cartIds: S.NonEmptyArray(S.String),
      createdAt: S.Date
    }) {}
    const Batch = S.TaggedUnion([Picking, Assembling])
    const at = new Date("2024-06-01T00:00:00.000Z")
    expect(jsonifyFilter([where("id", "in", ["batch-1"])], Batch)).toEqual([
      where("id", "in", ["batch-1"])
    ])
    expect(jsonifyFilter([where("cartIds", "includes-any", ["cart-1"])], Batch)).toEqual([
      where("cartIds", "includes-any", ["cart-1"])
    ])
    expect(jsonifyFilter([where("createdAt", "eq", at)], Batch)).toEqual([
      where("createdAt", "eq", at.toISOString())
    ])
  })
})

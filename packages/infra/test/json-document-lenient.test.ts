import * as S from "effect-app/Schema"
import * as Getter from "effect/SchemaGetter"
import { describe, expect, it } from "vitest"
import { makeJsonDocumentCodec } from "../src/Store/jsonDocument.js"

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

class Shop extends S.Class<Shop>("LenientShop")({
  id: S.String,
  name: S.NonEmptyString255,
  createdAt: S.Date,
  updatedAt: S.Date,
  vatRate: S.Number,
  day: DayFromSelf,
  tags: S.ReadonlySet(S.String),
  meta: S.ReadonlyMap({ key: S.String, value: S.String })
}) {}

const shopCodec = makeJsonDocumentCodec<typeof Shop.Encoded>(Shop)

const completeShop = {
  id: "shop-1",
  name: "Shop One",
  createdAt: "2024-06-01T00:00:00.000Z",
  updatedAt: "2024-06-02T00:00:00.000Z",
  vatRate: 19,
  day: "2024-06-01",
  tags: ["a", "b"],
  meta: [["k", "v"]]
}

// the configurator shape: conditionGroups[].conditions[].rules[].groupId
class Rule extends S.Class<Rule>("LenientRule")({
  id: S.String,
  groupId: S.String,
  at: S.Date
}) {}

class Condition extends S.Class<Condition>("LenientCondition")({
  id: S.String,
  rules: S.Array(Rule)
}) {}

class ConditionGroup extends S.Class<ConditionGroup>("LenientConditionGroup")({
  id: S.String,
  conditions: S.Array(Condition)
}) {}

class Configurator extends S.Class<Configurator>("LenientConfigurator")({
  id: S.String,
  conditionGroups: S.Array(ConditionGroup)
}) {}

class Picking extends S.TaggedClass<Picking>()("picking", {
  id: S.String,
  pickedAt: S.Date,
  picker: S.String
}) {}

class Assembling extends S.TaggedClass<Assembling>()("assembling", {
  id: S.String,
  assembledAt: S.Date
}) {}

class Batch extends S.Class<Batch>("LenientBatch")({
  id: S.String,
  state: S.Union([Picking, Assembling])
}) {}

describe("makeJsonDocumentCodec lenient decode", () => {
  it("lowers JSON to native Encoded values for a complete document", () => {
    const decoded = shopCodec.decode({ ...completeShop, _etag: "e1" } as never) as Record<string, unknown>
    expect(decoded["createdAt"]).toBeInstanceOf(Date)
    expect((decoded["createdAt"] as Date).toISOString()).toBe("2024-06-01T00:00:00.000Z")
    expect(decoded["tags"]).toBeInstanceOf(Set)
    expect([...(decoded["tags"] as Set<string>)]).toEqual(["a", "b"])
    expect(decoded["meta"]).toBeInstanceOf(Map)
    expect([...(decoded["meta"] as Map<string, string>)]).toEqual([["k", "v"]])
    expect(decoded["day"]).toBeInstanceOf(Day)
    expect((decoded["day"] as Day).ymd).toBe("2024-06-01")
    expect(decoded["_etag"]).toBe("e1")
  })

  it("decodes a document missing a required top-level key, leaving it absent", () => {
    const { vatRate: _vatRate, ...legacy } = completeShop
    const decoded = shopCodec.decode(legacy as never) as Record<string, unknown>
    expect("vatRate" in decoded).toBe(false)
    // the keys that are present are still lowered
    expect(decoded["createdAt"]).toBeInstanceOf(Date)
    expect(decoded["tags"]).toBeInstanceOf(Set)
  })

  it("decodes a key missing inside array[].struct[].field, lowering its siblings", () => {
    const codec = makeJsonDocumentCodec<typeof Configurator.Encoded>(Configurator)
    const decoded = codec.decode({
      id: "cfg-1",
      conditionGroups: [{
        id: "group-1",
        conditions: [{
          id: "condition-1",
          // legacy rule: no `groupId`
          rules: [{ id: "rule-1", at: "2024-06-01T00:00:00.000Z" }]
        }]
      }]
    } as never) as any
    const rule = decoded.conditionGroups[0].conditions[0].rules[0]
    expect("groupId" in rule).toBe(false)
    expect(rule.id).toBe("rule-1")
    expect(rule.at).toBeInstanceOf(Date)
  })

  it("decodes a tagged-union field through the matching member", () => {
    const codec = makeJsonDocumentCodec<typeof Batch.Encoded>(Batch)
    const decoded = codec.decode({
      id: "batch-1",
      state: { _tag: "assembling", id: "state-1", assembledAt: "2024-06-01T00:00:00.000Z" }
    } as never) as any
    expect(decoded.state._tag).toBe("assembling")
    expect(decoded.state.assembledAt).toBeInstanceOf(Date)

    // a key missing inside the matching member does not throw
    const legacy = codec.decode({
      id: "batch-2",
      state: { _tag: "picking", id: "state-2", pickedAt: "2024-06-01T00:00:00.000Z" }
    } as never) as any
    expect(legacy.state._tag).toBe("picking")
    expect(legacy.state.pickedAt).toBeInstanceOf(Date)
    expect("picker" in legacy.state).toBe(false)
  })

  it("passes an unparseable leaf through unchanged instead of throwing", () => {
    const decoded = shopCodec.decode({ ...completeShop, updatedAt: null } as never) as Record<string, unknown>
    expect(decoded["updatedAt"]).toBe(null)
    expect(decoded["createdAt"]).toBeInstanceOf(Date)

    const invalid = shopCodec.decode({ ...completeShop, createdAt: "not-a-date" } as never) as Record<string, unknown>
    expect(invalid["createdAt"]).toBe("not-a-date")
  })

  it("does not enforce refinements or checks at the store boundary", () => {
    const decoded = shopCodec.decode({ ...completeShop, name: "", vatRate: Number.NaN } as never) as Record<
      string,
      unknown
    >
    expect(decoded["name"]).toBe("")
    expect(decoded["vatRate"]).toBeNaN()
  })

  it("still round-trips a complete document through encode", () => {
    const decoded = shopCodec.decode(completeShop as never)
    expect(shopCodec.encode(decoded)).toEqual(completeShop)
  })
})

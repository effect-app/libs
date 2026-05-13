/* eslint-disable @typescript-eslint/no-explicit-any */
import * as S from "effect-app/Schema"
import { describe, expect, it } from "vitest"
import { and, computed, make, projectComputed, relation, toFilter, where } from "../src/Model/query.js"
import { buildWhereCosmosQuery3 } from "../src/Store/Cosmos/query.js"

class Order extends S.Class<Order>("Order")({
  id: S.String,
  packages: S.Array(S.Struct({ id: S.String, weight: S.Finite }))
}) {}

type OrderEnc = S.Codec.Encoded<typeof Order>

// Length projection via `relation(...).length()` should emit a scalar
// ARRAY_LENGTH expression rather than pulling (or reshaping) the array.
describe("cosmos query projection: array length", () => {
  it("projects packages length via ARRAY_LENGTH", () => {
    const q = make<OrderEnc>().pipe(
      projectComputed(
        S.Struct({ id: S.String, packageCount: S.NonNegativeInt }),
        computed({ packageCount: relation<OrderEnc>("packages").length() })
      )
    )

    const ir = toFilter(q as any, Order as any)

    const result = buildWhereCosmosQuery3(
      "id",
      ir.filter ?? [],
      "Orders",
      {},
      ir.select as any
    )

    expect(result.query).toMatch(/ARRAY_LENGTH\(f(?:\.packages|\["packages"\])\)/)
    expect(result.query).toContain("AS packageCount")
    // Must not pull the full array nor reshape via subquery
    expect(result.query).not.toMatch(/ARRAY\s*\(\s*SELECT[^)]*FROM\s+t\s+in\s+f[\.\["]/i)
    expect(result.query).not.toMatch(/SELECT VALUE COUNT/)
  })
})

// Regression: `relation-every` previously walked its filter twice (once for the
// shared `where` variable, once for the NOT-EXISTS branch), double-bumping the
// shared `i` counter and shifting every subsequent @v index against the bound
// params array. Verify each filter element binds exactly one parameter and that
// @v indices in the emitted SQL line up with the bindings.
describe("cosmos query projection: relation-every parameter binding", () => {
  class Item extends S.Class<Item>("Item")({
    state: S.Struct({ _tag: S.Literals(["initial", "picking", "picked", "packed"]) })
  }) {}
  class DN extends S.Class<DN>("DN")({
    id: S.String,
    state: S.Struct({
      _tag: S.Literals(["initial", "valid", "packed", "closed"]),
      at: S.String
    }),
    items: S.Array(Item)
  }) {}
  type DNEnc = S.Codec.Encoded<typeof DN>

  it("binds @v indices contiguously across every + main filter", () => {
    const q = make<DNEnc>().pipe(
      where("state.at", "gte", "2026-05-01T00:00:00.000Z"),
      and("state._tag", "neq", "closed"),
      projectComputed(
        S.Struct({
          id: S.String,
          allItemsPicked: S.Boolean,
          allItemsPacked: S.Boolean
        }),
        computed({
          allItemsPicked: relation<DNEnc>("items").every(where("state._tag", "picked")),
          allItemsPacked: relation<DNEnc>("items").every(where("state._tag", "packed"))
        })
      )
    )

    const ir = toFilter(q as any, DN as any)
    const result = buildWhereCosmosQuery3("id", ir.filter ?? [], "DN", {}, ir.select as any)

    // Each filter element binds exactly one parameter: 2 every filters + 2 main filter = 4.
    expect(result.parameters).toHaveLength(4)
    expect(result.parameters.map((_) => _.value)).toEqual([
      "picked",
      "packed",
      "2026-05-01T00:00:00.000Z",
      "closed"
    ])

    // SQL must reference exactly @v0..@v3 in order, no gaps, no overruns.
    const refs = [...result.query.matchAll(/@v\d+/g)].map((m) => m[0])
    expect(refs).toEqual(["@v0", "@v1", "@v2", "@v3"])
  })
})

describe("cosmos query: aggregate (GROUP BY + agg functions)", () => {
  it("generates GROUP BY and SUM(IIF(...)) for agg-count-when", () => {
    const result = buildWhereCosmosQuery3(
      "id",
      [],
      "Orders",
      {},
      [
        { key: "city", path: "address.city" },
        {
          key: "activeCount",
          aggregate: {
            _tag: "agg-count-when",
            filter: [{ t: "where", path: "status", op: "eq", value: "active" }]
          }
        },
        { key: "total", aggregate: { _tag: "agg-count" } }
      ] as any
    )

    expect(result.query).toContain("GROUP BY")
    expect(result.query).toContain("SUM(IIF(")
    expect(result.query).toContain("COUNT(1) AS total")
    expect(result.query).toContain("AS city")
    expect(result.parameters[0]!.value).toBe("active")
  })

  it("generates agg-sum / agg-min / agg-max expressions", () => {
    const result = buildWhereCosmosQuery3(
      "id",
      [],
      "Orders",
      {},
      [
        { key: "dept", path: "dept" },
        { key: "totalSalary", aggregate: { _tag: "agg-sum", field: "salary" } },
        { key: "minSalary", aggregate: { _tag: "agg-min", field: "salary" } },
        { key: "maxSalary", aggregate: { _tag: "agg-max", field: "salary" } }
      ] as any
    )

    expect(result.query).toContain(`SUM(f["salary"]) AS totalSalary`)
    expect(result.query).toContain(`MIN(f["salary"]) AS minSalary`)
    expect(result.query).toContain(`MAX(f["salary"]) AS maxSalary`)
    expect(result.query).toMatch(/GROUP BY f(?:\.dept|\["dept"\])/)
  })

  it("generates correct GROUP BY for nested path field", () => {
    const result = buildWhereCosmosQuery3(
      "id",
      [],
      "Orders",
      {},
      [
        { key: "city", path: "address.city" },
        { key: "count", aggregate: { _tag: "agg-count" } }
      ] as any
    )

    // Must GROUP BY the nested path in Cosmos access notation
    expect(result.query).toMatch(/GROUP BY f(?:\.address\.city|\["address"\]\["city"\])/)
  })
})

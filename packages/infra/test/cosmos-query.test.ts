/* eslint-disable @typescript-eslint/no-explicit-any */
import * as S from "effect-app/Schema"
import { describe, expect, it } from "vitest"
import { computed, make, projectComputed, relation, toFilter } from "../src/Model/query.js"
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

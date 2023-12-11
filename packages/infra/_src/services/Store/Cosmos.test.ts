import type { StoreWhereFilter, Where } from "@effect-app/infra/services/Store"
import { Filters, makeFilters } from "../../filter.js"
import { buildWhereCosmosQuery } from "./Cosmos/query.js"

const f_ = makeFilters<Something>()
export type SomethingWhereFilter = typeof f_

export function makeSomethingFilter_(filter: (f: SomethingWhereFilter) => StoreWhereFilter) {
  return filter(f_)
}

export function somethingsWhere(
  makeWhere: (
    f: SomethingWhereFilter
  ) => Where | [Where, ...Where[]],
  mode?: "or" | "and"
) {
  return makeSomethingFilter_((f) => {
    const m = makeWhere ? makeWhere(f) : []
    return ({
      mode,
      where: (Array.isArray(m) ? m as unknown as [Where, ...Where[]] : [m]) as readonly [Where, ...Where[]]
    })
  })
}

type SomethingElse = {
  a: string
  b: number
}

type Something = {
  a: number
  id: string
  b: string
  c: readonly string[]
  d: readonly SomethingElse[]
}

test("works", () => {
  expect(buildWhereCosmosQuery(
    somethingsWhere((_) => _("b", (_) => "b2")),
    "Somethings",
    "importedMarkerId",
    undefined,
    10
  ))
    .toEqual({
      "parameters": [
        {
          "name": "@id",
          "value": "importedMarkerId"
        },
        {
          "name": "@v0",
          "value": "b2"
        }
      ],
      "query": `
    SELECT *
    FROM Somethings f
    
    WHERE f.id != @id AND LOWER(f.b) = LOWER(@v0)
    OFFSET 0 LIMIT 10`
    })

  expect(buildWhereCosmosQuery(
    somethingsWhere((_) => _("d.-1.a", Filters.isnt("a2"))),
    "Somethings",
    "importedMarkerId",
    undefined,
    10
  ))
    .toEqual({
      "parameters": [
        {
          "name": "@id",
          "value": "importedMarkerId"
        },
        {
          "name": "@v0",
          "value": "a2"
        }
      ],
      "query": `
    SELECT *
    FROM Somethings f
    JOIN d IN f.d
    WHERE f.id != @id AND LOWER(d.a) <> LOWER(@v0)
    OFFSET 0 LIMIT 10`
    })
})

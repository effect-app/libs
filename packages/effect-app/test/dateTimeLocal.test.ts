import { makeZonedLocal, pipeZonedLocal } from "effect-app/DateTime"
import * as DateTime from "effect/DateTime"
import { describe, expect, test } from "vitest"

describe("local Date helpers", () => {
  const start = new Date("2024-03-09T17:00:00.000Z")

  test("makeZonedLocal keeps the instant and uses the process zone", () => {
    const zoned = makeZonedLocal(start)
    expect(zoned.epochMilliseconds).toBe(start.getTime())
    expect(DateTime.zoneToString(zoned.zone)).toBe(DateTime.zoneToString(DateTime.zoneMakeLocal()))
  })

  test("pipeZonedLocal adds a local calendar day and returns the instant", () => {
    const expected = new Date(start.getTime())
    expected.setDate(expected.getDate() + 1)
    expect(pipeZonedLocal(start, DateTime.add({ days: 1 })).getTime()).toBe(expected.getTime())
  })

  test("pipeZonedLocal runs every step before toDateUtc", () => {
    const expected = new Date(start.getTime())
    expected.setDate(expected.getDate() + 1)
    expected.setMonth(expected.getMonth() + 1)
    const result = pipeZonedLocal(start, DateTime.add({ days: 1 }), DateTime.add({ months: 1 }))
    expect(result.getTime()).toBe(expected.getTime())
  })
})

import { describe, expect, it } from "vitest"
import { computed, isProxy, isReactive, isRef, reactive, ref } from "vue"
import { deepToRaw } from "../src/lib.js"

type DeepMapKey = { id: string } | "list"
type DeepMapValue = { nestedSet: Set<{ ok: boolean } | Date> } | Array<{ count: number }>
type DeepSetValue = Map<string, { value: number }> | Array<{ value: number }>

const expectPlainDeep = (value: unknown): void => {
  expect(isRef(value)).toBe(false)
  expect(isReactive(value)).toBe(false)
  expect(isProxy(value)).toBe(false)

  if (Array.isArray(value)) {
    value.forEach(expectPlainDeep)
    return
  }

  if (value instanceof Map) {
    value.forEach((entryValue, entryKey) => {
      expectPlainDeep(entryKey)
      expectPlainDeep(entryValue)
    })
    return
  }

  if (value instanceof Set) {
    value.forEach((entry) => {
      expectPlainDeep(entry)
    })
    return
  }

  if (value instanceof Date) {
    return
  }

  if (value && typeof value === "object") {
    Object.values(value).forEach(expectPlainDeep)
  }
}

describe("deepToRaw", () => {
  it("supports non-object root inputs", () => {
    expect(deepToRaw(1)).toBe(1)
    expect(deepToRaw("x")).toBe("x")
    expect(deepToRaw(null)).toBe(null)
    expect(deepToRaw(undefined)).toBe(undefined)
    expect(deepToRaw(ref(123))).toBe(123)

    const rootArray = deepToRaw(reactive([reactive({ n: 1 }), ref(2)]))
    expect(rootArray).toEqual([{ n: 1 }, 2])
    expect(Array.isArray(rootArray)).toBe(true)

    const rootMap = deepToRaw(
      reactive(new Map<string, unknown>([["k", reactive({ n: 1 })], ["r", ref(2)]]))
    )
    expect(rootMap).toBeInstanceOf(Map)
    expect(rootMap.get("k")).toEqual({ n: 1 })
    expect(rootMap.get("r")).toBe(2)

    const rootSet = deepToRaw(reactive(new Set([reactive({ n: 1 }), ref(2)])))
    expect(rootSet).toBeInstanceOf(Set)
    expect(Array.from(rootSet)).toEqual([{ n: 1 }, 2])

    const date = new Date("2024-02-03T00:00:00.000Z")
    const rootDate = deepToRaw(date)
    expect(rootDate).toBeInstanceOf(Date)
    expect(rootDate).not.toBe(date)
    expect(rootDate.toISOString()).toBe(date.toISOString())
  })

  it("unwraps nested objects and arrays without leaving vue proxies behind", () => {
    const source = reactive({
      list: [
        reactive({
          nested: reactive({
            count: 1,
            items: [reactive({ label: "a" }), reactive({ label: "b" })]
          })
        })
      ],
      plain: reactive({ ok: true })
    })

    const result = deepToRaw(source)

    expect(Array.isArray(result.list)).toBe(true)
    expect(Array.isArray(result.list[0]?.nested.items)).toBe(true)
    expect(result).toEqual({
      list: [{ nested: { count: 1, items: [{ label: "a" }, { label: "b" }] } }],
      plain: { ok: true }
    })
    expectPlainDeep(result)
  })

  it("preserves maps and sets while deeply unwrapping nested entries", () => {
    const key = reactive({ id: "key" })
    const nestedDate = new Date("2024-01-02T03:04:05.000Z")
    const map = reactive(
      new Map<DeepMapKey, DeepMapValue>([
        [key, reactive({ nestedSet: reactive(new Set([{ ok: true }, nestedDate])) })],
        ["list", reactive([{ count: 2 }])]
      ])
    )
    const set = reactive(
      new Set<DeepSetValue>([
        reactive(new Map([["deep", reactive({ value: 3 })]])),
        reactive([{ value: 4 }])
      ])
    )
    const source = reactive({
      map,
      set
    })

    const result = deepToRaw(source)

    expect(result.map).toBeInstanceOf(Map)
    expect(result.set).toBeInstanceOf(Set)

    const entries = Array.from(result.map.entries())
    expect(entries[0]?.[0]).toEqual({ id: "key" })
    expect(entries[0]?.[0]).not.toBe(key)
    expect(entries[0]?.[1]).toEqual({ nestedSet: new Set([{ ok: true }, nestedDate]) })
    expect(entries[1]?.[1]).toEqual([{ count: 2 }])

    const setValues = Array.from(result.set.values())
    expect(setValues[0]).toBeInstanceOf(Map)
    expect(setValues[1]).toEqual([{ value: 4 }])
    expect((setValues[0] as Map<string, { value: number }>).get("deep")).toEqual({ value: 3 })

    expectPlainDeep(result)
  })

  it("keeps nested dates as dates, including dates reached through refs", () => {
    const date = new Date("2025-06-07T08:09:10.000Z")
    const source = reactive({
      createdAt: date,
      nested: reactive({
        updatedAt: ref(date),
        list: [ref(date)],
        map: reactive(new Map([["at", ref(date)]])),
        set: reactive(new Set([ref(date)]))
      })
    })

    const result = deepToRaw(source)

    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.nested.updatedAt).toBeInstanceOf(Date)
    expect(result.nested.list[0]).toBeInstanceOf(Date)
    expect(result.nested.map).toBeInstanceOf(Map)
    expect(result.nested.set).toBeInstanceOf(Set)

    const updatedAt = result.nested.updatedAt
    const firstListDate = result.nested.list[0]
    const mappedDate = result.nested.map.get("at")
    const firstSetDate = Array.from(result.nested.set)[0]

    if (!(updatedAt instanceof Date)) {
      throw new Error("expected updatedAt to be a Date")
    }

    if (!(firstListDate instanceof Date)) {
      throw new Error("expected first list item to be a Date")
    }

    if (!(mappedDate instanceof Date)) {
      throw new Error("expected mapped date to be a Date")
    }

    if (!(firstSetDate instanceof Date)) {
      throw new Error("expected first set item to be a Date")
    }

    expect(result.createdAt.toISOString()).toBe(date.toISOString())
    expect(updatedAt.toISOString()).toBe(date.toISOString())
    expect(firstListDate.toISOString()).toBe(date.toISOString())
    expect(mappedDate.toISOString()).toBe(date.toISOString())
    expect(firstSetDate.toISOString()).toBe(date.toISOString())

    expectPlainDeep(result)
  })

  it("unwraps computed values nested in refs/plain objects and deepToRawes the computed result", () => {
    const source = {
      innerRef: ref({
        computedValue: computed(() =>
          reactive({
            list: [reactive({ n: 1 }), reactive({ n: 2 })],
            map: reactive(new Map([["k", reactive({ nested: true })]])),
            set: reactive(new Set([reactive({ fromSet: true })]))
          })
        )
      }),
      plainComputed: computed(() => reactive({ date: ref(new Date("2025-01-01T00:00:00.000Z")) }))
    }

    const result = deepToRaw(source)

    expect(result).toEqual({
      innerRef: {
        computedValue: {
          list: [{ n: 1 }, { n: 2 }],
          map: new Map([["k", { nested: true }]]),
          set: new Set([{ fromSet: true }])
        }
      },
      plainComputed: {
        date: new Date("2025-01-01T00:00:00.000Z")
      }
    })

    const innerRefValue = Reflect.get(result, "innerRef")
    if (!innerRefValue || typeof innerRefValue !== "object") {
      throw new Error("expected innerRef to be an object")
    }

    const computedValue = Reflect.get(innerRefValue, "computedValue")
    if (!computedValue || typeof computedValue !== "object") {
      throw new Error("expected computedValue to be an object")
    }

    const computedMap = Reflect.get(computedValue, "map")
    const computedSet = Reflect.get(computedValue, "set")

    const plainComputedValue = Reflect.get(result, "plainComputed")
    if (!plainComputedValue || typeof plainComputedValue !== "object") {
      throw new Error("expected plainComputed to be an object")
    }

    const computedDate = Reflect.get(plainComputedValue, "date")

    expect(computedMap).toBeInstanceOf(Map)
    expect(computedSet).toBeInstanceOf(Set)
    expect(computedDate).toBeInstanceOf(Date)
    expectPlainDeep(result)
  })
})

import { describe, expect, it } from "@effect/vitest"
import { Array, Config, Effect, flow, Layer, Logger, LogLevel, ManagedRuntime, Option, Redacted, S } from "effect-app"
import { LogLevels } from "effect-app/utils"
import { setupRequestContextFromCurrent } from "../src/api/setupRequest.js"
import { type FieldValues } from "../src/Model/filter/types.js"
import { type FieldPath } from "../src/Model/filter/types/path/eager.js"
import { and, or, project, type Query, type QueryWhere, Where, where } from "../src/Model/query.js"
import { makeRepo } from "../src/Model/Repository/makeRepo.js"
import { CosmosStoreLayer } from "../src/Store/Cosmos.js"
import { MemoryStoreLive } from "../src/Store/Memory.js"

type Every = {
  <
    TFieldValues extends FieldValues,
    TFieldName extends FieldPath<TFieldValues>
  >(
    path: TFieldName,
    dude: (
      current: Query<TFieldValues[TFieldName][number]>
    ) => QueryWhere<TFieldValues[TFieldName][number], TFieldValues[TFieldName][number], false>
  ): (
    current: Query<TFieldValues>
  ) => QueryWhere<TFieldValues, TFieldValues, false>
}

const every: Every = (subPath, operation) => (current) =>
  new Where({ current, operation, relation: "every", subPath } as any)
const some: Every = (subPath, operation) => (current) =>
  new Where({ current, operation, relation: "some", subPath } as any)

export const rt = ManagedRuntime.make(Layer.mergeAll(
  Layer.effect(
    LogLevels,
    LogLevels.pipe(Effect.map((_) => {
      const m = new Map(_)
      m.set("@effect-app/infra", "debug")
      return m
    }))
  ),
  Logger.minimumLogLevel(LogLevel.Debug)
))

class Something extends S.Class<Something>()({
  id: S.String,
  name: S.String,
  description: S.String,
  items: S.Array(S.Struct({ id: S.String, value: S.Number, description: S.String }))
}) {}

const items = [
  new Something({
    id: "1",
    name: "Item 1",
    description: "This is the first item",
    items: [
      { id: "1-1", value: 10, description: "First item" },
      { id: "1-2", value: 20, description: "Second item" }
    ]
  }),
  new Something({
    id: "2",
    name: "Item 2",
    description: "This is the second item",
    items: [
      { id: "2-1", value: 30, description: "Third item" },
      { id: "2-2", value: 40, description: "Fourth item" }
    ]
  })
]

class SomethingRepo extends Effect.Service<SomethingRepo>()("SomethingRepo", {
  strict: false,
  effect: Effect.gen(function*() {
    return yield* makeRepo("Something", Something, {})
  })
}) {
  static readonly layer = Layer
    .effect(
      SomethingRepo,
      Effect.gen(function*() {
        return SomethingRepo.make(yield* makeRepo("Something", Something, { makeInitial: Effect.sync(() => items) }))
      })
    )
  static readonly Test = this
    .layer
    .pipe(
      Layer.provide(MemoryStoreLive)
    )

  static readonly TestCosmos = this
    .layer
    .pipe(
      Layer.provide(
        Config.redacted("STORAGE_URL").pipe(
          Config.withDefault(Redacted
            .make(
              // the emulator doesn't implement array projections :/ so you need an actual cloud instance!
              "AccountEndpoint=http://localhost:8081/;AccountKey=C2y6yDjf5/R+ob0N8A7Cgv30VRDJIWEHLM+4QDU5DE2nQ9nDuVTqobD4b8mGGyPMbIZnqyMsEcaGQy67XIw/Jw=="
            )),
          Effect.map((url) =>
            CosmosStoreLayer({
              dbName: "test",
              prefix: "",
              url
            })
          ),
          Layer.unwrapEffect
        )
      )
    )
}

describe("select first-level array fields", () => {
  const test = Effect
    .gen(function*() {
      const repo = yield* SomethingRepo

      const projected = S.Struct({ name: S.String, items: S.Array(S.Struct({ id: S.String, value: S.Number })) })

      // ok crazy lol, "value" is a reserved word in CosmosDB, so we have to use t["value"] as a field name instead of t.value
      const items = yield* repo.queryRaw(projected, {
        cosmos: () => ({
          query: `
          SELECT 
            f.name,
            ARRAY (SELECT t.id,t["value"] FROM t in f.items) AS items
          FROM Somethings f`,
          parameters: []
        }),
        memory: (items) =>
          items.map(({ items, name }) => ({
            name,
            items: items.map(({ id, value }) => ({ id, value }))
          }))
      })

      const items2 = yield* repo.query(project(projected))

      const expected = [
        {
          name: "Item 1",
          items: [
            { id: "1-1", value: 10 },
            { id: "1-2", value: 20 }
          ]
        },
        {
          name: "Item 2",
          items: [
            { id: "2-1", value: 30 },
            { id: "2-2", value: 40 }
          ]
        }
      ]

      expect(items).toStrictEqual(expected)
      expect(items2).toStrictEqual(expected)
    })
    .pipe(setupRequestContextFromCurrent())

  it("works well in CosmosDB", () =>
    test
      .pipe(Effect.provide(SomethingRepo.TestCosmos), rt.runPromise))

  it("works well in Memory", () =>
    test
      .pipe(Effect.provide(SomethingRepo.Test), rt.runPromise))
})

const projected = S.Struct({ name: S.String, items: S.Array(S.Struct({ id: S.String, value: S.Number })) })

const expected = [
  {
    name: "Item 2",
    items: [
      { id: "2-1", value: 30 },
      { id: "2-2", value: 40 }
    ]
  }
]

const both = [
  {
    name: "Item 1",
    items: [
      { id: "1-1", value: 10 },
      { id: "1-2", value: 20 }
    ]
  },
  {
    name: "Item 2",
    items: [
      { id: "2-1", value: 30 },
      { id: "2-2", value: 40 }
    ]
  }
]

// NOTE: right now we cannot specify if all/"every" items must match the filter, or if at least one item (any/"some") must match the filter.
// the current implementation is any/some, so we can always filter down in the code to narrow further..
describe("filter first-level array fields as groups", () => {
  const test = Effect
    .gen(function*() {
      const repo = yield* SomethingRepo

      // ok crazy lol, "value" is a reserved word in CosmosDB, so we have to use t["value"] as a field name instead of t.value
      // deprecated; joins should be avoided because they're very expensive, and require DISTINCT to avoid duplicates
      // which might affect results in unexpected ways?
      const items = yield* repo.queryRaw(projected, {
        cosmos: () => ({
          query: `
          SELECT DISTINCT
            f.name,
            ARRAY (SELECT t.id,t["value"] FROM t in f.items) AS items
          FROM Somethings f
          JOIN items in f.items
          WHERE (items["value"] > @v1 AND CONTAINS(items["description"], @v2, true))`,
          parameters: [{ name: "@v1", value: 20 }, { name: "@v2", value: "d item" }]
        }),
        memory: Array.filterMap(({ items, name }) =>
          items.some((_) => _.value > 20 && _.description.includes("d item"))
            ? Option.some({
              name,
              items: items.map(({ id, value }) => ({ id, value }))
            })
            : Option.none()
        )
      })

      // we use EXISTS by default now: https://learn.microsoft.com/en-us/azure/cosmos-db/nosql/query/subquery#exists-expression
      const itemsExists = yield* repo.queryRaw(projected, {
        cosmos: () => ({
          query: `
          SELECT
            f.name,
            ARRAY (SELECT t.id,t["value"] FROM t in f.items) AS items
          FROM Somethings f
          WHERE EXISTS(SELECT VALUE item FROM item IN f.items WHERE item["value"] > @v1 AND CONTAINS(item.description, @v2, true))`,
          parameters: [{ name: "@v1", value: 20 }, { name: "@v2", value: "d item" }]
        }),
        memory: Array.filterMap(({ items, name }) =>
          items.some((_) => _.value > 20 && _.description.includes("d item"))
            ? Option.some({
              name,
              items: items.map(({ id, value }) => ({ id, value }))
            })
            : Option.none()
        )
      })

      expect(items).toStrictEqual(expected)
      expect(itemsExists).toStrictEqual(expected)
    })
    .pipe(setupRequestContextFromCurrent())

  it("works well in CosmosDB", () =>
    test
      .pipe(Effect.provide(SomethingRepo.TestCosmos), rt.runPromise))

  it("works well in Memory", () =>
    test
      .pipe(Effect.provide(SomethingRepo.Test), rt.runPromise))
})

describe("1", () => {
  const test = Effect
    .gen(function*() {
      const repo = yield* SomethingRepo
      const items2 = yield* repo.query(
        some(
          "items",
          flow(
            where("value", "gt", 20),
            and("description", "contains", "d item")
          )
        ),
        project(projected)
      )
      expect(items2).toStrictEqual(expected)

      const items2Or = yield* repo.query(
        some(
          "items",
          flow(
            where("value", "gt", 20),
            or("description", "contains", "d item")
          )
        ),
        project(projected)
      )

      expect(items2Or).toStrictEqual(both)
      // mixing relation check with scoped relationcheck
      const items3 = yield* repo.query(
        some(
          "items",
          flow(where("value", "gt", 20), and(where("description", "contains", "d item")))
        ),
        project(projected)
      )

      expect(items3).toStrictEqual(expected)
      const items3Or = yield* repo.query(
        some(
          "items",
          flow(
            where("value", "gt", 20),
            or(where("description", "contains", "d item"))
          )
        ),
        project(projected)
      )

      expect(items3Or).toStrictEqual(both)
      const items4 = yield* repo.query(
        some("items", where("value", "gt", 10)),
        project(projected)
      )

      expect(items4).toStrictEqual(both)
    })
    .pipe(setupRequestContextFromCurrent())

  it("works well in CosmosDB", () =>
    test
      .pipe(Effect.provide(SomethingRepo.TestCosmos), rt.runPromise))

  it("works well in Memory", () =>
    test
      .pipe(Effect.provide(SomethingRepo.Test), rt.runPromise))
})

describe("multi-level", () => {
  const test = Effect
    .gen(function*() {
      const repo = yield* SomethingRepo
      const itemsCheckWithEvery = yield* repo.query(
        every(
          "items",
          flow(
            where("value", "gt", 20),
            and("description", "contains", "d item")
          )
        ),
        project(projected)
      )

      expect(itemsCheckWithEvery).toStrictEqual([])
    })
    .pipe(setupRequestContextFromCurrent())

  it("works well in CosmosDB", () =>
    test
      .pipe(Effect.provide(SomethingRepo.TestCosmos), rt.runPromise))

  it("works well in Memory", () =>
    test
      .pipe(Effect.provide(SomethingRepo.Test), rt.runPromise))
})

// FUTURE: we need something like this instead:
/*
  const subQuery = <T extends FieldValues>() => <TKey extends keyof T>(key: TKey, type: "some" | "every" = "some") => make<T[TKey][number]>() // todo: mark that this is sub query on field "items"

  const test = subQuery<typeof Something.Encoded>()("items", "every")
    .pipe(
      where("value", "gt", 20),
      and("description", "contains", "d item")
    )

    // ideally we can do stuff like:
    where(subQuery("items")(
      where("value", "gt", 10),
      and("description", "contains", "d item")
    ))
    */

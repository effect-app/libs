import { SqliteClient } from "@effect/sql-sqlite-node"
import { describe, expect, it } from "@effect/vitest"
import * as Array from "effect-app/Array"
import * as Config from "effect-app/Config"
import * as Context from "effect-app/Context"
import * as Effect from "effect-app/Effect"
import * as Layer from "effect-app/Layer"
import { and, computed, or, project, projectComputed, relation, where, whereEvery, whereSome } from "effect-app/Model/query"
import { makeRepo } from "effect-app/Model/Repository/makeRepo"
import { RepositoryRegistryLive } from "effect-app/Model/Repository/Registry"
import * as S from "effect-app/Schema"
import { LogLevels } from "effect-app/utils"
import { flow } from "effect/Function"
import * as ManagedRuntime from "effect/ManagedRuntime"
import * as Redacted from "effect/Redacted"
import * as References from "effect/References"
import * as Result from "effect/Result"
import * as Struct from "effect/Struct"
import { setupRequestContextFromCurrent } from "../src/api/setupRequest.js"
import { CosmosStoreLayer } from "../src/Store/Cosmos.js"
import { MemoryStoreLive } from "../src/Store/Memory.js"
import { SQLiteStoreLayer } from "../src/Store/SQL.js"

export const rt = ManagedRuntime.make(Layer.mergeAll(
  Layer.effect(
    LogLevels,
    Effect.gen(function*() {
      const levels = yield* LogLevels
      const m = new Map(levels)
      m.set("@effect-app/infra", "debug")
      return m
    })
  ),
  Layer.succeed(References.MinimumLogLevel, "Debug")
))

class Something extends S.Class<Something>("Something")({
  id: S.String,
  name: S.String,
  description: S.String,
  items: S.Array(S.Struct({ id: S.String, value: S.Finite, description: S.String }))
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

// @effect-diagnostics-next-line missingEffectServiceDependency:off
class SomethingRepo extends Context.Service<SomethingRepo>()(
  "SomethingRepo",
  {
    make: Effect.gen(function*() {
      const partitionKey = "test-" + new Date().getTime()
      return yield* makeRepo("Something", Something, { config: { partitionValue: () => partitionKey } })
    })
  }
) {
  static readonly layer = Layer
    .effect(
      SomethingRepo,
      Effect.gen(function*() {
        const partitionKey = "test-" + new Date().getTime()
        const repo = SomethingRepo.of(
          yield* makeRepo("Something", Something, {
            config: { partitionValue: () => partitionKey }
          })
        )
        // not using makeInitial, because it will prevent inserting the various partitionkeyed items
        yield* repo.saveAndPublish(items).pipe(setupRequestContextFromCurrent("init"))
        return repo
      })
    )
  static readonly Test = this
    .layer
    .pipe(
      Layer.provide(Layer.merge(MemoryStoreLive, RepositoryRegistryLive))
    )

  static readonly TestCosmos = this
    .layer
    .pipe(
      Layer.provide(
        Effect
          .gen(function*() {
            const url = yield* Config.redacted("STORAGE_URL").pipe(
              Config.withDefault(
                Redacted.make(
                  // the emulator doesn't implement array projections :/ so you need an actual cloud instance!
                  "AccountEndpoint=http://localhost:8081/;AccountKey=C2y6yDjf5/R+ob0N8A7Cgv30VRDJIWEHLM+4QDU5DE2nQ9nDuVTqobD4b8mGGyPMbIZnqyMsEcaGQy67XIw/Jw=="
                )
              )
            )
            return CosmosStoreLayer({
              dbName: "test",
              prefix: "",
              url
            })
              .pipe(Layer.merge(RepositoryRegistryLive))
          })
          .pipe(Layer.unwrap)
      )
    )
}

describe("select first-level array fields", () => {
  const test = Effect
    .gen(function*() {
      const repo = yield* SomethingRepo

      const projected = S.Struct({ name: S.String, items: S.Array(S.Struct({ id: S.String, value: S.Finite })) })

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
        memory: (items: readonly Something[]) =>
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

  it.skipIf(!process.env["STORAGE_URL"])("works well in CosmosDB", () =>
    test
      .pipe(Effect.provide(SomethingRepo.TestCosmos), rt.runPromise))

  it("works well in Memory", () =>
    test
      .pipe(Effect.provide(SomethingRepo.Test), rt.runPromise))
})

const projected = S.Struct({ name: S.String, items: S.Array(S.Struct({ id: S.String, value: S.Finite })) })

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
        memory: Array.filterMap((item: Something) =>
          item.items.some((_) => _.value > 20 && _.description.includes("d item"))
            ? Result.succeed({
              name: item.name,
              items: item.items.map(({ id, value }) => ({ id, value }))
            })
            : Result.fail(item)
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
        memory: Array.filterMap((item: Something) =>
          item.items.some((_) => _.value > 20 && _.description.includes("d item"))
            ? Result.succeed({
              name: item.name,
              items: item.items.map(({ id, value }) => ({ id, value }))
            })
            : Result.fail(item)
        )
      })

      expect(items).toStrictEqual(expected)
      expect(itemsExists).toStrictEqual(expected)
    })
    .pipe(setupRequestContextFromCurrent())

  it.skipIf(!process.env["STORAGE_URL"])("works well in CosmosDB", () =>
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
        whereSome(
          "items",
          where("value", "gt", 20),
          and("description", "contains", "d item")
        ),
        project(projected)
      )
      expect(items2).toStrictEqual(expected)

      const items2Or = yield* repo.query(
        whereSome(
          "items",
          where("value", "gt", 20),
          or("description", "contains", "d item")
        ),
        project(projected)
      )

      expect(items2Or).toStrictEqual(both)
      // mixing relation check with scoped relationcheck
      const items3 = yield* repo.query(
        whereSome(
          "items",
          where("value", "gt", 20),
          and(where("description", "contains", "d item"))
        ),
        project(projected)
      )

      expect(items3).toStrictEqual(expected)
      const items3Or = yield* repo.query(
        whereSome(
          "items",
          where("value", "gt", 20),
          or(where("description", "contains", "d item"))
        ),
        project(projected)
      )

      expect(items3Or).toStrictEqual(both)
      const items4 = yield* repo.query(
        whereSome("items", where("value", "gt", 10)),
        project(projected)
      )

      expect(items4).toStrictEqual(both)

      const items5 = yield* repo.query(
        whereSome("items", "value", "gt", 10),
        project(projected)
      )

      expect(items5).toStrictEqual(both)
    })
    .pipe(setupRequestContextFromCurrent())

  it.skipIf(!process.env["STORAGE_URL"])("works well in CosmosDB", () =>
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
        whereEvery(
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

  it.skipIf(!process.env["STORAGE_URL"])("works well in CosmosDB", () =>
    test
      .pipe(Effect.provide(SomethingRepo.TestCosmos), rt.runPromise))

  it("works well in Memory", () =>
    test
      .pipe(Effect.provide(SomethingRepo.Test), rt.runPromise))
})

describe("array length projection", () => {
  const test = Effect
    .gen(function*() {
      const repo = yield* SomethingRepo
      const result = yield* repo.query(
        projectComputed(
          S.Struct({ id: S.String, itemCount: S.NonNegativeInt }),
          computed({ itemCount: relation<S.Codec.Encoded<typeof Something>>("items").length() })
        )
      )
      expect(result).toStrictEqual([
        { id: "1", itemCount: 2 },
        { id: "2", itemCount: 2 }
      ])
    })
    .pipe(setupRequestContextFromCurrent())

  it.skipIf(!process.env["STORAGE_URL"])("works well in CosmosDB", () =>
    test
      .pipe(Effect.provide(SomethingRepo.TestCosmos), rt.runPromise))

  it("works well in Memory", () =>
    test
      .pipe(Effect.provide(SomethingRepo.Test), rt.runPromise))
})

describe("computed projections", () => {
  const test = Effect
    .gen(function*() {
      const repo = yield* SomethingRepo
      const output = S.Struct({
        id: S.String,
        pickedCount: S.NonNegativeInt,
        hasPicked: S.Boolean
      })
      const pickedFilter = where("value", "gt", 20)
      const items = yield* repo.query(
        projectComputed(
          output,
          computed({
            pickedCount: relation<S.Codec.Encoded<typeof Something>>("items").count(pickedFilter),
            hasPicked: relation<S.Codec.Encoded<typeof Something>>("items").any(pickedFilter)
          })
        )
      )
      expect(items).toStrictEqual([
        { id: "1", pickedCount: 0, hasPicked: false },
        { id: "2", pickedCount: 2, hasPicked: true }
      ])
    })
    .pipe(setupRequestContextFromCurrent())

  it.skipIf(!process.env["STORAGE_URL"])("works well in CosmosDB", () =>
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

// Mimic scanner MultiPick/EasyLife AllPickList shape:
// - parent has tagged-state with `at` timestamp
// - items is NonEmptyArray with state._tag + articleId/articleGTIN
// - controller filters `state.at gte X` and `state._tag neq closed`
//   then projectComputed with: count, any(initial/picking/packed),
//   every(picked/packed), collectDistinct(articleId)
const itemStateSchema = S.Union([
  S.TaggedStruct("initial", { at: S.String }),
  S.TaggedStruct("picking", { at: S.String }),
  S.TaggedStruct("picked", { at: S.String }),
  S.TaggedStruct("packed", { at: S.String })
])

class ArticleLineItem extends S.Class<ArticleLineItem>("ArticleLineItem")({
  articleId: S.String,
  articleGTIN: S.String,
  state: itemStateSchema
}) {}

const stOrderState = S.Union([
  S.TaggedStruct("initial", { at: S.String }),
  S.TaggedStruct("packed", { at: S.String }),
  S.TaggedStruct("closed", { at: S.String })
])

class Order extends S.Class<Order>("Order")({
  id: S.String,
  state: stOrderState,
  items: S.NonEmptyArray(ArticleLineItem)
}) {}

const orderItems = [
  new Order({
    id: "o-open-1",
    state: { _tag: "initial", at: "2026-05-08T08:00:00Z" },
    items: [
      new ArticleLineItem({
        articleId: "A1",
        articleGTIN: "G1",
        state: { _tag: "picking", at: "2026-05-08T08:01:00Z" }
      }),
      new ArticleLineItem({
        articleId: "A1",
        articleGTIN: "G1",
        state: { _tag: "picked", at: "2026-05-08T08:02:00Z" }
      }),
      new ArticleLineItem({
        articleId: "A2",
        articleGTIN: "G2",
        state: { _tag: "initial", at: "2026-05-08T08:00:00Z" }
      })
    ]
  }),
  new Order({
    id: "o-allpicked-2",
    state: { _tag: "packed", at: "2026-05-07T10:00:00Z" },
    items: [
      new ArticleLineItem({
        articleId: "B1",
        articleGTIN: "GB1",
        state: { _tag: "picked", at: "2026-05-07T09:50:00Z" }
      }),
      new ArticleLineItem({
        articleId: "B2",
        articleGTIN: "GB2",
        state: { _tag: "picked", at: "2026-05-07T09:55:00Z" }
      })
    ]
  }),
  new Order({
    id: "o-closed-3",
    state: { _tag: "closed", at: "2026-05-04T10:00:00Z" },
    items: [
      new ArticleLineItem({
        articleId: "C1",
        articleGTIN: "GC1",
        state: { _tag: "packed", at: "2026-05-04T09:00:00Z" }
      })
    ]
  })
]

// @effect-diagnostics-next-line missingEffectServiceDependency:off
class OrderRepo extends Context.Service<OrderRepo>()(
  "OrderRepo",
  {
    make: Effect.gen(function*() {
      const partitionKey = "orders-" + new Date().getTime()
      return yield* makeRepo("Order", Order, { config: { partitionValue: () => partitionKey } })
    })
  }
) {
  static readonly layer = Layer
    .effect(
      OrderRepo,
      Effect.gen(function*() {
        const partitionKey = "orders-" + new Date().getTime()
        const repo = OrderRepo.of(
          yield* makeRepo("Order", Order, {
            config: { partitionValue: () => partitionKey }
          })
        )
        yield* repo.saveAndPublish(orderItems).pipe(setupRequestContextFromCurrent("init"))
        return repo
      })
    )
  static readonly Test = this
    .layer
    .pipe(Layer.provide(Layer.merge(MemoryStoreLive, RepositoryRegistryLive)))

  static readonly TestSqlite = this
    .layer
    .pipe(
      Layer.provide(
        Layer.merge(
          SQLiteStoreLayer({
            url: Redacted.make("sqlite://"),
            prefix: "test_",
            dbName: "test"
          }),
          RepositoryRegistryLive
        )
      ),
      Layer.provide(SqliteClient.layer({ filename: ":memory:" }))
    )
}

describe("scanner-style AllPickList computed projections", () => {
  const test = Effect
    .gen(function*() {
      const repo = yield* OrderRepo
      type OrderEnc = S.Codec.Encoded<typeof Order>

      const projection = S.Struct({
        id: S.String,
        state: stOrderState,
        articleCount: S.NonNegativeInt,
        hasInitialItem: S.Boolean,
        hasPickingItem: S.Boolean,
        hasPackedItem: S.Boolean,
        allItemsPicked: S.Boolean,
        allItemsPacked: S.Boolean,
        articleIds: S.Array(S.String)
      })

      const result = yield* repo.query(
        where("state.at", "gte", "2026-05-05T00:00:00Z"),
        and("state._tag", "neq", "closed"),
        projectComputed(
          projection,
          computed({
            articleCount: relation<OrderEnc>("items").count(),
            hasInitialItem: relation<OrderEnc>("items").any(where("state._tag", "initial")),
            hasPickingItem: relation<OrderEnc>("items").any(where("state._tag", "picking")),
            hasPackedItem: relation<OrderEnc>("items").any(where("state._tag", "packed")),
            allItemsPicked: relation<OrderEnc>("items").every(where("state._tag", "picked")),
            allItemsPacked: relation<OrderEnc>("items").every(where("state._tag", "packed")),
            articleIds: relation<OrderEnc>("items").collectDistinct("articleId")
          })
        )
      )

      const byId = Object.fromEntries(result.map((r) => [r.id, r]))

      expect(Object.keys(byId).sort()).toEqual(["o-allpicked-2", "o-open-1"])

      const open = byId["o-open-1"]!
      expect(open.articleCount).toBe(3)
      expect(open.hasInitialItem).toBe(true)
      expect(open.hasPickingItem).toBe(true)
      expect(open.hasPackedItem).toBe(false)
      expect(open.allItemsPicked).toBe(false)
      expect(open.allItemsPacked).toBe(false)
      expect([...open.articleIds].sort()).toEqual(["A1", "A2"])

      const allp = byId["o-allpicked-2"]!
      expect(allp.articleCount).toBe(2)
      expect(allp.hasInitialItem).toBe(false)
      expect(allp.hasPickingItem).toBe(false)
      expect(allp.hasPackedItem).toBe(false)
      expect(allp.allItemsPicked).toBe(true)
      expect(allp.allItemsPacked).toBe(false)
      expect([...allp.articleIds].sort()).toEqual(["B1", "B2"])
    })
    .pipe(setupRequestContextFromCurrent())

  it("works well in Memory", () => test.pipe(Effect.provide(OrderRepo.Test), rt.runPromise))

  it("works well in SQLite", () => test.pipe(Effect.provide(OrderRepo.TestSqlite), rt.runPromise))
})

// Same but mimics the FULL controller projection: includes `items` array
// (NonEmptyArray) alongside the computed scalars. This tests the
// memory-side select pipeline that combines subKeys (items) with
// computedKeys in one Project node.
describe("scanner-style AllPickList — items + computed combined", () => {
  const test = Effect
    .gen(function*() {
      const repo = yield* OrderRepo
      type OrderEnc = S.Codec.Encoded<typeof Order>

      const projection = S.Struct({
        id: S.String,
        items: S.NonEmptyArray(ArticleLineItem.mapFields(Struct.pick(["articleId", "articleGTIN"]))),
        articleCount: S.NonNegativeInt,
        allItemsPicked: S.Boolean,
        articleIds: S.Array(S.String)
      })

      const result = yield* repo.query(
        where("state.at", "gte", "2026-05-05T00:00:00Z"),
        and("state._tag", "neq", "closed"),
        projectComputed(
          projection,
          computed({
            articleCount: relation<OrderEnc>("items").count(),
            allItemsPicked: relation<OrderEnc>("items").every(where("state._tag", "picked")),
            articleIds: relation<OrderEnc>("items").collectDistinct("articleId")
          })
        )
      )

      expect(result.length).toBe(2)
      const byId = Object.fromEntries(result.map((r) => [r.id, r]))
      const open = byId["o-open-1"]!
      expect(open.items.length).toBe(3)
      expect(open.items[0]).toHaveProperty("articleId")
      expect(open.items[0]).toHaveProperty("articleGTIN")
      expect(open.allItemsPicked).toBe(false)
      const allp = byId["o-allpicked-2"]!
      expect(allp.items.length).toBe(2)
      expect(allp.allItemsPicked).toBe(true)
    })
    .pipe(setupRequestContextFromCurrent())

  it("works well in Memory", () => test.pipe(Effect.provide(OrderRepo.Test), rt.runPromise))

  it("works well in SQLite", () => test.pipe(Effect.provide(OrderRepo.TestSqlite), rt.runPromise))
})

describe("removeByIds", () => {
  const test = Effect
    .gen(function*() {
      const items = [
        new Something({
          id: "2-1",
          name: "Item 1",
          description: "This is the first item",
          items: [
            { id: "1-1", value: 10, description: "First item" },
            { id: "1-2", value: 20, description: "Second item" }
          ]
        }),
        new Something({
          id: "2-2",
          name: "Item 2",
          description: "This is the second item",
          items: [
            { id: "2-1", value: 30, description: "Third item" },
            { id: "2-2", value: 40, description: "Fourth item" }
          ]
        }),
        new Something({
          id: "2-3",
          name: "Item 3",
          description: "This is the third item",
          items: [
            { id: "2-1", value: 30, description: "Third item" },
            { id: "2-2", value: 40, description: "Fourth item" }
          ]
        })
      ]
      const repo = yield* SomethingRepo

      yield* repo.saveAndPublish(items)
      const itemsAfterSave = yield* repo.all
      yield* repo.removeById([items[0]!.id, items[1]!.id])

      const items2 = yield* repo.all

      expect(itemsAfterSave.length).toStrictEqual(5)
      expect(items2.length).toStrictEqual(3)
    })
    .pipe(setupRequestContextFromCurrent())

  it.skipIf(!process.env["STORAGE_URL"])("works well in CosmosDB", () =>
    test
      .pipe(Effect.provide(SomethingRepo.TestCosmos), rt.runPromise))

  it("works well in Memory", () =>
    test
      .pipe(Effect.provide(SomethingRepo.Test), rt.runPromise))
})

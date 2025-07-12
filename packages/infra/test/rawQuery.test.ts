import { describe, expect, it } from "@effect/vitest"
import { Array, Config, Effect, Layer, Logger, LogLevel, ManagedRuntime, Option, Redacted, S } from "effect-app"
import { LogLevels } from "effect-app/utils"
import { setupRequestContextFromCurrent } from "../src/api/setupRequest.js"
import { and, project, where } from "../src/Model/query.js"
import { makeRepo } from "../src/Model/Repository/makeRepo.js"
import { CosmosStoreLayer } from "../src/Store/Cosmos.js"
import { MemoryStoreLive } from "../src/Store/Memory.js"

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
        // TODO
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

describe("filter first-level array fields as groups", () => {
  const test = Effect
    .gen(function*() {
      const repo = yield* SomethingRepo

      const projected = S.Struct({ name: S.String, items: S.Array(S.Struct({ id: S.String, value: S.Number })) })

      // ok crazy lol, "value" is a reserved word in CosmosDB, so we have to use t["value"] as a field name instead of t.value
      const items = yield* repo.queryRaw(projected, {
        // TODO
        cosmos: () => ({
          query: `
          SELECT 
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

      // problem 1:
      // we cannot specify if all/"every" items must match the filter, or if at least one item (any/"some") must match the filter.
      // we should start with supporting "any", and then add "all" support..
      // good thing: cosmosdb currently defaults to "any", and we can always filter down to "all" after finished querying,
      // "all" is more of an optimisation, so let's focus on problem 2

      // problem 2:
      // in memory is not implemented properly for array sub queries.
      // 1. in the current situation, it only is somewhat implemented for eq and neq, nothing else.
      // 2. we don't properly group the filters. you want to express; find Something where some item has both (value > 20 and description includes "d item")
      // but in reality, you find Something where at least an item has value > 20, and at least an item has a description that includes "d item".
      // subtle but very important difference.. in the sample query it would lead to showing 2 items instead of 1 item.

      // This should mean:
      // Find all Somethings where at least one item (has value > 20 and description includes "d item")
      // aka: somethings.filter(s => s.items.some((_) => _.value > 20 && _.description.includes("d item")))
      // for this, codeFilter should be updated to support accordingly.
      // (removing detection of ".-1." using 'some' check from `codeFilterStatement`, and moving it somehow higher up... higher up we need to detect and group sub-item checks!)
      const items2 = yield* repo.query(
        // TODO: right now only supported inside a scope..
        /*
        where("items.-1.value", "gt", 20),
        and("items.-1.description", "contains", "d item"),
        */
        where(where("items.-1.value", "gt", 20), and("items.-1.description", "contains", "d item")),
        project(projected)
      )

      const expected = [
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

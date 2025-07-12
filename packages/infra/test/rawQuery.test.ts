import { expect, it } from "@effect/vitest"
import { Config, Effect, Layer, Redacted, S } from "effect-app"
import { setupRequestContextFromCurrent } from "../src/api/setupRequest.js"
import { project } from "../src/Model/query.js"
import { makeRepo } from "../src/Model/Repository/makeRepo.js"
import { CosmosStoreLayer } from "../src/Store/Cosmos.js"
import { MemoryStoreLive } from "../src/Store/Memory.js"

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
    .pipe(Effect.provide(SomethingRepo.TestCosmos), Effect.runPromise))

it("works well in Memory", () =>
  test
    .pipe(Effect.provide(SomethingRepo.Test), Effect.runPromise))

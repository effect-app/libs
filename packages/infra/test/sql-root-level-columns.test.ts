import { SqliteClient } from "@effect/sql-sqlite-node"
import * as Effect from "effect-app/Effect"
import * as Layer from "effect-app/Layer"
import * as S from "effect-app/Schema"
import { SqlClient } from "effect/unstable/sql"
import * as Redacted from "effect/Redacted"
import { describe, expect, it } from "vitest"
import { setupRequestContextFromCurrent } from "../src/api/setupRequest.js"
import { where } from "../src/Model/query.js"
import { makeRepo } from "../src/Model/Repository.js"
import { RepositoryRegistryLive } from "../src/Model/Repository/Registry.js"
import { SQLiteStoreLayer } from "../src/Store/SQL.js"

class ProjectedItem extends S.Class<ProjectedItem>("ProjectedItem")({
  id: S.String,
  name: S.String,
  age: S.Number,
  active: S.Boolean,
  createdAt: S.Date,
  meta: S.Struct({ city: S.String })
}) {}

const tableName = "test_projectedItems"

const makeStoreLayer = (rootLevelFieldsWhenAvailable?: boolean) =>
  Layer
    .merge(
      SQLiteStoreLayer({
        url: Redacted.make("sqlite://"),
        prefix: "test_",
        dbName: "test",
        rootLevelFieldsWhenAvailable
      }),
      RepositoryRegistryLive
    )
    .pipe(Layer.provide(SqliteClient.layer({ filename: ":memory:" })))

describe("SQLite root-level projected columns", () => {
  it("creates and writes projected root-level columns when enabled per repository", async () => {
    const createdAt = new Date("2024-01-02T03:04:05.000Z")
    const result = await Effect
      .gen(function*() {
        const repo = yield* makeRepo("projectedItem", ProjectedItem, {
          config: { rootLevelFieldsWhenAvailable: true }
        })

        yield* repo.saveAndPublish([{
          id: "1",
          name: "Alice",
          age: 30,
          active: true,
          createdAt,
          meta: { city: "Oslo" }
        }])

        const sql = yield* SqlClient.SqlClient
        const columns = yield* sql.unsafe(`PRAGMA table_info(${JSON.stringify(tableName)})`) as Array<{ name: string }>
        const row = (yield* sql.unsafe(
          `SELECT id, "__root_name", "__root_age", "__root_active", "__root_createdAt", data FROM "${tableName}"`
        ) as any[])[0]

        return { columns, row }
      })
      .pipe(setupRequestContextFromCurrent("sql root-level columns"))
      .pipe(Effect.provide(makeStoreLayer()))
      .pipe(Effect.runPromise)

    const columnNames = result.columns.map((column) => column.name)
    expect(columnNames).toEqual(expect.arrayContaining([
      "__root_name",
      "__root_age",
      "__root_active",
      "__root_createdAt"
    ]))
    expect(columnNames).not.toContain("__root_meta")
    expect(result.row.__root_name).toBe("Alice")
    expect(result.row.__root_age).toBe(30)
    expect(result.row.__root_active).toBe(1)
    expect(result.row.__root_createdAt).toBe(createdAt.toJSON())
    expect(JSON.parse(result.row.data)).toMatchObject({
      name: "Alice",
      age: 30,
      active: true,
      meta: { city: "Oslo" }
    })
  })

  it("allows repository config to disable an adapter-level default", async () => {
    const columnNames = await Effect
      .gen(function*() {
        yield* makeRepo("projectedItem", ProjectedItem, {
          config: { rootLevelFieldsWhenAvailable: false }
        })
        const sql = yield* SqlClient.SqlClient
        const columns = yield* sql.unsafe(`PRAGMA table_info(${JSON.stringify(tableName)})`) as Array<{ name: string }>
        return columns.map((column) => column.name)
      })
      .pipe(setupRequestContextFromCurrent("sql root-level columns override"))
      .pipe(Effect.provide(makeStoreLayer(true)))
      .pipe(Effect.runPromise)

    expect(columnNames).not.toContain("__root_name")
    expect(columnNames).not.toContain("__root_age")
  })

  it("queries legacy rows through JSON fallback when projected columns are null", async () => {
    const rows = await Effect
      .gen(function*() {
        const repo = yield* makeRepo("projectedItem", ProjectedItem, {
          config: { rootLevelFieldsWhenAvailable: true }
        })
        const sql = yield* SqlClient.SqlClient
        yield* sql.unsafe(
          `INSERT INTO "${tableName}" (id, _namespace, _etag, data) VALUES (?, ?, ?, ?)`,
          ["legacy", "primary", "etag1", JSON.stringify({
            name: "Legacy",
            age: 42,
            active: true,
            createdAt: "2024-01-02T03:04:05.000Z",
            meta: { city: "Oslo" }
          })]
        )
        return yield* repo.query(where("age", "gt", 40))
      })
      .pipe(setupRequestContextFromCurrent("sql root-level columns legacy"))
      .pipe(Effect.provide(makeStoreLayer()))
      .pipe(Effect.runPromise)

    expect(rows).toHaveLength(1)
    expect(rows[0]!.id).toBe("legacy")
    expect(rows[0]!.age).toBe(42)
  })
})

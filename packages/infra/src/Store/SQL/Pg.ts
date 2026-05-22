/* eslint-disable @typescript-eslint/no-explicit-any */

import type { NonEmptyReadonlyArray } from "effect-app/Array"
import { toNonEmptyArray } from "effect-app/Array"
import * as Effect from "effect-app/Effect"
import * as Option from "effect-app/Option"
import * as Struct from "effect/Struct"
import { SqlClient } from "effect/unstable/sql"
import { OptimisticConcurrencyException } from "../../errors.js"
import { InfraLogger } from "../../logger.js"
import type { FieldValues } from "../../Model/filter/types.js"
import type { ComputedProjectionIrExpression } from "../../Model/query.js"
import { annotateDb } from "../../otel.js"
import { storeId } from "../Memory.js"
import { omitRootLevelFieldColumnsFromData, type RootLevelFieldColumn } from "../rootLevelFields.js"
import { type FilterArgs, type PersistenceModelType, type StorageConfig, type Store, type StoreConfig, StoreMaker } from "../service.js"
import { makeETag } from "../utils.js"
import { buildWhereSQLQuery, logQuery, normalizeProjectedColumnValue, pgDialect, projectedColumnBackfillExpr, projectedColumnSqlType, quoteIdentifier } from "./query.js"

const parseRow = <Encoded extends FieldValues>(
  row: { id: string; _etag: string | null; data: unknown } & Record<string, unknown>,
  idKey: PropertyKey,
  defaultValues: Partial<Encoded>,
  rootLevelFieldColumns: readonly RootLevelFieldColumn[] = []
): PersistenceModelType<Encoded> => {
  const data = (typeof row.data === "string" ? JSON.parse(row.data) : row.data) as object
  const projectedFields = rootLevelFieldColumns.reduce<Record<string, unknown>>((acc, column) => {
    const value = row[column.columnName]
    if (value !== null && value !== undefined) {
      acc[column.key] = normalizeProjectedColumnValue(column, value)
    }
    return acc
  }, {})
  return {
    ...defaultValues,
    ...data,
    ...projectedFields,
    [idKey]: row.id,
    _etag: row._etag ?? undefined
  } as PersistenceModelType<Encoded>
}

const parseSelectRow = (
  row: Record<string, unknown>,
  idKey: PropertyKey,
  defaultValues: Record<string, unknown>,
  rootLevelFieldColumns: readonly RootLevelFieldColumn[] = []
): any => {
  const result: Record<string, unknown> = { ...defaultValues }
  const projectedFields = new Map(rootLevelFieldColumns.map((column) => [column.key, column] as const))
  for (const [key, value] of Object.entries(row)) {
    if (key === "id") {
      result[idKey as string] = value
      result["id"] = value
    } else if (projectedFields.has(key)) {
      result[key] = normalizeProjectedColumnValue(projectedFields.get(key)!, value)
    } else {
      result[key] = value
    }
  }
  return result
}

const makePgStore = Effect.fnUntraced(
  function*({ prefix, rootLevelFieldsWhenAvailable: rootLevelFieldsWhenAvailableDefault }: StorageConfig) {
    const sql = yield* SqlClient.SqlClient
    return {
      make: Effect.fnUntraced(function*<IdKey extends keyof Encoded, Encoded extends FieldValues, R = never, E = never>(
        name: string,
        idKey: IdKey,
        seed?: Effect.Effect<Iterable<Encoded>, E, R>,
        config?: StoreConfig<Encoded>
      ) {
        type PM = PersistenceModelType<Encoded>
        const tableName = `${prefix}${name}`
        const defaultValues = config?.defaultValues ?? {}
        const rootLevelFieldColumns = config?.rootLevelFieldColumns ?? []
        const useRootLevelFields = config?.rootLevelFieldsWhenAvailable ?? rootLevelFieldsWhenAvailableDefault ?? false
        const activeRootLevelFieldColumns = useRootLevelFields ? rootLevelFieldColumns : []
        const selectColumnsSql = activeRootLevelFieldColumns.length > 0
          ? `, ${activeRootLevelFieldColumns.map((column) => quoteIdentifier(column.columnName)).join(", ")}`
          : ""

        const resolveNamespace = !config?.allowNamespace
          ? Effect.succeed("primary")
          : storeId.pipe(Effect.map((namespace) => {
            if (namespace !== "primary" && !config.allowNamespace!(namespace)) {
              throw new Error(`Namespace ${namespace} not allowed!`)
            }
            return namespace
          }))

        const exec = (query: string, params?: readonly unknown[]) => sql.unsafe(query, params as any).pipe(Effect.orDie)

        const ensureTable = sql
          .unsafe(
            `CREATE TABLE IF NOT EXISTS "${tableName}" (id TEXT NOT NULL, _namespace TEXT NOT NULL DEFAULT 'primary', _etag TEXT, data JSONB NOT NULL, PRIMARY KEY (id, _namespace))`
          )
          .pipe(
            Effect.andThen(
              sql.unsafe(
                `CREATE TABLE IF NOT EXISTS "_migrations" (id TEXT NOT NULL, version TEXT NOT NULL, PRIMARY KEY (id, version))`
              )
            ),
            Effect.andThen(
              Effect.forEach(
                activeRootLevelFieldColumns,
                (column) =>
                  exec(
                    `ALTER TABLE "${tableName}" ADD COLUMN IF NOT EXISTS ${quoteIdentifier(column.columnName)} ${
                      projectedColumnSqlType(pgDialect, column.kind)
                    }`
                  )
                    .pipe(
                      Effect.andThen(
                        exec(
                          `UPDATE "${tableName}" SET ${quoteIdentifier(column.columnName)} = ${
                            projectedColumnBackfillExpr(pgDialect, column)
                          } WHERE ${quoteIdentifier(column.columnName)} IS NULL`
                        )
                      )
                    ),
                { discard: true }
              )
            ),
            Effect.orDie,
            Effect.asVoid
          )

        const toRow = (e: PM) => {
          const newE = makeETag(e)
          const id = newE[idKey] as string
          const { _etag, [idKey]: _id, ...rest } = newE as any
          const data = JSON.stringify(omitRootLevelFieldColumnsFromData(rest, activeRootLevelFieldColumns))
          const rootLevelFieldValues = activeRootLevelFieldColumns.map((column) => {
            if (column.kind === "json") {
              return rest[column.key] === undefined ? null : JSON.stringify(rest[column.key])
            }
            return rest[column.key] ?? null
          })
          return { id, _etag: newE._etag!, data, item: newE, rootLevelFieldValues }
        }

        const setInternal = Effect.fnUntraced(function*(e: PM, ns: string) {
          const row = toRow(e)
          if (e._etag) {
            const projectedSetSql = activeRootLevelFieldColumns.length > 0
              ? `, ${
                activeRootLevelFieldColumns
                  .map((column, index) => `${quoteIdentifier(column.columnName)} = $${index + 3}`)
                  .join(", ")
              }`
              : ""
            const idParam = row.rootLevelFieldValues.length + 3
            const etagParam = row.rootLevelFieldValues.length + 4
            const namespaceParam = row.rootLevelFieldValues.length + 5
            yield* exec(
              `UPDATE "${tableName}" SET _etag = $1, data = $2${projectedSetSql} WHERE id = $${idParam} AND _etag = $${etagParam} AND _namespace = $${namespaceParam}`,
              [row._etag, row.data, ...row.rootLevelFieldValues, row.id, e._etag, ns]
            )
            const existing = yield* exec(
              `SELECT _etag FROM "${tableName}" WHERE id = $1 AND _namespace = $2`,
              [row.id, ns]
            )
            const current = (existing as any[])[0]
            if (!current || current._etag !== row._etag) {
              if (current) {
                return yield* new OptimisticConcurrencyException({
                  type: name,
                  id: row.id,
                  current: current._etag,
                  found: e._etag,
                  code: 412
                })
              }
              return yield* new OptimisticConcurrencyException({
                type: name,
                id: row.id,
                current: "",
                found: e._etag,
                code: 404
              })
            }
          } else {
            const projectedColumnsSql = activeRootLevelFieldColumns.length > 0
              ? `, ${activeRootLevelFieldColumns.map((column) => quoteIdentifier(column.columnName)).join(", ")}`
              : ""
            const projectedValuesSql = activeRootLevelFieldColumns
              .map((_, index) => `$${index + 5}`)
              .join(", ")
            yield* exec(
              `INSERT INTO "${tableName}" (id, _namespace, _etag, data${projectedColumnsSql}) VALUES ($1, $2, $3, $4${
                projectedValuesSql.length > 0 ? `, ${projectedValuesSql}` : ""
              })`,
              [row.id, ns, row._etag, row.data, ...row.rootLevelFieldValues]
            )
          }
          return row.item
        })

        const bulkSetInternal = (items: NonEmptyReadonlyArray<PM>, ns: string) =>
          sql
            .withTransaction(Effect.forEach(items, (e) => setInternal(e, ns)))
            .pipe(
              Effect.orDie,
              Effect.map((_) => _ as unknown as NonEmptyReadonlyArray<PM>)
            )

        const ctx = yield* Effect.context<R>()
        const seedCache = new Map<string, Effect.Effect<void>>()
        const makeSeedEffect = Effect.fnUntraced(function*(ns: string) {
          yield* ensureTable
          if (!seed) return
          const existing = yield* exec(
            `SELECT id FROM "_migrations" WHERE id = $1 AND version = $2`,
            [`${tableName}::${ns}`, tableName]
          )
          if ((existing as any[]).length > 0) return
          yield* InfraLogger.logInfo(`Seeding data for ${name} (namespace: ${ns})`)
          const items = yield* seed.pipe(Effect.provide(ctx), Effect.orDie)
          const ne = toNonEmptyArray([...items])
          if (Option.isSome(ne)) yield* bulkSetInternal(ne.value, ns)
          yield* exec(
            `INSERT INTO "_migrations" (id, version) VALUES ($1, $2)`,
            [`${tableName}::${ns}`, tableName]
          )
        })
        const seedNamespace = (ns: string) => {
          let cached = seedCache.get(ns)
          if (!cached) {
            cached = Effect.cached(Effect.uninterruptible(makeSeedEffect(ns))).pipe(Effect.runSync)
            seedCache.set(ns, cached)
          }
          return cached
        }
        const s: Store<IdKey, Encoded> = {
          seedNamespace: (ns) => seedNamespace(ns),

          all: resolveNamespace.pipe(
            Effect.flatMap((ns) => {
              const sqlText = `SELECT id, _etag, data${selectColumnsSql} FROM "${tableName}" WHERE _namespace = $1`
              return exec(sqlText, [ns])
                .pipe(
                  Effect.map((rows) =>
                    (rows as any[]).map((r) => parseRow<Encoded>(r, idKey, defaultValues, activeRootLevelFieldColumns))
                  ),
                  annotateDb({
                    operation: "all",
                    system: "postgresql",
                    collection: tableName,
                    namespace: ns,
                    entity: name,
                    query: sqlText
                  })
                )
            })
          ),

          find: (id) =>
            resolveNamespace.pipe(Effect
              .flatMap((ns) => {
                const sqlText =
                  `SELECT id, _etag, data${selectColumnsSql} FROM "${tableName}" WHERE id = $1 AND _namespace = $2`
                return exec(sqlText, [id, ns])
                  .pipe(
                    Effect.map((rows) => {
                      const row = (rows as any[])[0]
                      return row
                        ? Option.some(parseRow<Encoded>(row, idKey, defaultValues, activeRootLevelFieldColumns))
                        : Option.none()
                    }),
                    annotateDb({
                      operation: "find",
                      system: "postgresql",
                      collection: tableName,
                      namespace: ns,
                      entity: name,
                      query: sqlText,
                      extra: { "app.entity.id": id }
                    })
                  )
              })),

          filter: <U extends keyof Encoded = never>(f: FilterArgs<Encoded, U>) => {
            const filter = f
              .filter
            type M = U extends undefined ? Encoded : Pick<Encoded, U>
            return resolveNamespace.pipe(Effect.flatMap((ns) =>
              Effect
                .sync(() => {
                  const q = buildWhereSQLQuery(
                    pgDialect,
                    idKey,
                    filter ? [{ t: "where-scope", result: filter, relation: "some" }] : [],
                    tableName,
                    defaultValues,
                    f.select as
                      | NonEmptyReadonlyArray<
                        string | {
                          key: string
                          subKeys: readonly string[]
                        } | {
                          key: string
                          computed: ComputedProjectionIrExpression
                        }
                      >
                      | undefined,
                    f.order,
                    f.skip,
                    f.limit,
                    undefined,
                    activeRootLevelFieldColumns
                  )
                  const nsPlaceholder = pgDialect.placeholder(q.params.length + 1)
                  const hasWhere = q.sql.includes("WHERE")
                  const nsSql = hasWhere
                    ? q.sql.replace("WHERE", `WHERE _namespace = ${nsPlaceholder} AND`)
                    : q.sql.replace(
                      `FROM "${tableName}"`,
                      `FROM "${tableName}" WHERE _namespace = ${nsPlaceholder}`
                    )
                  return { sql: nsSql, params: [...q.params, ns] }
                })
                .pipe(
                  Effect.tap((q) => logQuery(q)),
                  Effect.tap((q) => Effect.annotateCurrentSpan({ "db.query.text": q.sql })),
                  Effect.flatMap((q) =>
                    exec(q.sql, q.params).pipe(
                      Effect.map((rows) => {
                        if (f.select) {
                          return (rows as any[]).map((r) => {
                            const selected = parseSelectRow(r, idKey, {}, activeRootLevelFieldColumns)
                            return {
                              ...Struct.pick(
                                defaultValues as any,
                                f.select!.filter((_) => typeof _ === "string") as never[]
                              ),
                              ...selected
                            } as M
                          })
                        }
                        return (rows as any[]).map((r) =>
                          parseRow<Encoded>(r, idKey, defaultValues, activeRootLevelFieldColumns) as any as M
                        )
                      })
                    )
                  ),
                  annotateDb({
                    operation: "filter",
                    system: "postgresql",
                    collection: tableName,
                    namespace: ns,
                    entity: name
                  })
                )
            ))
          },

          set: (e) =>
            resolveNamespace.pipe(Effect.flatMap((ns) =>
              setInternal(e, ns).pipe(
                annotateDb({
                  operation: "set",
                  system: "postgresql",
                  collection: tableName,
                  namespace: ns,
                  entity: name,
                  extra: { "app.entity.id": e[idKey] }
                })
              )
            )),

          batchSet: (items) =>
            resolveNamespace.pipe(Effect.flatMap((ns) =>
              bulkSetInternal(items, ns).pipe(
                annotateDb({
                  operation: "batchSet",
                  system: "postgresql",
                  collection: tableName,
                  namespace: ns,
                  entity: name
                })
              )
            )),

          bulkSet: (items) =>
            resolveNamespace.pipe(Effect.flatMap((ns) =>
              bulkSetInternal(items, ns).pipe(
                annotateDb({
                  operation: "bulkSet",
                  system: "postgresql",
                  collection: tableName,
                  namespace: ns,
                  entity: name
                })
              )
            )),

          batchRemove: (ids) => {
            const placeholders = ids.map((_, i) => `$${i + 1}`).join(", ")
            const nsPlaceholder = `$${ids.length + 1}`
            return resolveNamespace.pipe(Effect.flatMap((ns) => {
              const sqlText =
                `DELETE FROM "${tableName}" WHERE id IN (${placeholders}) AND _namespace = ${nsPlaceholder}`
              return exec(sqlText, [...ids, ns])
                .pipe(
                  Effect.asVoid,
                  annotateDb({
                    operation: "batchRemove",
                    system: "postgresql",
                    collection: tableName,
                    namespace: ns,
                    entity: name,
                    query: sqlText
                  })
                )
            }))
          },

          queryRaw: (query) =>
            s.all.pipe(
              Effect.map(query.memory),
              annotateDb({
                operation: "queryRaw",
                system: "postgresql",
                collection: tableName,
                entity: name
              })
            )
        }

        // Eagerly seed primary namespace on initialization
        yield* seedNamespace("primary")

        return s
      })
    }
  }
)

export function PgStoreLayer(cfg: StorageConfig) {
  return StoreMaker
    .toLayer(makePgStore(cfg))
}

/* eslint-disable @typescript-eslint/no-explicit-any */

import { Context, Layer, LayerMap } from "effect"
import { Effect, type NonEmptyReadonlyArray, Option, Struct } from "effect-app"
import { toNonEmptyArray } from "effect-app/Array"
import { SqlClient } from "effect/unstable/sql"
import { OptimisticConcurrencyException } from "../errors.js"
import { InfraLogger } from "../logger.js"
import type { FieldValues } from "../Model/filter/types.js"
import type { ComputedProjectionIrExpression } from "../Model/query.js"
import { annotateDb, type DbSystem } from "../otel.js"
import { storeId } from "./Memory.js"
import { type FilterArgs, type PersistenceModelType, type StorageConfig, type Store, type StoreConfig, StoreMaker } from "./service.js"
import { buildWhereSQLQuery, logQuery, type SQLDialect, sqliteDialect } from "./SQL/query.js"
import { makeETag } from "./utils.js"

export type WithNsTransactionFn = <A, E, R>(effect: Effect.Effect<A, E, R>) => Effect.Effect<A, E, R>

export class WithNsTransaction
  extends Context.Service<WithNsTransaction, WithNsTransactionFn>()("effect-app/WithNsTransaction")
{}

/** @internal */
export const parseRow = <Encoded extends FieldValues>(
  row: { id: string; _etag: string | null; data: string },
  idKey: PropertyKey,
  defaultValues: Partial<Encoded>
): PersistenceModelType<Encoded> => {
  const data = (typeof row.data === "string" ? JSON.parse(row.data) : row.data) as object
  return { ...defaultValues, ...data, [idKey]: row.id, _etag: row._etag ?? undefined } as PersistenceModelType<Encoded>
}

const parseSelectRow = (
  row: Record<string, unknown>,
  idKey: PropertyKey
): any => {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(row)) {
    if (key === "id") {
      result[idKey as string] = value
      result["id"] = value
    } else if (typeof value === "string") {
      try {
        result[key] = JSON.parse(value)
      } catch {
        result[key] = value
      }
    } else {
      result[key] = value
    }
  }
  return result
}

function makeSQLStoreInt(system: DbSystem, dialect: SQLDialect, jsonColumnType: string) {
  return Effect.fnUntraced(function*({ prefix }: StorageConfig) {
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

        const resolveNamespace = !config?.allowNamespace
          ? Effect.succeed("primary")
          : storeId.asEffect().pipe(Effect.map((namespace) => {
            if (namespace !== "primary" && !config.allowNamespace!(namespace)) {
              throw new Error(`Namespace ${namespace} not allowed!`)
            }
            return namespace
          }))

        const ensureTable = sql
          .unsafe(
            `CREATE TABLE IF NOT EXISTS "${tableName}" (id TEXT NOT NULL, _namespace TEXT NOT NULL DEFAULT 'primary', _etag TEXT, data ${jsonColumnType} NOT NULL, PRIMARY KEY (id, _namespace))`
          )
          .pipe(
            Effect.andThen(
              sql.unsafe(
                `CREATE TABLE IF NOT EXISTS "_migrations" (id TEXT NOT NULL, version TEXT NOT NULL, PRIMARY KEY (id, version))`
              )
            ),
            Effect.orDie,
            Effect.asVoid
          )

        const toRow = (e: PM) => {
          const newE = makeETag(e)
          const id = newE[idKey] as string
          const { _etag, [idKey]: _id, ...rest } = newE as any
          const data = JSON.stringify(rest)
          return { id, _etag: newE._etag!, data, item: newE }
        }

        const exec = (query: string, params?: readonly unknown[]) => sql.unsafe(query, params as any).pipe(Effect.orDie)

        const setInternal = Effect.fnUntraced(function*(e: PM, ns: string) {
          const row = toRow(e)
          if (e._etag) {
            yield* exec(
              `UPDATE "${tableName}" SET _etag = ?, data = ? WHERE id = ? AND _etag = ? AND _namespace = ?`,
              [row._etag, row.data, row.id, e._etag, ns]
            )
            const existing = yield* exec(
              `SELECT _etag FROM "${tableName}" WHERE id = ? AND _namespace = ?`,
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
            yield* exec(
              `INSERT INTO "${tableName}" (id, _namespace, _etag, data) VALUES (?, ?, ?, ?)`,
              [row.id, ns, row._etag, row.data]
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
            `SELECT id FROM "_migrations" WHERE id = ? AND version = ?`,
            [`${tableName}::${ns}`, tableName]
          )
          if ((existing as any[]).length > 0) return
          yield* InfraLogger.logInfo(`Seeding data for ${name} (namespace: ${ns})`)
          const items = yield* seed.pipe(Effect.provide(ctx), Effect.orDie)
          const ne = toNonEmptyArray([...items])
          if (Option.isSome(ne)) yield* bulkSetInternal(ne.value, ns)
          yield* exec(
            `INSERT INTO "_migrations" (id, version) VALUES (?, ?)`,
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
              const sqlText = `SELECT id, _etag, data FROM "${tableName}" WHERE _namespace = ?`
              return exec(sqlText, [ns])
                .pipe(
                  Effect.map((rows) => (rows as any[]).map((r) => parseRow<Encoded>(r, idKey, defaultValues))),
                  annotateDb({
                    operation: "all",
                    system,
                    collection: tableName,
                    namespace: ns,
                    entity: name,
                    query: sqlText
                  })
                )
            })
          ),

          find: (id) =>
            resolveNamespace.pipe(
              Effect.flatMap((ns) => {
                const sqlText = `SELECT id, _etag, data FROM "${tableName}" WHERE id = ? AND _namespace = ?`
                return exec(sqlText, [id, ns])
                  .pipe(
                    Effect.map((rows) => {
                      const row = (rows as any[])[0]
                      return row
                        ? Option.some(parseRow<Encoded>(row, idKey, defaultValues))
                        : Option.none()
                    }),
                    annotateDb({
                      operation: "find",
                      system,
                      collection: tableName,
                      namespace: ns,
                      entity: name,
                      query: sqlText,
                      extra: { "app.entity.id": id }
                    })
                  )
              })
            ),

          filter: <U extends keyof Encoded = never>(f: FilterArgs<Encoded, U>) => {
            const filter = f
              .filter
            type M = U extends undefined ? Encoded
              : Pick<Encoded, U>
            return resolveNamespace
              .pipe(Effect
                .flatMap((ns) =>
                  Effect
                    .sync(() => {
                      const q = buildWhereSQLQuery(
                        dialect,
                        idKey,
                        filter ? [{ t: "where-scope", result: filter, relation: "some" }] : [],
                        tableName,
                        defaultValues,
                        f
                          .select as
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
                        f
                          .order,
                        f
                          .skip,
                        f
                          .limit
                      )
                      const hasWhere = q
                        .sql
                        .includes("WHERE")
                      const nsSql = hasWhere
                        ? q
                          .sql
                          .replace("WHERE", `WHERE _namespace = ? AND`)
                        : q
                          .sql
                          .replace(
                            `FROM "${tableName}"`,
                            `FROM "${tableName}" WHERE _namespace = ?`
                          )
                      return {
                        sql: nsSql,
                        params: [
                          ns,
                          ...q
                            .params
                        ]
                      }
                    })
                    .pipe(
                      Effect
                        .tap((q) => logQuery(q)),
                      Effect.tap((q) => Effect.annotateCurrentSpan({ "db.query.text": q.sql })),
                      Effect.flatMap((q) =>
                        exec(q.sql, q.params).pipe(
                          Effect.map((rows) => {
                            if (f.select) {
                              return (rows as any[]).map((r) => {
                                const selected = parseSelectRow(r, idKey)
                                return {
                                  ...Struct.pick(
                                    defaultValues as any,
                                    f.select!.filter((_) => typeof _ === "string") as never[]
                                  ),
                                  ...selected
                                } as M
                              })
                            }
                            return (rows as any[]).map((r) => parseRow<Encoded>(r, idKey, defaultValues) as any as M)
                          })
                        )
                      ),
                      annotateDb({
                        operation: "filter",
                        system,
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
                  system,
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
                  system,
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
                  system,
                  collection: tableName,
                  namespace: ns,
                  entity: name
                })
              )
            )),

          batchRemove: (ids) => {
            const placeholders = ids.map(() => "?").join(", ")
            return resolveNamespace.pipe(Effect.flatMap((ns) => {
              const sqlText = `DELETE FROM "${tableName}" WHERE id IN (${placeholders}) AND _namespace = ?`
              return exec(sqlText, [...ids, ns])
                .pipe(
                  Effect.asVoid,
                  annotateDb({
                    operation: "batchRemove",
                    system,
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
                system,
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
  })
}

type WithNsSqlFn = <A, E2, R2>(
  ns: string,
  f: (sql: SqlClient.SqlClient) => Effect.Effect<A, E2, R2>
) => Effect.Effect<A, E2, R2>

function makeSQLiteStorePerNs(
  withNsSql: WithNsSqlFn,
  { prefix }: StorageConfig
) {
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

      const resolveNamespace = !config?.allowNamespace
        ? Effect.succeed("primary")
        : storeId.asEffect().pipe(Effect.map((namespace) => {
          if (namespace !== "primary" && !config.allowNamespace!(namespace)) {
            throw new Error(`Namespace ${namespace} not allowed!`)
          }
          return namespace
        }))

      const toRow = (e: PM) => {
        const newE = makeETag(e)
        const id = newE[idKey] as string
        const { _etag, [idKey]: _id, ...rest } = newE as any
        const data = JSON.stringify(rest)
        return { id, _etag: newE._etag!, data, item: newE }
      }

      const exec = (ns: string, query: string, params?: readonly unknown[]) =>
        withNsSql(ns, (sql) => sql.unsafe(query, params as any).pipe(Effect.orDie))

      const ensureTable = (ns: string) =>
        withNsSql(ns, (sql) =>
          sql
            .unsafe(
              `CREATE TABLE IF NOT EXISTS "${tableName}" (id TEXT NOT NULL PRIMARY KEY, _etag TEXT, data JSON NOT NULL)`
            )
            .pipe(
              Effect.andThen(
                sql.unsafe(
                  `CREATE TABLE IF NOT EXISTS "_migrations" (id TEXT NOT NULL, version TEXT NOT NULL, PRIMARY KEY (id, version))`
                )
              ),
              Effect.orDie,
              Effect.asVoid
            ))

      const setInternal = Effect.fnUntraced(function*(e: PM, ns: string) {
        const row = toRow(e)
        if (e._etag) {
          yield* exec(
            ns,
            `UPDATE "${tableName}" SET _etag = ?, data = ? WHERE id = ? AND _etag = ?`,
            [row._etag, row.data, row.id, e._etag]
          )
          const existing = yield* exec(
            ns,
            `SELECT _etag FROM "${tableName}" WHERE id = ?`,
            [row.id]
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
          yield* exec(
            ns,
            `INSERT INTO "${tableName}" (id, _etag, data) VALUES (?, ?, ?)`,
            [row.id, row._etag, row.data]
          )
        }
        return row.item
      })

      const bulkSetInternal = (items: NonEmptyReadonlyArray<PM>, ns: string) =>
        withNsSql(ns, (sql) =>
          sql
            .withTransaction(Effect.forEach(items, (e) => setInternal(e, ns)))
            .pipe(
              Effect.orDie,
              Effect.map((_) => _ as unknown as NonEmptyReadonlyArray<PM>)
            ))

      const ctx = yield* Effect.context<R>()
      const seedCache = new Map<string, Effect.Effect<void>>()
      const makeSeedEffect = Effect.fnUntraced(function*(ns: string) {
        yield* ensureTable(ns)
        if (!seed) return
        const existing = yield* exec(
          ns,
          `SELECT id FROM "_migrations" WHERE id = ? AND version = ?`,
          [tableName, tableName]
        )
        if ((existing as any[]).length > 0) return
        yield* InfraLogger.logInfo(`Seeding data for ${name} (namespace: ${ns})`)
        const items = yield* seed.pipe(Effect.provide(ctx), Effect.orDie)
        const ne = toNonEmptyArray([...items])
        if (Option.isSome(ne)) yield* bulkSetInternal(ne.value, ns)
        yield* exec(
          ns,
          `INSERT INTO "_migrations" (id, version) VALUES (?, ?)`,
          [tableName, tableName]
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

        all: resolveNamespace.pipe(Effect.flatMap((ns) => {
          const sqlText = `SELECT id, _etag, data FROM "${tableName}"`
          return exec(ns, sqlText)
            .pipe(
              Effect.map((rows) => (rows as any[]).map((r) => parseRow<Encoded>(r, idKey, defaultValues))),
              annotateDb({
                operation: "all",
                system: "sqlite",
                collection: tableName,
                namespace: ns,
                entity: name,
                query: sqlText
              })
            )
        })),

        find: (id) =>
          resolveNamespace.pipe(
            Effect.flatMap((ns) => {
              const sqlText = `SELECT id, _etag, data FROM "${tableName}" WHERE id = ?`
              return exec(ns, sqlText, [id])
                .pipe(
                  Effect.map((rows) => {
                    const row = (rows as any[])[0]
                    return row
                      ? Option.some(parseRow<Encoded>(row, idKey, defaultValues))
                      : Option.none()
                  }),
                  annotateDb({
                    operation: "find",
                    system: "sqlite",
                    collection: tableName,
                    namespace: ns,
                    entity: name,
                    query: sqlText,
                    extra: { "app.entity.id": id }
                  })
                )
            })
          ),

        filter: <U extends keyof Encoded = never>(f: FilterArgs<Encoded, U>) => {
          const filter = f
            .filter
          type M = U extends undefined ? Encoded
            : Pick<Encoded, U>
          return resolveNamespace
            .pipe(Effect
              .flatMap((ns) =>
                Effect
                  .sync(() =>
                    buildWhereSQLQuery(
                      sqliteDialect,
                      idKey,
                      filter ? [{ t: "where-scope", result: filter, relation: "some" }] : [],
                      tableName,
                      defaultValues,
                      f
                        .select as
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
                      f
                        .order as NonEmptyReadonlyArray<{ key: string; direction: "ASC" | "DESC" }> | undefined,
                      f
                        .skip,
                      f
                        .limit
                    )
                  )
                  .pipe(
                    Effect
                      .tap((q) => logQuery(q)),
                    Effect.tap((q) => Effect.annotateCurrentSpan({ "db.query.text": q.sql })),
                    Effect.flatMap((q) =>
                      exec(ns, q.sql, q.params).pipe(
                        Effect.map((rows) => {
                          if (f.select) {
                            return (rows as any[]).map((r) => {
                              const selected = parseSelectRow(r, idKey)
                              return {
                                ...Struct.pick(
                                  defaultValues as any,
                                  f.select!.filter((_) => typeof _ === "string") as never[]
                                ),
                                ...selected
                              } as M
                            })
                          }
                          return (rows as any[]).map((r) => parseRow<Encoded>(r, idKey, defaultValues) as any as M)
                        })
                      )
                    ),
                    annotateDb({
                      operation: "filter",
                      system: "sqlite",
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
                system: "sqlite",
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
                system: "sqlite",
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
                system: "sqlite",
                collection: tableName,
                namespace: ns,
                entity: name
              })
            )
          )),

        batchRemove: (ids) => {
          const placeholders = ids.map(() => "?").join(", ")
          return resolveNamespace.pipe(Effect.flatMap((ns) => {
            const sqlText = `DELETE FROM "${tableName}" WHERE id IN (${placeholders})`
            return exec(ns, sqlText, [...ids])
              .pipe(
                Effect.asVoid,
                annotateDb({
                  operation: "batchRemove",
                  system: "sqlite",
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
              system: "sqlite",
              collection: tableName,
              entity: name
            })
          )
      }

      yield* seedNamespace("primary")

      return s
    })
  }
}

export function SQLiteStoreLayer(
  cfg: StorageConfig,
  options?: { makeSqlClientLayer?: (namespace: string) => Layer.Layer<SqlClient.SqlClient> }
) {
  if (options?.makeSqlClientLayer) {
    return Layer.effectContext(
      Effect.gen(function*() {
        const layerMap = yield* LayerMap.make(
          (namespace: string) => options.makeSqlClientLayer!(namespace),
          { idleTimeToLive: "10 minutes" }
        )

        const withNsSql: WithNsSqlFn = (ns, f) => SqlClient.SqlClient.use(f).pipe(Effect.provide(layerMap.get(ns)))

        const storeMaker = makeSQLiteStorePerNs(withNsSql, cfg)

        const withTransaction: WithNsTransactionFn = (effect) =>
          storeId.asEffect().pipe(
            Effect.flatMap((ns) => withNsSql(ns, (sql) => sql.withTransaction(effect).pipe(Effect.orDie)))
          )

        return StoreMaker.context(storeMaker).pipe(
          Context.add(WithNsTransaction, withTransaction)
        )
      })
    )
  }
  return StoreMaker
    .toLayer(makeSQLStoreInt("sqlite", sqliteDialect, "JSON")(cfg))
}

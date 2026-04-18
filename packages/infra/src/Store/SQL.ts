/* eslint-disable @typescript-eslint/no-explicit-any */

import { Context, Layer, LayerMap } from "effect"
import { Effect, type NonEmptyReadonlyArray, Option, Struct } from "effect-app"
import { toNonEmptyArray } from "effect-app/Array"
import { SqlClient } from "effect/unstable/sql"
import { OptimisticConcurrencyException } from "../errors.js"
import { InfraLogger } from "../logger.js"
import type { FieldValues } from "../Model/filter/types.js"
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

function makeSQLStoreInt(dialect: SQLDialect, jsonColumnType: string) {
  return ({ prefix }: StorageConfig) =>
    Effect.gen(function*() {
      const sql = yield* SqlClient.SqlClient
      return {
        make: <IdKey extends keyof Encoded, Encoded extends FieldValues, R = never, E = never>(
          name: string,
          idKey: IdKey,
          seed?: Effect.Effect<Iterable<Encoded>, E, R>,
          config?: StoreConfig<Encoded>
        ) =>
          Effect.gen(function*() {
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
              .pipe(Effect.orDie, Effect.asVoid)

            const toRow = (e: PM) => {
              const newE = makeETag(e)
              const id = newE[idKey] as string
              const { _etag, [idKey]: _id, ...rest } = newE as any
              const data = JSON.stringify(rest)
              return { id, _etag: newE._etag!, data, item: newE }
            }

            const exec = (query: string, params?: readonly unknown[]) =>
              sql.unsafe(query, params as any).pipe(Effect.orDie)

            const seedMarkerId = `__seed_marker__`

            const setInternal = (e: PM, ns: string) =>
              Effect.gen(function*() {
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
                `SELECT id FROM "${tableName}" WHERE id = ? AND _namespace = ?`,
                [seedMarkerId, `__seed__::${ns}`]
              )
              if ((existing as any[]).length > 0) return
              yield* InfraLogger.logInfo(`Seeding data for ${name} (namespace: ${ns})`)
              const items = yield* seed.pipe(Effect.provide(ctx), Effect.orDie)
              const ne = toNonEmptyArray([...items])
              if (Option.isSome(ne)) yield* bulkSetInternal(ne.value, ns)
              yield* exec(
                `INSERT INTO "${tableName}" (id, _namespace, _etag, data) VALUES (?, ?, ?, ?)`,
                [seedMarkerId, `__seed__::${ns}`, null, JSON.stringify({ _marker: true })]
              )
            })
            const seedNamespace = (ns: string) => {
              let cached = seedCache.get(ns)
              if (!cached) {
                cached = Effect.cached(makeSeedEffect(ns)).pipe(Effect.runSync)
                seedCache.set(ns, cached)
              }
              return cached
            }
            const s: Store<IdKey, Encoded> = {
              seedNamespace: (ns) => seedNamespace(ns),

              all: resolveNamespace.pipe(Effect.flatMap((ns) =>
                exec(`SELECT id, _etag, data FROM "${tableName}" WHERE _namespace = ?`, [ns])
                  .pipe(
                    Effect.map((rows) => (rows as any[]).map((r) => parseRow<Encoded>(r, idKey, defaultValues))),
                    Effect.withSpan("SQL.all [effect-app/infra/Store]", {
                      attributes: {
                        "repository.table_name": tableName,
                        "repository.model_name": name,
                        "repository.namespace": ns
                      }
                    }, { captureStackTrace: false })
                  )
              )),

              find: (id) =>
                resolveNamespace.pipe(Effect.flatMap((ns) =>
                  exec(`SELECT id, _etag, data FROM "${tableName}" WHERE id = ? AND _namespace = ?`, [id, ns])
                    .pipe(
                      Effect.map((rows) => {
                        const row = (rows as any[])[0]
                        return row
                          ? Option.some(parseRow<Encoded>(row, idKey, defaultValues))
                          : Option.none()
                      }),
                      Effect.withSpan("SQL.find [effect-app/infra/Store]", {
                        attributes: { "repository.table_name": tableName, "repository.model_name": name, id }
                      }, { captureStackTrace: false })
                    )
                )),

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
                                | NonEmptyReadonlyArray<string | { key: string; subKeys: readonly string[] }>
                                | undefined,
                            f
                              .order as NonEmptyReadonlyArray<{ key: string; direction: "ASC" | "DESC" }> | undefined,
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
                            .tap((q) =>
                              logQuery(q)
                            ),
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
                                return (rows as any[]).map((r) =>
                                  parseRow<Encoded>(r, idKey, defaultValues) as any as M
                                )
                              })
                            )
                          ),
                          Effect.withSpan("SQL.filter [effect-app/infra/Store]", {
                            attributes: { "repository.table_name": tableName, "repository.model_name": name }
                          }, { captureStackTrace: false })
                        )
                    ))
              },

              set: (e) =>
                resolveNamespace.pipe(Effect.flatMap((ns) =>
                  setInternal(e, ns).pipe(
                    Effect.withSpan("SQL.set [effect-app/infra/Store]", {
                      attributes: { "repository.table_name": tableName, "repository.model_name": name, id: e[idKey] }
                    }, { captureStackTrace: false })
                  )
                )),

              batchSet: (items) =>
                resolveNamespace.pipe(Effect.flatMap((ns) =>
                  bulkSetInternal(items, ns).pipe(
                    Effect.withSpan("SQL.batchSet [effect-app/infra/Store]", {
                      attributes: { "repository.table_name": tableName, "repository.model_name": name }
                    }, { captureStackTrace: false })
                  )
                )),

              bulkSet: (items) =>
                resolveNamespace.pipe(Effect.flatMap((ns) =>
                  bulkSetInternal(items, ns).pipe(
                    Effect.withSpan("SQL.bulkSet [effect-app/infra/Store]", {
                      attributes: { "repository.table_name": tableName, "repository.model_name": name }
                    }, { captureStackTrace: false })
                  )
                )),

              batchRemove: (ids) => {
                const placeholders = ids.map(() => "?").join(", ")
                return resolveNamespace.pipe(Effect.flatMap((ns) =>
                  exec(
                    `DELETE FROM "${tableName}" WHERE id IN (${placeholders}) AND _namespace = ?`,
                    [...ids, ns]
                  )
                    .pipe(
                      Effect.asVoid,
                      Effect.withSpan("SQL.batchRemove [effect-app/infra/Store]", {
                        attributes: { "repository.table_name": tableName, "repository.model_name": name }
                      }, { captureStackTrace: false })
                    )
                ))
              },

              queryRaw: (query) =>
                s.all.pipe(
                  Effect.map(query.memory),
                  Effect.withSpan("SQL.queryRaw [effect-app/infra/Store]", {
                    attributes: { "repository.table_name": tableName, "repository.model_name": name }
                  }, { captureStackTrace: false })
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
    make: <IdKey extends keyof Encoded, Encoded extends FieldValues, R = never, E = never>(
      name: string,
      idKey: IdKey,
      seed?: Effect.Effect<Iterable<Encoded>, E, R>,
      config?: StoreConfig<Encoded>
    ) =>
      Effect.gen(function*() {
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

        const setInternal = (e: PM, ns: string) =>
          Effect.gen(function*() {
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
            cached = Effect.cached(makeSeedEffect(ns)).pipe(Effect.runSync)
            seedCache.set(ns, cached)
          }
          return cached
        }

        const s: Store<IdKey, Encoded> = {
          seedNamespace: (ns) => seedNamespace(ns),

          all: resolveNamespace.pipe(Effect.flatMap((ns) =>
            exec(ns, `SELECT id, _etag, data FROM "${tableName}"`)
              .pipe(
                Effect.map((rows) => (rows as any[]).map((r) => parseRow<Encoded>(r, idKey, defaultValues))),
                Effect.withSpan("SQLite.all [effect-app/infra/Store]", {
                  attributes: {
                    "repository.table_name": tableName,
                    "repository.model_name": name,
                    "repository.namespace": ns
                  }
                }, { captureStackTrace: false })
              )
          )),

          find: (id) =>
            resolveNamespace.pipe(Effect.flatMap((ns) =>
              exec(ns, `SELECT id, _etag, data FROM "${tableName}" WHERE id = ?`, [id])
                .pipe(
                  Effect.map((rows) => {
                    const row = (rows as any[])[0]
                    return row
                      ? Option.some(parseRow<Encoded>(row, idKey, defaultValues))
                      : Option.none()
                  }),
                  Effect.withSpan("SQLite.find [effect-app/infra/Store]", {
                    attributes: { "repository.table_name": tableName, "repository.model_name": name, id }
                  }, { captureStackTrace: false })
                )
            )),

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
                            | NonEmptyReadonlyArray<string | { key: string; subKeys: readonly string[] }>
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
                        .tap((q) =>
                          logQuery(q)
                        ),
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
                      Effect.withSpan("SQLite.filter [effect-app/infra/Store]", {
                        attributes: { "repository.table_name": tableName, "repository.model_name": name }
                      }, { captureStackTrace: false })
                    )
                ))
          },

          set: (e) =>
            resolveNamespace.pipe(Effect.flatMap((ns) =>
              setInternal(e, ns).pipe(
                Effect.withSpan("SQLite.set [effect-app/infra/Store]", {
                  attributes: { "repository.table_name": tableName, "repository.model_name": name, id: e[idKey] }
                }, { captureStackTrace: false })
              )
            )),

          batchSet: (items) =>
            resolveNamespace.pipe(Effect.flatMap((ns) =>
              bulkSetInternal(items, ns).pipe(
                Effect.withSpan("SQLite.batchSet [effect-app/infra/Store]", {
                  attributes: { "repository.table_name": tableName, "repository.model_name": name }
                }, { captureStackTrace: false })
              )
            )),

          bulkSet: (items) =>
            resolveNamespace.pipe(Effect.flatMap((ns) =>
              bulkSetInternal(items, ns).pipe(
                Effect.withSpan("SQLite.bulkSet [effect-app/infra/Store]", {
                  attributes: { "repository.table_name": tableName, "repository.model_name": name }
                }, { captureStackTrace: false })
              )
            )),

          batchRemove: (ids) => {
            const placeholders = ids.map(() => "?").join(", ")
            return resolveNamespace.pipe(Effect.flatMap((ns) =>
              exec(
                ns,
                `DELETE FROM "${tableName}" WHERE id IN (${placeholders})`,
                [...ids]
              )
                .pipe(
                  Effect.asVoid,
                  Effect.withSpan("SQLite.batchRemove [effect-app/infra/Store]", {
                    attributes: { "repository.table_name": tableName, "repository.model_name": name }
                  }, { captureStackTrace: false })
                )
            ))
          },

          queryRaw: (query) =>
            s.all.pipe(
              Effect.map(query.memory),
              Effect.withSpan("SQLite.queryRaw [effect-app/infra/Store]", {
                attributes: { "repository.table_name": tableName, "repository.model_name": name }
              }, { captureStackTrace: false })
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
          ) as any

        return StoreMaker.context(storeMaker).pipe(
          Context.add(WithNsTransaction, withTransaction)
        )
      })
    )
  }
  return StoreMaker
    .toLayer(makeSQLStoreInt(sqliteDialect, "JSON")(cfg))
}

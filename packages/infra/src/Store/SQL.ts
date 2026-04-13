/* eslint-disable @typescript-eslint/no-explicit-any */

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

/** @internal */
export const parseRow = <Encoded extends FieldValues>(
  row: { id: string; _etag: string | null; data: string },
  idKey: PropertyKey,
  defaultValues: Partial<Encoded>
): PersistenceModelType<Encoded> => {
  const data = (typeof row.data === "string" ? JSON.parse(row.data) : row.data) as object
  return { ...defaultValues, ...data, [idKey]: row.id, _etag: row._etag ?? undefined } as PersistenceModelType<Encoded>
}

const parseSelectRow = <Encoded extends FieldValues>(
  row: Record<string, unknown>,
  idKey: PropertyKey,
  defaultValues: Partial<Encoded>
): any => {
  const result: Record<string, unknown> = { ...defaultValues }
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

            yield* sql
              .unsafe(
                `CREATE TABLE IF NOT EXISTS "${tableName}" (id TEXT NOT NULL, _namespace TEXT NOT NULL DEFAULT 'primary', _etag TEXT, data ${jsonColumnType} NOT NULL, PRIMARY KEY (id, _namespace))`
              )
              .pipe(Effect.orDie)

            const toRow = (e: PM) => {
              const newE = makeETag(e)
              const id = newE[idKey] as string
              const { _etag, [idKey]: _id, ...rest } = newE as any
              const data = JSON.stringify(rest)
              return { id, _etag: newE._etag!, data, item: newE }
            }

            const exec = (query: string, params?: readonly unknown[]) =>
              sql.unsafe(query, params as any).pipe(Effect.orDie)

            const ctx = yield* Effect.context<R>()
            const seedCache = new Map<string, Effect.Effect<void>>()
            const makeSeedEffect = (ns: string) =>
              exec(
                `SELECT COUNT(*) as cnt FROM "${tableName}" WHERE _namespace = ?`,
                [ns]
              )
                .pipe(
                  Effect.flatMap((existing) => {
                    const count = (existing as any[])[0]?.cnt ?? 0
                    if (count === 0) {
                      return InfraLogger.logInfo(`Seeding data for ${name} (namespace: ${ns})`).pipe(
                        Effect.andThen(seed!),
                        Effect.flatMap((items) =>
                          Effect.flatMapOption(
                            Effect.succeed(toNonEmptyArray([...items])),
                            (a) => s.bulkSet(a).pipe(Effect.orDie)
                          )
                        ),
                        Effect.provide(ctx),
                        Effect.orDie
                      )
                    }
                    return Effect.void
                  })
                )
            const seedNamespace = Effect.fn("seedNamespace")(function*(ns: string) {
              if (!seed) return
              let cached = seedCache.get(ns)
              if (!cached) {
                cached = yield* Effect.cached(makeSeedEffect(ns))
                seedCache.set(ns, cached)
              }
              yield* cached
            })
            const resolveAndSeed = resolveNamespace.pipe(
              Effect.tap((ns) => seedNamespace(ns))
            )

            const s: Store<IdKey, Encoded> = {
              all: resolveAndSeed.pipe(Effect.flatMap((ns) =>
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
                resolveAndSeed.pipe(Effect.flatMap((ns) =>
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
                return resolveAndSeed
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
                                    const selected = parseSelectRow(r, idKey, {})
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
                resolveAndSeed.pipe(Effect.flatMap((ns) =>
                  Effect
                    .gen(function*() {
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
                    .pipe(
                      Effect.withSpan("SQL.set [effect-app/infra/Store]", {
                        attributes: { "repository.table_name": tableName, "repository.model_name": name, id: e[idKey] }
                      }, { captureStackTrace: false })
                    )
                )),

              batchSet: (items) =>
                sql
                  .withTransaction(
                    Effect.forEach(items, (e) => s.set(e))
                  )
                  .pipe(
                    Effect.orDie,
                    Effect.map((_) => _ as unknown as NonEmptyReadonlyArray<PM>),
                    Effect.withSpan("SQL.batchSet [effect-app/infra/Store]", {
                      attributes: { "repository.table_name": tableName, "repository.model_name": name }
                    }, { captureStackTrace: false })
                  ),

              bulkSet: (items) =>
                sql
                  .withTransaction(
                    Effect.forEach(items, (e) => s.set(e))
                  )
                  .pipe(
                    Effect.orDie,
                    Effect.map((_) => _ as unknown as NonEmptyReadonlyArray<PM>),
                    Effect.withSpan("SQL.bulkSet [effect-app/infra/Store]", {
                      attributes: { "repository.table_name": tableName, "repository.model_name": name }
                    }, { captureStackTrace: false })
                  ),

              batchRemove: (ids) => {
                const placeholders = ids.map(() => "?").join(", ")
                return resolveAndSeed.pipe(Effect.flatMap((ns) =>
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

export function SQLiteStoreLayer(cfg: StorageConfig) {
  return StoreMaker
    .toLayer(makeSQLStoreInt(sqliteDialect, "JSON")(cfg))
}

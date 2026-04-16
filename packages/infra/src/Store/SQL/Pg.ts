/* eslint-disable @typescript-eslint/no-explicit-any */

import { Effect, type NonEmptyReadonlyArray, Option, Struct } from "effect-app"
import { toNonEmptyArray } from "effect-app/Array"
import { SqlClient } from "effect/unstable/sql"
import { OptimisticConcurrencyException } from "../../errors.js"
import { InfraLogger } from "../../logger.js"
import type { FieldValues } from "../../Model/filter/types.js"
import { storeId } from "../Memory.js"
import { type FilterArgs, type PersistenceModelType, type StorageConfig, type Store, type StoreConfig, StoreMaker } from "../service.js"
import { makeETag } from "../utils.js"
import { buildWhereSQLQuery, logQuery, pgDialect } from "./query.js"

const parseRow = <Encoded extends FieldValues>(
  row: { id: string; _etag: string | null; data: unknown },
  idKey: PropertyKey,
  defaultValues: Partial<Encoded>
): PersistenceModelType<Encoded> => {
  const data = (typeof row.data === "string" ? JSON.parse(row.data) : row.data) as object
  return { ...defaultValues, ...data, [idKey]: row.id, _etag: row._etag ?? undefined } as PersistenceModelType<Encoded>
}

const parseSelectRow = (
  row: Record<string, unknown>,
  idKey: PropertyKey,
  defaultValues: Record<string, unknown>
): any => {
  const result: Record<string, unknown> = { ...defaultValues }
  for (const [key, value] of Object.entries(row)) {
    if (key === "id") {
      result[idKey as string] = value
      result["id"] = value
    } else {
      result[key] = value
    }
  }
  return result
}

const makePgStore = Effect.fnUntraced(function*({ prefix }: StorageConfig) {
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

      yield* sql
        .unsafe(
          `CREATE TABLE IF NOT EXISTS "${tableName}" (id TEXT NOT NULL, _namespace TEXT NOT NULL DEFAULT 'primary', _etag TEXT, data JSONB NOT NULL, PRIMARY KEY (id, _namespace))`
        )
        .pipe(Effect.orDie)

      const toRow = (e: PM) => {
        const newE = makeETag(e)
        const id = newE[idKey] as string
        const { _etag, [idKey]: _id, ...rest } = newE as any
        const data = JSON.stringify(rest)
        return { id, _etag: newE._etag!, data, item: newE }
      }

      const exec = (query: string, params?: readonly unknown[]) => sql.unsafe(query, params as any).pipe(Effect.orDie)

      const seedMarkerId = `__seed_marker__`

      const setInternal = Effect.fnUntraced(function*(e: PM, ns: string) {
        const row = toRow(e)
        if (e._etag) {
          yield* exec(
            `UPDATE "${tableName}" SET _etag = $1, data = $2 WHERE id = $3 AND _etag = $4 AND _namespace = $5`,
            [row._etag, row.data, row.id, e._etag, ns]
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
          yield* exec(
            `INSERT INTO "${tableName}" (id, _namespace, _etag, data) VALUES ($1, $2, $3, $4)`,
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
        const existing = yield* exec(
          `SELECT id FROM "${tableName}" WHERE id = $1 AND _namespace = $2`,
          [seedMarkerId, `__seed__::${ns}`]
        )
        if ((existing as any[]).length > 0) return
        yield* InfraLogger.logInfo(`Seeding data for ${name} (namespace: ${ns})`)
        const items = yield* seed!
        const arr = toNonEmptyArray([...items])
        if (Option.isSome(arr)) {
          yield* bulkSetInternal(arr.value, ns)
        }
        yield* exec(
          `INSERT INTO "${tableName}" (id, _namespace, _etag, data) VALUES ($1, $2, $3, $4)`,
          [seedMarkerId, `__seed__::${ns}`, null, JSON.stringify({ _marker: true })]
        )
      }, (effect) => effect.pipe(Effect.provide(ctx), Effect.orDie))

      const seedNamespace = Effect.fn("seedNamespace")(function*(ns: string) {
        if (!seed) return
        let cached = seedCache.get(ns)
        if (!cached) {
          cached = yield* Effect.cached(makeSeedEffect(ns))
          seedCache.set(ns, cached)
        }
        yield* cached
      })
      const resolveAndSeed = Effect.tap(resolveNamespace, (ns) => seedNamespace(ns))

      const tableAttrs = { "repository.table_name": tableName, "repository.model_name": name }

      const s: Store<IdKey, Encoded> = {
        all: Effect
          .gen(function*() {
            const ns = yield* resolveAndSeed
            const rows = yield* exec(`SELECT id, _etag, data FROM "${tableName}" WHERE _namespace = $1`, [ns])
            yield* Effect.annotateCurrentSpan({ "repository.namespace": ns })
            return (rows as any[]).map((r) => parseRow<Encoded>(r, idKey, defaultValues))
          })
          .pipe(Effect.withSpan("PgSQL.all [effect-app/infra/Store]", { attributes: tableAttrs })),

        find: Effect.fn("PgSQL.find [effect-app/infra/Store]", { attributes: tableAttrs })(function*(id) {
          yield* Effect.annotateCurrentSpan({ id })
          const ns = yield* resolveAndSeed
          const rows = yield* exec(
            `SELECT id, _etag, data FROM "${tableName}" WHERE id = $1 AND _namespace = $2`,
            [id, ns]
          )
          const row = (rows as any[])[0]
          return row
            ? Option.some(parseRow<Encoded>(row, idKey, defaultValues))
            : Option.none()
        }),

        filter: Effect.fn("PgSQL.filter [effect-app/infra/Store]", { attributes: tableAttrs })(function*<
          U extends keyof Encoded = never
        >(f: FilterArgs<Encoded, U>) {
          type M = U extends undefined ? Encoded : Pick<Encoded, U>
          const ns = yield* resolveAndSeed
          const filter = f.filter
          const baseQ = buildWhereSQLQuery(
            pgDialect,
            idKey,
            filter ? [{ t: "where-scope", result: filter, relation: "some" }] : [],
            tableName,
            defaultValues,
            f.select as
              | NonEmptyReadonlyArray<string | { key: string; subKeys: readonly string[] }>
              | undefined,
            f.order as NonEmptyReadonlyArray<{ key: string; direction: "ASC" | "DESC" }> | undefined,
            f.skip,
            f.limit
          )
          const nsPlaceholder = pgDialect.placeholder(baseQ.params.length + 1)
          const hasWhere = baseQ.sql.includes("WHERE")
          const nsSql = hasWhere
            ? baseQ.sql.replace("WHERE", `WHERE _namespace = ${nsPlaceholder} AND`)
            : baseQ.sql.replace(
              `FROM "${tableName}"`,
              `FROM "${tableName}" WHERE _namespace = ${nsPlaceholder}`
            )
          const q = { sql: nsSql, params: [...baseQ.params, ns] }
          yield* logQuery(q)
          const rows = yield* exec(q.sql, q.params)
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
          return (rows as any[]).map((r) => parseRow<Encoded>(r, idKey, defaultValues) as any as M)
        }),

        set: Effect.fn("PgSQL.set [effect-app/infra/Store]", { attributes: tableAttrs })(function*(e) {
          yield* Effect.annotateCurrentSpan({ id: e[idKey] })
          const ns = yield* resolveAndSeed
          return yield* setInternal(e, ns)
        }),

        batchSet: Effect.fn("PgSQL.batchSet [effect-app/infra/Store]", { attributes: tableAttrs })(function*(items) {
          const ns = yield* resolveAndSeed
          return yield* bulkSetInternal(items, ns)
        }),

        bulkSet: Effect.fn("PgSQL.bulkSet [effect-app/infra/Store]", { attributes: tableAttrs })(function*(items) {
          const ns = yield* resolveAndSeed
          return yield* bulkSetInternal(items, ns)
        }),

        batchRemove: Effect.fn("PgSQL.batchRemove [effect-app/infra/Store]", { attributes: tableAttrs })(function*(
          ids
        ) {
          const ns = yield* resolveAndSeed
          const placeholders = ids.map((_, i) => `$${i + 1}`).join(", ")
          const nsPlaceholder = `$${ids.length + 1}`
          yield* exec(
            `DELETE FROM "${tableName}" WHERE id IN (${placeholders}) AND _namespace = ${nsPlaceholder}`,
            [...ids, ns]
          )
        }),

        queryRaw: Effect.fn("PgSQL.queryRaw [effect-app/infra/Store]", { attributes: tableAttrs })(function*(query) {
          return query.memory(yield* s.all)
        })
      }

      // Eagerly seed primary namespace on initialization
      yield* seedNamespace("primary")

      return s
    })
  }
})

export function PgStoreLayer(cfg: StorageConfig) {
  return StoreMaker
    .toLayer(makePgStore(cfg))
}

/* eslint-disable @typescript-eslint/no-explicit-any */

import { Array, Context, Effect, flow, type NonEmptyReadonlyArray, Option, Order, pipe, Ref, Result, Semaphore, Struct } from "effect-app"
import { NonEmptyString255 } from "effect-app/Schema"
import { assertUnreachable } from "effect-app/utils"
import { InfraLogger } from "../logger.js"
import type { FilterResult } from "../Model/filter/filterApi.js"
import type { FieldValues } from "../Model/filter/types.js"
import type { ComputedProjectionIrExpression, ComputedProjectionMathIrExpression } from "../Model/query.js"
import { annotateDb } from "../otel.js"
import { codeFilter, codeFilter3_ } from "./codeFilter.js"
import { type FilterArgs, type PersistenceModelType, type Store, type StoreConfig, StoreMaker } from "./service.js"
import { makeUpdateETag } from "./utils.js"

/** Traverse an object by a dot-separated path string, e.g. `"a.b.c"`. */
export function get(obj: any, path: string): any {
  return path.split(".").reduce((res: any, key: string) => (res != null ? res[key] : res), obj)
}

const stripRelationFilterPaths = (state: readonly FilterResult[], relationPath: string): readonly FilterResult[] => {
  const prefix = `${relationPath}.-1.`
  return state.map((entry) =>
    "path" in entry
      ? {
        ...entry,
        path: entry.path.startsWith(prefix) ? entry.path.slice(prefix.length) : entry.path
      }
      : {
        ...entry,
        result: stripRelationFilterPaths(entry.result, relationPath)
      }
  )
}

const emptyValueFor = (tag: ComputedProjectionIrExpression["_tag"]) => {
  switch (tag) {
    case "relation-count":
    case "relation-distinct-count":
    case "relation-sum":
    case "relation-sum-expr":
    case "relation-sum-expr-normalized":
      return 0
    case "relation-sum-expr-by":
      return [] as unknown[]
    case "relation-any":
      return false
    case "relation-every":
      return true
    case "relation-collect":
      return [] as unknown[]
    default:
      return assertUnreachable(tag)
  }
}

const computeProjectionValue = (
  row: FieldValues,
  computed: ComputedProjectionIrExpression
) => {
  const relation = get(row, computed.path)
  if (!Array.isArray(relation)) {
    return emptyValueFor(computed._tag)
  }
  const filter = stripRelationFilterPaths(computed.filter, computed.path)
  const matches = (value: unknown) => codeFilter3_(filter, value)
  const evalExpr = (value: unknown, expression: ComputedProjectionMathIrExpression): number => {
    switch (expression._tag) {
      case "field": {
        const v = get(value, expression.field)
        return typeof v === "number" ? v : Number(v) || 0
      }
      case "mul":
        return evalExpr(value, expression.left) * evalExpr(value, expression.right)
      default:
        return assertUnreachable(expression)
    }
  }
  switch (computed._tag) {
    case "relation-count":
      return relation.reduce<number>((acc, value) => matches(value) ? acc + 1 : acc, 0)
    case "relation-any":
      return relation.some(matches)
    case "relation-every":
      return relation.every(matches)
    case "relation-distinct-count": {
      const seen = new Set<unknown>()
      for (const value of relation) {
        if (matches(value)) seen.add(get(value, computed.field))
      }
      return seen.size
    }
    case "relation-sum":
      return relation.reduce<number>((acc, value) => {
        if (!matches(value)) return acc
        const v = get(value, computed.field)
        return acc + (typeof v === "number" ? v : Number(v) || 0)
      }, 0)
    case "relation-sum-expr":
      return relation.reduce<number>((acc, value) => {
        if (!matches(value)) return acc
        return acc + evalExpr(value, computed.expression)
      }, 0)
    case "relation-sum-expr-by": {
      const totals = new Map<unknown, number>()
      for (const value of relation) {
        if (!matches(value)) continue
        const unit = get(value, computed.unit)
        const current = totals.get(unit) ?? 0
        totals.set(unit, current + evalExpr(value, computed.expression))
      }
      return [...totals.entries()].map(([unit, total]) => ({ unit, total }))
    }
    case "relation-sum-expr-normalized":
      return relation.reduce<number>((acc, value) => {
        if (!matches(value)) return acc
        const unit = get(value, computed.unit)
        const factor = unit === computed.toBase ? 1 : computed.factors[String(unit)]
        if (factor === undefined || !Number.isFinite(factor)) return acc
        return acc + evalExpr(value, computed.expression) * factor
      }, 0)
    case "relation-collect": {
      const out: unknown[] = []
      const seen = computed.distinct ? new Set<unknown>() : undefined
      for (const value of relation) {
        if (!matches(value)) continue
        const v = get(value, computed.field)
        if (seen) {
          if (seen.has(v)) continue
          seen.add(v)
        }
        out.push(v)
      }
      return out
    }
    default:
      return assertUnreachable(computed)
  }
}

export function memFilter<T extends FieldValues, U extends keyof T = never>(f: FilterArgs<T, U>) {
  type M = U extends undefined ? T : Pick<T, U>
  return ((c: T[]): M[] => {
    const select = (r: T[]): M[] => {
      const sel = f.select
      if (!sel) return r as M[]
      return r.map((i) => {
        const [keys, entries] = pipe(
          sel,
          Array.partition((entry) => typeof entry === "string" ? Result.fail(String(entry)) : Result.succeed(entry))
        )
        const subKeys = entries.filter((entry): entry is { key: string; subKeys: readonly string[] } =>
          typeof entry === "object" && entry !== null && "subKeys" in entry
        )
        const computedKeys = entries.filter((entry): entry is {
          key: string
          computed: ComputedProjectionIrExpression
        } => typeof entry === "object" && entry !== null && "computed" in entry)
        const n = Struct.pick(i, keys)
        subKeys.forEach((subKey) => {
          n[subKey.key] = i[subKey.key]!.map(Struct.pick(subKey.subKeys as never[]))
        })
        computedKeys.forEach((entry) => {
          ;(n as Record<string, unknown>)[entry.key] = computeProjectionValue(i, entry.computed)
        })
        return n as M
      })
    }
    const skip = f?.skip
    const limit = f?.limit
    const ords = Option.map(Option.fromNullishOr(f.order), (_) =>
      _.map((_) =>
        Order.make<T>((self, that) => {
          // TODO: inspect data types for the right comparison?
          const selfV = get(self, _.key) ?? false
          const thatV = get(that, _.key) ?? false
          if (selfV === thatV) {
            return 0
          }
          if (_.direction === "ASC") {
            return selfV < thatV ? -1 : 1
          }
          return selfV < thatV ? 1 : -1
        })
      ))
    if (Option.isSome(ords)) {
      c = Array.sortBy(...ords.value)(c)
    }
    if (!skip && limit === 1) {
      return select(
        Array.findFirst(c, f.filter ? codeFilter(f.filter) : (_) => Option.some(_)).pipe(
          Option.map(Array.make),
          Option.getOrElse(
            () => []
          )
        )
      )
    }
    let r = f.filter ? Array.filter(c, (x) => codeFilter3_(f.filter!, x)) : c
    if (skip) {
      r = Array.drop(r, skip)
    }
    if (limit !== undefined) {
      r = Array.take(r, limit)
    }

    return select(r)
  })
}

const defaultNs: NonEmptyString255 = NonEmptyString255("primary")
export class storeId extends Context.Reference("StoreId", { defaultValue: (): NonEmptyString255 => defaultNs }) {}

function logQuery(f: FilterArgs<any, any>, defaultValues?: any) {
  return InfraLogger
    .logDebug("mem query")
    .pipe(Effect.annotateLogs({
      filter: JSON.stringify(
        f.filter,
        undefined,
        2
      ),
      order: JSON.stringify(f.order, undefined, 2),
      select: JSON.stringify(f.select, undefined, 2),
      defaultValues: JSON.stringify(defaultValues, undefined, 2),
      skip: f.skip,
      limit: f.limit
    }))
}

export function makeMemoryStoreInt<IdKey extends keyof Encoded, Encoded extends FieldValues, R = never, E = never>(
  modelName: string,
  idKey: IdKey,
  namespace: string,
  seed?: Effect.Effect<Iterable<Encoded>, E, R>,
  _defaultValues?: Partial<Encoded>
) {
  type PM = PersistenceModelType<Encoded>
  return Effect.gen(function*() {
    const updateETag = makeUpdateETag(modelName)
    const items_ = yield* seed ?? Effect.sync(() => [])
    const defaultValues = _defaultValues ?? {}

    const items = new Map([...items_].map((_) => [_[idKey], { _etag: undefined, ...defaultValues, ..._ }] as const))
    const store = Ref.makeUnsafe<ReadonlyMap<Encoded[IdKey], PM>>(items)
    const sem = Semaphore.makeUnsafe(1)
    const withPermit = sem.withPermits(1)
    const values = Effect.map(Ref.get(store), (s) => s.values())

    const all = Effect.map(values, Array.fromIterable)

    const batchSet = (items: NonEmptyReadonlyArray<PM>) =>
      Effect
        .forEach(items, (i) => Effect.flatMap(s.find(i[idKey]), (current) => updateETag(i, idKey, current)))
        .pipe(
          Effect
            .tap((items) =>
              Ref
                .get(store)
                .pipe(
                  Effect
                    .map((m) => {
                      const mut = m as Map<Encoded[IdKey], PM>
                      items.forEach((e) => mut.set(e[idKey], e))
                      return mut
                    }),
                  Effect
                    .flatMap((_) => Ref.set(store, _))
                )
            ),
          Effect
            .map((_) => _),
          withPermit
        )

    const batchRemove = (items: NonEmptyReadonlyArray<Encoded[IdKey]>) =>
      Ref
        .get(store)
        .pipe(
          Effect
            .map((m) => {
              return new Map([...m].filter(([_k]) => !items.includes(_k)))
            }),
          Effect
            .flatMap((_) => Ref.set(store, _))
        )
        .pipe(
          withPermit
        )
    const s: Store<IdKey, Encoded> = {
      seedNamespace: () => Effect.void,

      queryRaw: (query) =>
        all
          .pipe(
            // Effect.tap(() => logQuery(query, defaultValues)),
            Effect.map(query.memory),
            annotateDb({
              operation: "queryRaw",
              system: "memory",
              collection: modelName,
              namespace,
              entity: modelName
            })
          ),

      all: all.pipe(annotateDb({
        operation: "all",
        system: "memory",
        collection: modelName,
        namespace,
        entity: modelName
      })),
      find: (id) =>
        Ref
          .get(store)
          .pipe(
            Effect.map((_) => Option.fromNullishOr(_.get(id))),
            annotateDb({
              operation: "find",
              system: "memory",
              collection: modelName,
              namespace,
              entity: modelName,
              extra: { "app.entity.id": id as unknown }
            })
          ),
      filter: (f) =>
        all
          .pipe(
            Effect.tap(() => logQuery(f, defaultValues)),
            Effect.map(memFilter(f)),
            annotateDb({
              operation: "filter",
              system: "memory",
              collection: modelName,
              namespace,
              entity: modelName
            })
          ),
      set: (e) =>
        s
          .find(e[idKey])
          .pipe(
            Effect.flatMap((current) => updateETag(e, idKey, current)),
            Effect
              .tap((e) =>
                Ref.get(store).pipe(
                  Effect.map((_) => new Map([..._, [e[idKey], e]])),
                  Effect.flatMap((_) => Ref.set(store, _))
                )
              ),
            withPermit,
            annotateDb({
              operation: "set",
              system: "memory",
              collection: modelName,
              namespace,
              entity: modelName,
              extra: { "app.entity.id": e[idKey] as unknown }
            })
          ),
      batchRemove: (items: NonEmptyReadonlyArray<Encoded[IdKey]>) =>
        pipe(
          Effect
            .sync(() => items)
            // align with CosmosDB
            .pipe(
              Effect.filterOrFail((_) => _.length <= 100, () => "BatchRemove: a batch may not exceed 100 items"),
              Effect.orDie,
              Effect.andThen(batchRemove),
              annotateDb({
                operation: "batchRemove",
                system: "memory",
                collection: modelName,
                namespace,
                entity: modelName
              })
            )
        ),
      batchSet: (items: readonly [PM, ...PM[]]) =>
        pipe(
          Effect
            .sync(() => items)
            // align with CosmosDB
            .pipe(
              Effect.filterOrFail((_) => _.length <= 100, () => "BatchSet: a batch may not exceed 100 items"),
              Effect.orDie,
              Effect.andThen(batchSet),
              annotateDb({
                operation: "batchSet",
                system: "memory",
                collection: modelName,
                namespace,
                entity: modelName
              })
            )
        ),
      bulkSet: flow(
        batchSet,
        (_) =>
          _.pipe(annotateDb({
            operation: "bulkSet",
            system: "memory",
            collection: modelName,
            namespace,
            entity: modelName
          }))
      )
    }
    return s
  })
}

export const makeMemoryStore = () => ({
  make: Effect.fnUntraced(function*<IdKey extends keyof Encoded, Encoded extends FieldValues, R, E>(
    modelName: string,
    idKey: IdKey,
    seed?: Effect.Effect<Iterable<Encoded>, E, R>,
    config?: StoreConfig<Encoded>
  ) {
    const primary = yield* makeMemoryStoreInt<IdKey, Encoded, R, E>(
      modelName,
      idKey,
      "primary",
      seed,
      config?.defaultValues
    )
    const ctx = yield* Effect.context<R>()
    const stores = new Map([["primary", primary]])
    const semaphores = new Map<string, Semaphore.Semaphore>()
    const getSem = (ns: string) => {
      let sem = semaphores.get(ns)
      if (!sem) {
        sem = Semaphore.makeUnsafe(1)
        semaphores.set(ns, sem)
      }
      return sem
    }
    const ensureStore = (namespace: string) =>
      getSem(namespace).withPermits(1)(Effect.suspend(() => {
        const store = stores.get(namespace)
        if (store) return Effect.succeed(store)
        if (config?.allowNamespace && !config.allowNamespace(namespace)) {
          throw new Error(`Namespace ${namespace} not allowed!`)
        }
        return makeMemoryStoreInt(modelName, idKey, namespace, seed, config?.defaultValues)
          .pipe(
            Effect.orDie,
            Effect.provide(ctx),
            Effect.tap((store) => Effect.sync(() => stores.set(namespace, store)))
          )
      }))
    const getStore = !config?.allowNamespace
      ? Effect.succeed(primary)
      : storeId.asEffect().pipe(Effect.flatMap((namespace) => ensureStore(namespace)))
    const s: Store<IdKey, Encoded> = {
      seedNamespace: (namespace) => ensureStore(namespace).pipe(Effect.asVoid),
      all: Effect.flatMap(getStore, (_) => _.all),
      queryRaw: (...args) => Effect.flatMap(getStore, (_) => _.queryRaw(...args)),
      find: (...args) => Effect.flatMap(getStore, (_) => _.find(...args)),
      filter: (...args) => Effect.flatMap(getStore, (_) => _.filter(...args)),
      set: (...args) => Effect.flatMap(getStore, (_) => _.set(...args)),
      batchSet: (...args) => Effect.flatMap(getStore, (_) => _.batchSet(...args)),
      bulkSet: (...args) => Effect.flatMap(getStore, (_) => _.bulkSet(...args)),
      batchRemove: (...args) => Effect.flatMap(getStore, (_) => _.batchRemove(...args))
    }
    return s
  })
})

export const MemoryStoreLive = StoreMaker.toLayer(Effect.sync(() => makeMemoryStore()))

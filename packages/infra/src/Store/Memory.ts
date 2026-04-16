/* eslint-disable @typescript-eslint/no-explicit-any */

import { Array, Context, Effect, flow, type NonEmptyReadonlyArray, Option, Order, pipe, Ref, Result, Semaphore, Struct } from "effect-app"
import { NonEmptyString255 } from "effect-app/Schema"
import { get } from "effect-app/utils"
import { InfraLogger } from "../logger.js"
import type { FieldValues } from "../Model/filter/types.js"
import { codeFilter, codeFilter3_ } from "./codeFilter.js"
import { type FilterArgs, type PersistenceModelType, type Store, type StoreConfig, StoreMaker } from "./service.js"
import { makeUpdateETag } from "./utils.js"

export function memFilter<T extends FieldValues, U extends keyof T = never>(f: FilterArgs<T, U>) {
  type M = U extends undefined ? T : Pick<T, U>
  return ((c: T[]): M[] => {
    const select = (r: T[]): M[] => {
      const sel = f.select
      if (!sel) return r as M[]
      return r.map((i) => {
        const [keys, subKeys] = pipe(
          sel,
          Array.partition((r) =>
            typeof r === "string" ? Result.fail(String(r)) : Result.succeed(r as { key: string; subKeys: string[] })
          )
        )
        const n = Struct.pick(i, keys)
        subKeys.forEach((subKey) => {
          n[subKey.key] = i[subKey.key]!.map(Struct.pick(subKey.subKeys as never[]))
        })
        return n as M
      }) as any
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

export const makeMemoryStoreInt = Effect.fnUntraced(
  function*<IdKey extends keyof Encoded, Encoded extends FieldValues, R = never, E = never>(
    modelName: string,
    idKey: IdKey,
    namespace: string,
    seed?: Effect.Effect<Iterable<Encoded>, E, R>,
    _defaultValues?: Partial<Encoded>
  ) {
    type PM = PersistenceModelType<Encoded>
    const updateETag = makeUpdateETag(modelName)
    const items_ = yield* seed ?? Effect.sync(() => [])
    const defaultValues = _defaultValues ?? {}

    const items = new Map([...items_].map((_) => [_[idKey], { _etag: undefined, ...defaultValues, ..._ }] as const))
    const store = Ref.makeUnsafe<ReadonlyMap<Encoded[IdKey], PM>>(items)
    const sem = Semaphore.makeUnsafe(1)
    const withPermit = sem.withPermits(1)
    const values = Effect.map(Ref.get(store), (s) => s.values())

    const all = Effect.map(values, Array.fromIterable)

    const batchSet = Effect.fnUntraced(function*(items: NonEmptyReadonlyArray<PM>) {
      const updated = yield* Effect.forEach(
        items,
        (i) => Effect.flatMap(s.find(i[idKey]), (current) => updateETag(i, idKey, current))
      )
      const m = yield* Ref.get(store)
      const mut = m as Map<Encoded[IdKey], PM>
      updated.forEach((e) => mut.set(e[idKey], e))
      yield* Ref.set(store, mut)
      return updated
    }, withPermit)

    const batchRemove = Effect.fnUntraced(function*(items: NonEmptyReadonlyArray<Encoded[IdKey]>) {
      const m = yield* Ref.get(store)
      yield* Ref.set(store, new Map([...m].filter(([_k]) => !items.includes(_k))))
    }, withPermit)

    const spanAttrs = {
      attributes: { "repository.model_name": modelName, "repository.namespace": namespace }
    }

    const s: Store<IdKey, Encoded> = {
      queryRaw: Effect.fn("Memory.queryRaw [effect-app/infra/Store]", spanAttrs)(function*(query) {
        return query.memory(yield* all)
      }),

      all: all.pipe(Effect.withSpan("Memory.all [effect-app/infra/Store]", {
        attributes: { modelName, namespace }
      })),

      find: Effect.fn("Memory.find [effect-app/infra/Store]", {
        attributes: { modelName, namespace }
      })(function*(id) {
        return Option.fromNullishOr((yield* Ref.get(store)).get(id))
      }),

      filter: Effect.fn("Memory.filter [effect-app/infra/Store]", spanAttrs)(function*(f) {
        yield* logQuery(f, defaultValues)
        return memFilter(f)(yield* all)
      }),

      set: Effect.fn("Memory.set [effect-app/infra/Store]", spanAttrs)(function*(e) {
        const current = yield* s.find(e[idKey])
        const updated = yield* updateETag(e, idKey, current)
        const m = yield* Ref.get(store)
        yield* Ref.set(store, new Map([...m, [updated[idKey], updated]]))
        return updated
      }, withPermit),

      batchRemove: Effect.fn("Memory.batchRemove [effect-app/infra/Store]", spanAttrs)(function*(
        items: NonEmptyReadonlyArray<Encoded[IdKey]>
      ) {
        if (items.length > 100) return yield* Effect.die("BatchRemove: a batch may not exceed 100 items")
        yield* batchRemove(items)
      }),

      batchSet: Effect.fn("Memory.batchSet [effect-app/infra/Store]", spanAttrs)(function*(
        items: readonly [PM, ...PM[]]
      ) {
        if (items.length > 100) return yield* Effect.die("BatchSet: a batch may not exceed 100 items")
        return yield* batchSet(items)
      }),

      bulkSet: flow(
        batchSet,
        Effect.withSpan("Memory.bulkSet [effect-app/infra/Store]", spanAttrs)
      )
    }
    return s
  }
)

export const makeMemoryStore = () => ({
  make: Effect.fnUntraced(function*<IdKey extends keyof Encoded, Encoded extends FieldValues, R, E>(
    modelName: string,
    idKey: IdKey,
    seed?: Effect.Effect<Iterable<Encoded>, E, R>,
    config?: StoreConfig<Encoded>
  ) {
    const storesSem = Semaphore.makeUnsafe(1)
    const primary = yield* makeMemoryStoreInt<IdKey, Encoded, R, E>(
      modelName,
      idKey,
      "primary",
      seed,
      config?.defaultValues
    )
    const ctx = yield* Effect.context<R>()
    const stores = new Map([["primary", primary]])
    const getStore = !config?.allowNamespace
      ? Effect.succeed(primary)
      : storeId.asEffect().pipe(Effect.flatMap((namespace) => {
        const store = stores.get(namespace)
        if (store) {
          return Effect.succeed(store)
        }
        if (!config.allowNamespace!(namespace)) {
          throw new Error(`Namespace ${namespace} not allowed!`)
        }
        return storesSem.withPermits(1)(Effect.suspend(() => {
          const store = stores.get(namespace)
          if (store) return Effect.sync(() => store)
          return makeMemoryStoreInt(modelName, idKey, namespace, seed, config?.defaultValues)
            .pipe(
              Effect.orDie,
              Effect.provide(ctx),
              Effect.tap((store) => Effect.sync(() => stores.set(namespace, store)))
            )
        }))
      }))
    const s: Store<IdKey, Encoded> = {
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

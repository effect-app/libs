/* eslint-disable @typescript-eslint/no-explicit-any */

import { Array, Context, Effect, flow, Option, Order, pipe, Ref, Struct } from "effect-app"
import type { NonEmptyReadonlyArray } from "effect-app"
import { NonEmptyString255 } from "effect-app/Schema"
import { get } from "effect-app/utils"
import { InfraLogger } from "../logger.js"
import type { FieldValues } from "../Model/filter/types.js"
import { codeFilter } from "./codeFilter.js"
import type { FilterArgs, PersistenceModelType, Store, StoreConfig } from "./service.js"
import { StoreMaker } from "./service.js"
import { makeUpdateETag } from "./utils.js"

export function memFilter<T extends FieldValues, U extends keyof T = never>(f: FilterArgs<T, U>) {
  type M = U extends undefined ? T : Pick<T, U>
  return ((c: T[]): M[] => {
    const select = (r: T[]): M[] => (f.select ? r.map(Struct.pick(...f.select)) : r) as any
    const skip = f?.skip
    const limit = f?.limit
    const ords = Option.map(Option.fromNullable(f.order), (_) =>
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
    let r = f.filter ? Array.filterMap(c, codeFilter(f.filter)) : c
    if (skip) {
      r = Array.drop(r, skip)
    }
    if (limit !== undefined) {
      r = Array.take(r, limit)
    }

    return select(r)
  })
}

const defaultNs = NonEmptyString255("primary")
export class storeId
  extends Context.Reference<storeId>()("StoreId", { defaultValue: (): NonEmptyString255 => defaultNs })
{}

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
  seed?: Effect<Iterable<Encoded>, E, R>,
  _defaultValues?: Partial<Encoded>
) {
  type PM = PersistenceModelType<Encoded>
  return Effect.gen(function*() {
    const updateETag = makeUpdateETag(modelName)
    const items_ = yield* seed ?? Effect.sync(() => [])
    const defaultValues = _defaultValues ?? {}

    const items = new Map([...items_].map((_) => [_[idKey], { _etag: undefined, ...defaultValues, ..._ }] as const))
    const store = Ref.unsafeMake<ReadonlyMap<string, PM>>(items)
    const sem = Effect.unsafeMakeSemaphore(1)
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
                      const mut = m as Map<string, PM>
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
    const s: Store<IdKey, Encoded> = {
      all: all.pipe(Effect.withSpan("Memory.all [effect-app/infra/Store]", {
        captureStackTrace: false,
        attributes: {
          modelName,
          namespace
        }
      })),
      find: (id) =>
        Ref
          .get(store)
          .pipe(
            Effect.map((_) => Option.fromNullable(_.get(id))),
            Effect
              .withSpan("Memory.find [effect-app/infra/Store]", {
                captureStackTrace: false,
                attributes: {
                  modelName,
                  namespace
                }
              })
          ),
      filter: (f) =>
        all
          .pipe(
            Effect.tap(() => logQuery(f, defaultValues)),
            Effect.map(memFilter(f)),
            Effect.withSpan("Memory.filter [effect-app/infra/Store]", {
              captureStackTrace: false,
              attributes: { "repository.model_name": modelName, "repository.namespace": namespace }
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
            Effect
              .withSpan("Memory.set [effect-app/infra/Store]", {
                captureStackTrace: false,
                attributes: { "repository.model_name": modelName, "repository.namespace": namespace }
              })
          ),
      batchSet: (items: readonly [PM, ...PM[]]) =>
        pipe(
          Effect
            .sync(() => items)
            // align with CosmosDB
            .pipe(
              Effect.filterOrDieMessage((_) => _.length <= 100, "BatchSet: a batch may not exceed 100 items"),
              Effect.andThen(batchSet),
              Effect
                .withSpan("Memory.batchSet [effect-app/infra/Store]", {
                  captureStackTrace: false,
                  attributes: { "repository.model_name": modelName, "repository.namespace": namespace }
                })
            )
        ),
      bulkSet: flow(
        batchSet,
        (_) =>
          _.pipe(Effect.withSpan("Memory.bulkSet [effect-app/infra/Store]", {
            captureStackTrace: false,
            attributes: { "repository.model_name": modelName, "repository.namespace": namespace }
          }))
      ),
      remove: (e: Encoded) =>
        Ref
          .get(store)
          .pipe(
            Effect.map((_) => new Map([..._].filter(([_]) => _ !== e[idKey]))),
            Effect.flatMap((_) => Ref.set(store, _)),
            withPermit,
            Effect.withSpan("Memory.remove [effect-app/infra/Store]", {
              captureStackTrace: false,
              attributes: { "repository.model_name": modelName, "repository.namespace": namespace }
            })
          )
    }
    return s
  })
}

export const makeMemoryStore = () => ({
  make: <IdKey extends keyof Encoded, Encoded extends FieldValues, R, E>(
    modelName: string,
    idKey: IdKey,
    seed?: Effect<Iterable<Encoded>, E, R>,
    config?: StoreConfig<Encoded>
  ) =>
    Effect.gen(function*() {
      const storesSem = Effect.unsafeMakeSemaphore(1)
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
        : storeId.pipe(Effect.flatMap((namespace) => {
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
        find: (...args) => Effect.flatMap(getStore, (_) => _.find(...args)),
        filter: (...args) => Effect.flatMap(getStore, (_) => _.filter(...args)),
        set: (...args) => Effect.flatMap(getStore, (_) => _.set(...args)),
        batchSet: (...args) => Effect.flatMap(getStore, (_) => _.batchSet(...args)),
        bulkSet: (...args) => Effect.flatMap(getStore, (_) => _.bulkSet(...args)),
        remove: (...args) => Effect.flatMap(getStore, (_) => _.remove(...args))
      }
      return s
    })
})

export const MemoryStoreLive = StoreMaker.toLayer(Effect.sync(() => makeMemoryStore()))

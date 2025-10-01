/* eslint-disable @typescript-eslint/no-explicit-any */
import * as fu from "../fileUtil.js"

import fs from "fs"

import { Chunk, Console, Effect, flow } from "effect-app"
import type { FieldValues } from "../Model/filter/types.js"
import { makeMemoryStoreInt, storeId } from "./Memory.js"
import { type PersistenceModelType, type StorageConfig, type Store, type StoreConfig, StoreMaker } from "./service.js"

function makeDiskStoreInt<IdKey extends keyof Encoded, Encoded extends FieldValues, R, E>(
  prefix: string,
  idKey: IdKey,
  namespace: string,
  dir: string,
  name: string,
  seed?: Effect.Effect<Iterable<Encoded>, E, R>,
  defaultValues?: Partial<Encoded>,
  separate?: boolean
) {
  type PM = PersistenceModelType<Encoded>
  return Effect.gen(function*() {
    if (namespace !== "primary") {
      dir = dir + "/" + namespace
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir)
      }
    }
    const myDir = dir + "/" + prefix + name
    if (separate) {
      if (!fs.existsSync(myDir)) {
        fs.mkdirSync(myDir)
      }
    }
    const file = separate ? myDir + ".json" : myDir
    const fsStore = separate
      ? {
        get: fs.existsSync(myDir)
          ? Effect
            .gen(function*() {
              const files = yield* Effect.promise(() => fs.promises.readdir(myDir)).pipe(
                Effect.map((_) => _.filter((_) => _.endsWith(".json")))
              )
              return yield* Effect.forEach(
                files,
                Effect.fnUntraced(function*(f) {
                  const js = yield* fu.readTextFile(myDir + "/" + f)
                  return JSON.parse(js) as PM
                }),
                { concurrency: 10 }
              )
            })
            .pipe(
              Effect.orDie,
              Effect.withSpan("Disk.read [effect-app/infra/Store]", {
                captureStackTrace: false,
                attributes: { "disk.dir": myDir }
              })
            )
          : Effect.succeed([] as PM[]),
        setRaw: Effect.fn("Disk.write [effect-app/infra/Store]")(function*(v: Iterable<PM>) {
          // TODO: should we first read and compare?
          yield* Effect.forEach(
            Chunk.fromIterable(v),
            (item) => fu.writeTextFile(myDir + "/" + item[idKey] + ".json", JSON.stringify(item, undefined, 2)),
            { concurrency: 10 }
          )
        })
      }
      : {
        get: fu
          .readTextFile(file)
          .pipe(
            Effect.withSpan("Disk.read.readFile [effect-app/infra/Store]", { captureStackTrace: false }),
            Effect.flatMap((x) =>
              Effect.sync(() => JSON.parse(x) as PM[]).pipe(
                Effect.withSpan("Disk.read.parse [effect-app/infra/Store]", { captureStackTrace: false })
              )
            ),
            Effect.orDie,
            Effect.withSpan("Disk.read [effect-app/infra/Store]", {
              captureStackTrace: false,
              attributes: { "disk.file": file }
            })
          ),
        setRaw: (v: Iterable<PM>) =>
          Effect
            .sync(() => JSON.stringify([...v], undefined, 2))
            .pipe(
              Effect.withSpan("Disk.stringify [effect-app/infra/Store]", {
                captureStackTrace: false,
                attributes: { "disk.file": file }
              }),
              Effect
                .flatMap(
                  (json) =>
                    fu
                      .writeTextFile(file, json)
                      .pipe(Effect
                        .withSpan("Disk.write.writeFile [effect-app/infra/Store]", {
                          captureStackTrace: false,
                          attributes: { "disk.file_size": json.length }
                        }))
                ),
              Effect
                .withSpan("Disk.write [effect-app/infra/Store]", {
                  captureStackTrace: false,
                  attributes: { "disk.file": file }
                })
            )
      }

    const store = yield* makeMemoryStoreInt<IdKey, Encoded, R, E>(
      name,
      idKey,
      namespace,
      !fs.existsSync(file)
        ? seed
        : fsStore.get,
      defaultValues
    )

    yield* store.all.pipe(Effect.flatMap(fsStore.setRaw))

    const sem = Effect.unsafeMakeSemaphore(1)
    const withPermit = sem.withPermits(1)
    const flushToDisk = Effect.flatMap(store.all, fsStore.setRaw).pipe(withPermit)
    const flushToDiskInBackground = flushToDisk
      .pipe(
        Effect.tapErrorCause(Console.error),
        Effect.uninterruptible,
        Effect.forkDaemon
      )

    return {
      ...store,
      batchSet: flow(
        store.batchSet,
        Effect.tap(flushToDiskInBackground)
      ),
      bulkSet: flow(
        store.bulkSet,
        Effect.tap(flushToDiskInBackground)
      ),
      set: flow(
        store.set,
        Effect.tap(flushToDiskInBackground)
      ),
      remove: flow(
        store.remove,
        Effect.tap(flushToDiskInBackground)
      )
    } satisfies Store<IdKey, Encoded>
  })
}

/**
 * The Disk-backed store, flushes writes in background, but keeps the data in memory
 * and should therefore be as fast as the Memory Store.
 */
export function makeDiskStore({ prefix }: StorageConfig, dir: string) {
  return Effect.sync(() => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir)
    }
    return {
      make: <IdKey extends keyof Encoded, Encoded extends FieldValues, R, E>(
        name: string,
        idKey: IdKey,
        seed?: Effect.Effect<Iterable<Encoded>, E, R>,
        config?: StoreConfig<Encoded>
      ) =>
        Effect.gen(function*() {
          const storesSem = Effect.unsafeMakeSemaphore(1)
          const primary = yield* makeDiskStoreInt(prefix, idKey, "primary", dir, name, seed, config?.defaultValues)
          const stores = new Map<string, Store<IdKey, Encoded>>([["primary", primary]])
          const ctx = yield* Effect.context<R>()
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
              return storesSem.withPermits(1)(
                Effect.suspend(() => {
                  const existing = stores.get(namespace)
                  if (existing) return Effect.sync(() => existing)
                  return makeDiskStoreInt<IdKey, Encoded, R, E>(
                    prefix,
                    idKey,
                    namespace,
                    dir,
                    name,
                    seed,
                    config?.defaultValues,
                    config?.separate
                  )
                    .pipe(
                      Effect.orDie,
                      Effect.provide(ctx),
                      Effect.tap((store) => Effect.sync(() => stores.set(namespace, store)))
                    )
                })
              )
            }))

          const s: Store<IdKey, Encoded> = {
            all: Effect.flatMap(getStore, (_) => _.all),
            find: (...args) => Effect.flatMap(getStore, (_) => _.find(...args)),
            filter: (...args) => Effect.flatMap(getStore, (_) => _.filter(...args)),
            set: (...args) => Effect.flatMap(getStore, (_) => _.set(...args)),
            batchSet: (...args) => Effect.flatMap(getStore, (_) => _.batchSet(...args)),
            bulkSet: (...args) => Effect.flatMap(getStore, (_) => _.bulkSet(...args)),
            remove: (...args) => Effect.flatMap(getStore, (_) => _.remove(...args)),
            queryRaw: (...args) => Effect.flatMap(getStore, (_) => _.queryRaw(...args))
          }
          return s
        })
    }
  })
}

export function DiskStoreLayer(config: StorageConfig, dir: string) {
  return StoreMaker.toLayer(makeDiskStore(config, dir))
}

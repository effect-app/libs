/* eslint-disable @typescript-eslint/no-explicit-any */
import * as fu from "../fileUtil.js"

import fs from "fs"

import * as Effect from "effect-app/Effect"
import type { FieldValues } from "effect-app/Model/filter/types"
import { type PersistenceModelType, type StorageConfig, type Store, type StoreConfig, storeId, StoreMaker } from "effect-app/Store"
import * as Console from "effect/Console"
import { flow } from "effect/Function"
import * as Semaphore from "effect/Semaphore"
import { annotateDb } from "../otel.js"
import { makeMemoryStoreInt } from "./Memory.js"

function makeDiskStoreInt<IdKey extends keyof Encoded, Encoded extends FieldValues, R, E>(
  prefix: string,
  idKey: IdKey,
  namespace: string,
  dir: string,
  name: string,
  seed?: Effect.Effect<Iterable<Encoded>, E, R>,
  defaultValues?: Partial<Encoded>
) {
  type PM = PersistenceModelType<Encoded>
  return Effect.gen(function*() {
    if (namespace !== "primary") {
      dir = dir + "/" + namespace
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir)
      }
    }
    const file = dir + "/" + prefix + name + ".json"
    const fileExtra = { "disk.file.path": file }
    const fsStore = {
      get: fu
        .readTextFile(file)
        .pipe(
          annotateDb({
            operation: "read.readFile",
            system: "disk",
            collection: name,
            namespace,
            entity: name,
            extra: fileExtra
          }),
          Effect.flatMap((x) =>
            Effect.sync(() => JSON.parse(x) as PM[]).pipe(
              annotateDb({
                operation: "read.parse",
                system: "disk",
                collection: name,
                namespace,
                entity: name,
                extra: fileExtra
              })
            )
          ),
          Effect.orDie,
          annotateDb({
            operation: "read",
            system: "disk",
            collection: name,
            namespace,
            entity: name,
            extra: fileExtra
          })
        ),
      setRaw: (v: Iterable<PM>) =>
        Effect
          .sync(() => JSON.stringify([...v], undefined, 2))
          .pipe(
            annotateDb({
              operation: "stringify",
              system: "disk",
              collection: name,
              namespace,
              entity: name,
              extra: fileExtra
            }),
            Effect
              .flatMap(
                (json) =>
                  fu
                    .writeTextFile(file, json)
                    .pipe(annotateDb({
                      operation: "write.writeFile",
                      system: "disk",
                      collection: name,
                      namespace,
                      entity: name,
                      extra: { ...fileExtra, "disk.file.size": json.length }
                    }))
              ),
            annotateDb({
              operation: "write",
              system: "disk",
              collection: name,
              namespace,
              entity: name,
              extra: fileExtra
            })
          )
    }

    // lock file for cross-process coordination during initialization

    // wrap initialization in file lock to prevent race conditions in multi-worker setups
    const store = yield* fu.withFileLock(
      file,
      Effect.gen(function*() {
        const shouldSeed = !(fs.existsSync(file))

        const store = yield* makeMemoryStoreInt<IdKey, Encoded, R, E>(
          name,
          idKey,
          namespace,
          shouldSeed
            ? seed
            : fsStore.get,
          defaultValues
        )
        if (shouldSeed) {
          yield* store.all.pipe(Effect.flatMap(fsStore.setRaw))
        }

        return store
      })
    )

    const sem = Semaphore.makeUnsafe(1)
    const withPermit = sem.withPermits(1)
    const flushToDisk = Effect.flatMap(store.all, fsStore.setRaw).pipe(withPermit)
    const flushToDiskInBackground = flushToDisk
      .pipe(
        Effect.tapCause(Console.error),
        Effect.uninterruptible,
        Effect.forkDetach
      )

    return {
      ...store,
      batchSet: flow(
        store.batchSet,
        Effect.tap(flushToDiskInBackground)
      ),
      batchRemove: flow(
        store.batchRemove,
        Effect.tap(flushToDiskInBackground)
      ),
      bulkSet: flow(
        store.bulkSet,
        Effect.tap(flushToDiskInBackground)
      ),
      set: flow(
        store.set,
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
      make: Effect.fnUntraced(function*<IdKey extends keyof Encoded, Encoded extends FieldValues, R, E>(
        name: string,
        idKey: IdKey,
        seed?: Effect.Effect<Iterable<Encoded>, E, R>,
        config?: StoreConfig<Encoded>
      ) {
        const primary = yield* makeDiskStoreInt(prefix, idKey, "primary", dir, name, seed, config?.defaultValues)
        const stores = new Map<string, Store<IdKey, Encoded>>([["primary", primary]])
        const ctx = yield* Effect.context<R>()
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
          getSem(namespace).withPermits(1)(
            Effect.suspend(() => {
              const existing = stores.get(namespace)
              if (existing) return Effect.succeed(existing)
              if (config?.allowNamespace && !config.allowNamespace(namespace)) {
                throw new Error(`Namespace ${namespace} not allowed!`)
              }
              return makeDiskStoreInt<IdKey, Encoded, R, E>(
                prefix,
                idKey,
                namespace,
                dir,
                name,
                seed,
                config?.defaultValues
              )
                .pipe(
                  Effect.orDie,
                  Effect.provide(ctx),
                  Effect.tap((store) => Effect.sync(() => stores.set(namespace, store)))
                )
            })
          )
        const getStore = !config?.allowNamespace
          ? Effect.succeed(primary)
          : storeId.pipe(Effect.flatMap((namespace) => ensureStore(namespace)))

        const s: Store<IdKey, Encoded> = {
          seedNamespace: (namespace) => ensureStore(namespace).pipe(Effect.asVoid),
          all: Effect.flatMap(getStore, (_) => _.all),
          find: (...args) => Effect.flatMap(getStore, (_) => _.find(...args)),
          filter: (...args) => Effect.flatMap(getStore, (_) => _.filter(...args)),
          set: (...args) => Effect.flatMap(getStore, (_) => _.set(...args)),
          batchSet: (...args) => Effect.flatMap(getStore, (_) => _.batchSet(...args)),
          bulkSet: (...args) => Effect.flatMap(getStore, (_) => _.bulkSet(...args)),
          batchRemove: (...args) => Effect.flatMap(getStore, (_) => _.batchRemove(...args)),
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

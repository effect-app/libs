/* eslint-disable @typescript-eslint/no-explicit-any */

import { Array, Chunk, Duration, Effect, Layer, type NonEmptyReadonlyArray, Option, pipe, Redacted, Struct } from "effect-app"
import { toNonEmptyArray } from "effect-app/Array"
import { dropUndefinedT } from "effect-app/utils"
import { CosmosClient, CosmosClientLayer } from "../adapters/cosmos-client.js"
import { OptimisticConcurrencyException } from "../errors.js"
import { InfraLogger } from "../logger.js"
import type { FieldValues } from "../Model/filter/types.js"
import { type RawQuery } from "../Model/query.js"
import { buildWhereCosmosQuery3, logQuery } from "./Cosmos/query.js"
import { type FilterArgs, type PersistenceModelType, type StorageConfig, type Store, type StoreConfig, StoreMaker } from "./service.js"

const makeMapId =
  <IdKey extends keyof Encoded, Encoded extends FieldValues>(idKey: IdKey) => ({ [idKey]: id, ...e }: Encoded) => ({
    ...e,
    id
  })
const makeReverseMapId =
  <IdKey extends keyof Encoded, Encoded extends FieldValues>(idKey: IdKey) =>
  ({ id, ...t }: PersistenceModelType<Omit<Encoded, IdKey> & { id: string }>) =>
    ({ ...t, [idKey]: id }) as any as PersistenceModelType<Encoded>

class CosmosDbOperationError {
  constructor(readonly message: string, readonly raw?: unknown) {}
} // TODO: Retry operation when running into RU limit.

function makeCosmosStore({ prefix }: StorageConfig) {
  return Effect.gen(function*() {
    const { db } = yield* CosmosClient
    return {
      make: <IdKey extends keyof Encoded, Encoded extends FieldValues, R = never, E = never>(
        name: string,
        idKey: IdKey,
        seed?: Effect<Iterable<Encoded>, E, R>,
        config?: StoreConfig<Encoded>
      ) =>
        Effect.gen(function*() {
          const mapId = makeMapId<IdKey, Encoded>(idKey)
          const mapReverseId = makeReverseMapId<IdKey, Encoded>(idKey)
          type PM = PersistenceModelType<Encoded>
          type PMCosmos = PersistenceModelType<Omit<Encoded, IdKey> & { id: string }>
          const containerId = `${prefix}${name}`
          yield* Effect.promise(() =>
            db.containers.createIfNotExists(dropUndefinedT({
              id: containerId,
              uniqueKeyPolicy: config?.uniqueKeys
                ? { uniqueKeys: config.uniqueKeys }
                : undefined
            }))
          )

          const defaultValues = config?.defaultValues ?? {}
          const container = db.container(containerId)
          const bulk = container.items.bulk.bind(container.items)
          const execBatch = container.items.batch.bind(container.items)
          const importedMarkerId = containerId

          const bulkSet = (items: NonEmptyReadonlyArray<PM>) =>
            Effect
              .gen(function*() {
                // TODO: disable batching if need atomicity
                // we delay and batch to keep low amount of RUs
                const b = [...items]
                  .map(
                    (x) =>
                      [
                        x,
                        Option.match(Option.fromNullable(x._etag), {
                          onNone: () =>
                            dropUndefinedT({
                              operationType: "Create" as const,
                              resourceBody: {
                                ...Struct.omit(x, "_etag", idKey),
                                id: x[idKey],
                                _partitionKey: config?.partitionValue(x)
                              },
                              partitionKey: config?.partitionValue(x)
                            }),
                          onSome: (eTag) =>
                            dropUndefinedT({
                              operationType: "Replace" as const,
                              id: x[idKey],
                              resourceBody: {
                                ...Struct.omit(x, "_etag", idKey),
                                id: x[idKey],
                                _partitionKey: config?.partitionValue(x)
                              },
                              ifMatch: eTag,
                              partitionKey: config?.partitionValue(x)
                            })
                        })
                      ] as const
                  )
                const batches = Chunk.toReadonlyArray(Array.chunk_(b, config?.maxBulkSize ?? 10))

                const batchResult = yield* Effect.forEach(
                  batches
                    .map((x, i) => [i, x] as const),
                  ([i, batch]) =>
                    Effect
                      .promise(() => bulk(batch.map(([, op]) => op)))
                      .pipe(
                        Effect
                          .delay(Duration.millis(i === 0 ? 0 : 1100)),
                        Effect
                          .flatMap((responses) =>
                            Effect.gen(function*() {
                              const r = responses.find((x) =>
                                x.statusCode === 412 || x.statusCode === 404 || x.statusCode === 409
                              )
                              if (r) {
                                return yield* Effect.fail(
                                  new OptimisticConcurrencyException(
                                    {
                                      type: name,
                                      id: JSON.stringify(r.resourceBody?.["id"]),
                                      code: r.statusCode,
                                      raw: responses
                                    }
                                  )
                                )
                              }
                              const r2 = responses.find(
                                (x) => x.statusCode !== 424 && (x.statusCode > 299 || x.statusCode < 200)
                              )
                              if (r2) {
                                return yield* Effect.die(
                                  new CosmosDbOperationError(
                                    "not able to update records: " + r2.statusCode,
                                    responses
                                  )
                                )
                              }
                              const r3 = responses.find(
                                (x) => x.statusCode > 299 || x.statusCode < 200
                              )
                              if (r3) {
                                return yield* Effect.die(
                                  new CosmosDbOperationError(
                                    "not able to update records: " + r3.statusCode,
                                    responses
                                  )
                                )
                              }
                              return batch.map(([e], i) => ({
                                ...e,
                                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                                _etag: responses[i]!.eTag
                              }))
                            })
                          )
                      )
                )

                return batchResult.flat() as unknown as NonEmptyReadonlyArray<Encoded>
              })
              .pipe(Effect.withSpan("Cosmos.bulkSet [effect-app/infra/Store]", {
                captureStackTrace: false,
                attributes: { "repository.container_id": containerId, "repository.model_name": name }
              }))

          const batchSet = (items: NonEmptyReadonlyArray<PM>) => {
            return Effect
              .suspend(() => {
                const batch = [...items].map(
                  (x) =>
                    [
                      x,
                      Option.match(Option.fromNullable(x._etag), {
                        onNone: () => ({
                          operationType: "Create" as const,
                          resourceBody: {
                            ...Struct.omit(x, "_etag", idKey),
                            id: x[idKey],
                            _partitionKey: config?.partitionValue(x)
                          }
                        }),
                        onSome: (eTag) => ({
                          operationType: "Replace" as const,
                          id: x[idKey],
                          resourceBody: {
                            ...Struct.omit(x, "_etag", idKey),
                            id: x[idKey],
                            _partitionKey: config?.partitionValue(x)
                          },
                          ifMatch: eTag
                        })
                      })
                    ] as const
                )

                const ex = batch.map(([, c]) => c)

                return Effect
                  .promise(() => execBatch(ex, ex[0]?.resourceBody._partitionKey))
                  .pipe(Effect.flatMap(Effect.fnUntraced(function*(x) {
                    const result = x.result ?? []
                    const firstFailed = result.find(
                      (x: any) => x.statusCode > 299 || x.statusCode < 200
                    )
                    if (firstFailed) {
                      const code = firstFailed.statusCode ?? 0
                      if (code === 412 || code === 404 || code === 409) {
                        return yield* new OptimisticConcurrencyException({ type: name, id: "batch", code })
                      }

                      return yield* Effect.die(
                        new CosmosDbOperationError("not able to update record: " + code)
                      )
                    }

                    return batch.map(([e], i) => ({
                      ...e,
                      _etag: result[i]?.eTag
                    })) as unknown as NonEmptyReadonlyArray<Encoded>
                  })))
              })
              .pipe(Effect
                .withSpan("Cosmos.batchSet [effect-app/infra/Store]", {
                  captureStackTrace: false,
                  attributes: { "repository.container_id": containerId, "repository.model_name": name }
                }))
          }

          const s: Store<IdKey, Encoded> = {
            queryRaw: <Out>(query: RawQuery<Encoded, Out>) =>
              Effect
                .sync(() => query.cosmos({ importedMarkerId, name }))
                .pipe(
                  Effect.tap((q) => logQuery(q)),
                  Effect.flatMap((q) =>
                    Effect.promise(() =>
                      container
                        .items
                        .query<Out>(q, { partitionKey: "primary" })
                        .fetchAll()
                        .then(({ resources }) =>
                          resources.map(
                            (_) => ({ ...defaultValues, ...mapReverseId(_ as any) }) as Out
                          )
                        )
                    )
                  ),
                  Effect
                    .withSpan("Cosmos.queryRaw [effect-app/infra/Store]", {
                      captureStackTrace: false,
                      attributes: { "repository.container_id": containerId, "repository.model_name": name }
                    })
                ),
            all: Effect
              .sync(() => ({
                query: `SELECT * FROM ${name} f WHERE f.id != @id`,
                parameters: [{ name: "@id", value: importedMarkerId }]
              }))
              .pipe(
                Effect.tap((q) => logQuery(q)),
                Effect.flatMap((q) =>
                  Effect.promise(() =>
                    container
                      .items
                      .query<PMCosmos>(q)
                      .fetchAll()
                      .then(({ resources }) =>
                        resources.map(
                          (_) => ({ ...defaultValues, ...mapReverseId(_) })
                        )
                      )
                  )
                ),
                Effect
                  .withSpan("Cosmos.all [effect-app/infra/Store]", {
                    captureStackTrace: false,
                    attributes: { "repository.container_id": containerId, "repository.model_name": name }
                  })
              ),
            /**
             * May return duplicate results for "join_find", when matching more than once.
             */
            filter: <U extends keyof Encoded = never>(
              f: FilterArgs<Encoded, U>
            ) => {
              const skip = f?.skip
              const limit = f?.limit
              const filter = f.filter
              type M = U extends undefined ? Encoded : Pick<Encoded, U>
              return Effect
                .sync(() =>
                  buildWhereCosmosQuery3(
                    idKey,
                    filter ? [{ t: "where-scope", result: filter }] : [],
                    name,
                    importedMarkerId,
                    defaultValues,
                    f.select as NonEmptyReadonlyArray<string | { key: string; subKeys: readonly string[] }> | undefined,
                    f.order as NonEmptyReadonlyArray<{ key: string; direction: "ASC" | "DESC" }> | undefined,
                    skip,
                    limit
                  )
                )
                .pipe(
                  Effect.tap((q) => logQuery(q)),
                  Effect
                    .flatMap((q) =>
                      Effect.promise(() =>
                        f.select
                          ? container
                            .items
                            .query<M>(q)
                            .fetchAll()
                            .then(({ resources }) =>
                              resources.map((_) =>
                                ({
                                  ...pipe(
                                    defaultValues,
                                    Struct.pick(...f.select!.filter((_) => typeof _ === "string"))
                                  ),
                                  ...mapReverseId(_ as any)
                                }) as any
                              )
                            )
                          : container
                            .items
                            .query<{ f: M }>(q)
                            .fetchAll()
                            .then(({ resources }) =>
                              resources.map(({ f }) => ({ ...defaultValues, ...mapReverseId(f as any) }) as any)
                            )
                      )
                    )
                )
                .pipe(
                  Effect.withSpan("Cosmos.filter [effect-app/infra/Store]", {
                    captureStackTrace: false,
                    attributes: { "repository.container_id": containerId, "repository.model_name": name }
                  })
                )
            },
            find: (id) =>
              Effect
                .promise(() =>
                  container
                    .item(id, config?.partitionValue({ [idKey]: id } as Encoded))
                    .read<Encoded>()
                    .then(({ resource }) =>
                      Option.fromNullable(resource).pipe(Option.map((_) => ({ ...defaultValues, ...mapReverseId(_) })))
                    )
                )
                .pipe(Effect
                  .withSpan("Cosmos.find [effect-app/infra/Store]", {
                    captureStackTrace: false,
                    attributes: {
                      "repository.container_id": containerId,
                      "repository.model_name": name,
                      partitionValue: config?.partitionValue({ [idKey]: id } as Encoded),
                      id
                    }
                  })),
            set: (e) =>
              Option
                .match(
                  Option
                    .fromNullable(e._etag),
                  {
                    onNone: () =>
                      Effect.promise(() =>
                        container.items.create({
                          ...mapId(e),
                          _partitionKey: config?.partitionValue(e)
                        })
                      ),
                    onSome: (eTag) =>
                      Effect.promise(() =>
                        container.item(e[idKey], config?.partitionValue(e)).replace(
                          { ...mapId(e), _partitionKey: config?.partitionValue(e) },
                          {
                            accessCondition: {
                              type: "IfMatch",
                              condition: eTag
                            }
                          }
                        )
                      )
                  }
                )
                .pipe(
                  Effect
                    .flatMap((x) => {
                      if (x.statusCode === 412 || x.statusCode === 404 || x.statusCode === 409) {
                        return new OptimisticConcurrencyException({ type: name, id: e[idKey], code: x.statusCode })
                      }
                      if (x.statusCode > 299 || x.statusCode < 200) {
                        return Effect.die(
                          new CosmosDbOperationError(
                            "not able to update record: " + x.statusCode
                          )
                        )
                      }
                      return Effect.sync(() => ({
                        ...e,
                        _etag: x.etag
                      }))
                    }),
                  Effect
                    .withSpan("Cosmos.set [effect-app/infra/Store]", {
                      captureStackTrace: false,
                      attributes: {
                        "repository.container_id": containerId,
                        "repository.model_name": name,
                        id: e[idKey]
                      }
                    })
                ),
            batchSet,
            bulkSet,
            remove: (e: Encoded) =>
              Effect
                .promise(() => container.item(e[idKey], config?.partitionValue(e)).delete())
                .pipe(Effect
                  .withSpan("Cosmos.remove [effect-app/infra/Store]", {
                    captureStackTrace: false,
                    attributes: { "repository.container_id": containerId, "repository.model_name": name, id: e[idKey] }
                  }))
          }

          // handle mock data
          const marker = yield* Effect.promise(() =>
            container
              .item(importedMarkerId, importedMarkerId)
              .read<{ id: string }>()
              .then(({ resource }) => Option.fromNullable(resource))
          )

          if (!Option.isSome(marker)) {
            yield* InfraLogger.logInfo("Creating mock data for " + name)
            if (seed) {
              const m = yield* seed
              yield* Effect.flatMapOption(
                Effect.succeed(toNonEmptyArray([...m])),
                (a) =>
                  s.bulkSet(a).pipe(
                    Effect.orDie,
                    Effect
                      // we delay extra here, so that initial creation between Companies/POs also have an interval between them.
                      .delay(Duration.millis(1100))
                  )
              )
            }
            // Mark as imported
            yield* Effect.promise(() =>
              container.items.create({
                _partitionKey: importedMarkerId,
                id: importedMarkerId,
                ttl: -1
              })
            )
          }
          return s
        })
    }
  })
}

export function CosmosStoreLayer(cfg: StorageConfig) {
  return StoreMaker
    .toLayer(makeCosmosStore(cfg))
    .pipe(Layer.provide(CosmosClientLayer(Redacted.value(cfg.url), cfg.dbName)))
}

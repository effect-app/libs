import { IndexingPolicy } from "@azure/cosmos"
import { typedKeysOf } from "@effect-ts-app/core/utils"
import { Effect, Option } from "@effect-ts-app/prelude/Prelude"

import * as Cosmos from "../cosmos-client.js"
import { CachedRecord, DBRecord, OptimisticLockException } from "./shared.js"
import * as simpledb from "./simpledb.js"
import { Version } from "./simpledb.js"

class CosmosDbOperationError {
  constructor(readonly message: string) {}
}

const setup = (type: string, indexingPolicy: IndexingPolicy) =>
  Cosmos.db.tap((db) =>
    Effect.tryPromise(() =>
      db.containers
        .create({ id: type, indexingPolicy })
        .catch((err) => console.warn(err))
    )
  )
// TODO: Error if current indexingPolicy does not match
//Effect.flatMap((db) => Effect.tryPromise(() => db.container(type).(indexes)))
export function createContext<TKey extends string, EA, A extends DBRecord<TKey>>() {
  return <REncode, RDecode, EDecode>(
    type: string,
    encode: (record: A) => Effect.RIO<REncode, EA>,
    decode: (d: EA) => Effect<RDecode, EDecode, A>,
    //schemaVersion: string,
    indexes: IndexingPolicy
  ) => {
    return setup(type, indexes).map(() => ({
      find: simpledb.find(find, decode, type),
      findBy,
      save: simpledb.storeDirectly(store, type),
    }))

    function find(id: string) {
      return Cosmos.db
        .flatMap((db) =>
          Effect.tryPromise(() => db.container(type).item(id).read<{ data: EA }>())
        )
        .map((i) => Option.fromNullable(i.resource))
        .mapOption(({ _etag, data }) => ({ version: _etag, data } as CachedRecord<EA>))
    }

    function findBy(parameters: Record<string, string>) {
      return Cosmos.db
        .flatMap((db) =>
          Effect.tryPromise(() =>
            db
              .container(type)
              .items.query({
                query: `
SELECT TOP 1 ${type}.id
FROM ${type} i
WHERE (
  ${typedKeysOf(parameters)
    .map((k) => `i.${k} = @${k}`)
    .join(" and ")}
)
`,
                parameters: typedKeysOf(parameters).map((p) => ({
                  name: `@${p}`,
                  value: parameters[p],
                })),
              })
              .fetchAll()
          )
        )
        .map((x) => ROArray.head(x.resources))
        .mapOption(({ id }) => id)
    }

    function store(record: A, currentVersion: Option<Version>) {
      return Effect.gen(function* ($) {
        const version = "_etag" // we get this from the etag anyway.

        const db = yield* $(Cosmos.db)
        const data = yield* $(encode(record))

        yield* $(
          Option.fold_(
            currentVersion,
            () =>
              Effect.tryPromise(() =>
                db.container(type).items.create({
                  id: record.id,
                  timestamp: new Date(),
                  data,
                })
              )
                .asUnit()
                .orDie(),
            (currentVersion) =>
              Effect.tryPromise(() =>
                db
                  .container(type)
                  .item(record.id)
                  .replace(
                    {
                      id: record.id,
                      timestamp: new Date(),
                      data,
                    },
                    {
                      accessCondition: {
                        type: "IfMatch",
                        condition: currentVersion,
                      },
                    }
                  )
              )
                .orDie()
                .flatMap((x) => {
                  if (x.statusCode === 412) {
                    return Effect.fail(new OptimisticLockException(type, record.id))
                  }
                  if (x.statusCode > 299 || x.statusCode < 200) {
                    return Effect.die(
                      new CosmosDbOperationError(
                        "not able to update record: " + x.statusCode
                      )
                    )
                  }
                  return Effect.unit
                })
          )
        )
        return { version, data: record } as CachedRecord<A>
      })
    }
  }
}

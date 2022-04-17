import * as M from "@effect-ts/core/Effect/Managed"
import * as Eq from "@effect-ts/core/Equal"
import * as EO from "@effect-ts-app/core/EffectOption"
import { flow, pipe } from "@effect-ts-app/core/Function"
import * as MO from "@effect-ts-app/core/Schema"

import {
  CachedRecord,
  DBRecord,
  getRecordName,
  makeMap,
  SerializedDBRecord,
} from "./shared.js"
import * as simpledb from "./simpledb.js"
import { Version } from "./simpledb.js"

// When we are in-process, we want to share the same Storage
// Do not try this at home.
const storage = makeMap<string, string>()

const parseSDB = SerializedDBRecord.Parser["|>"](MO.condemnFail)

export function createContext<TKey extends string, EA, A extends DBRecord<TKey>>() {
  return <REncode, RDecode, EDecode>(
    type: string,
    encode: (record: A) => Effect.RIO<REncode, EA>,
    decode: (d: EA) => Effect<RDecode, EDecode, A>
  ) => {
    return {
      find: simpledb.find(find, decode, type),
      findBy,
      save: simpledb.store(find, store, bogusLock, type),
    }

    function find(id: string) {
      return pipe(
        storage.find(getRecordName(type, id)),
        EO.map((s) => JSON.parse(s) as unknown),
        EO.chainEffect(parseSDB),
        EO.map(({ data, version }) => ({ data: JSON.parse(data) as EA, version }))
      )
    }

    function findBy<V extends Partial<A>>(keys: V, eq: Eq.Equal<V>) {
      // Naive implementation, fine for in memory testing purposes.
      return pipe(
        Effect.gen(function* ($) {
          for (const [, value] of storage) {
            const sdb_ = JSON.parse(value) as unknown
            const sdb = yield* $(parseSDB(sdb_))
            const cr = { data: JSON.parse(sdb.data) as EA, version: sdb.version }
            const r = yield* $(
              pipe(
                decode(cr.data),
                Effect.chain((d) =>
                  eq.equals(keys, d as unknown as V)
                    ? Sync.succeed(d)
                    : Sync.fail("not equals")
                ),
                Effect.result
              )
            )
            if (r._tag === "Success") {
              return r.value
            }
          }
          return null
        }),
        Effect.map(Option.fromNullable)
      )
    }

    function store(record: A, currentVersion: Option<Version>) {
      const version = currentVersion
        .map((cv) => (parseInt(cv) + 1).toString())
        .getOrElse(() => "1")

      const getData = flow(
        encode,
        Effect.map(JSON.stringify),
        Effect.map((data) => JSON.stringify({ version, timestamp: new Date(), data }))
      )
      return pipe(
        getData(record),
        Effect.chain((serialised) =>
          storage.set(getRecordName(type, record.id), serialised)
        ),
        Effect.map(() => ({ version, data: record } as CachedRecord<A>))
      )
    }
  }
}

function bogusLock() {
  return M.make_(Effect.unit, () => Effect.unit)
}

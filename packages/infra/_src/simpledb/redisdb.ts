/* eslint-disable @typescript-eslint/no-explicit-any */
import * as M from "@effect-ts/core/Effect/Managed"
import * as EO from "@effect-ts-app/core/EffectOption"
import { flow, pipe } from "@effect-ts-app/core/Function"
import * as MO from "@effect-ts-app/core/Schema"
import { Lock } from "redlock"

import * as RED from "../redis-client.js"
import {
  CachedRecord,
  ConnectionException,
  CouldNotAquireDbLockException,
  DBRecord,
  getIndexName,
  getRecordName,
  Index,
} from "./shared.js"
import * as simpledb from "./simpledb.js"

const ttl = 10 * 1000

export function createContext<TKey extends string, EA, A extends DBRecord<TKey>>() {
  return <REncode, RDecode, EDecode>(
    type: string,
    encode: (record: A) => Effect.RIO<REncode, EA>,
    decode: (d: EA) => Effect<RDecode, EDecode, A>,
    schemaVersion: string,
    makeIndexKey: (r: A) => Index
  ) => {
    const getData = flow(encode, Effect.map(JSON.stringify))
    return {
      find: simpledb.find(find, decode, type),
      findByIndex: getIdx,
      save: simpledb.store(find, store, lockRedisRecord, type),
    }

    function find(id: string) {
      return pipe(
        RED.hmgetAll(getKey(id)),
        EO.chainEffect((v) =>
          pipe(
            pipe(RedisSerializedDBRecord.Parser, MO.condemnFail)(v),
            Effect.map(({ data, version }) => ({ data: JSON.parse(data) as EA, version })),
            Effect.mapError((e) => new ConnectionException(new Error(e.toString())))
          )
        ),
        Effect.orDie
      )
    }
    function store(record: A, currentVersion: Option<string>) {
      const version = currentVersion
        .map((cv) => (parseInt(cv) + 1).toString())
        .getOrElse(() => "1")
      return Option.fold_(
        currentVersion,
        () =>
          pipe(
            M.use_(lockIndex(record), () =>
              pipe(
                pipe(
                  getIndex(record),
                  EO.zipRight(
                    Effect.fail(() => new Error("Combination already exists, abort"))
                  )
                ),
                Effect.zipRight(getData(record)),
                // TODO: instead use MULTI & EXEC to make it in one command?
                Effect.chain((data) =>
                  hmSetRec(getKey(record.id), {
                    version,
                    timestamp: new Date(),
                    data,
                  })
                ),
                Effect.zipRight(setIndex(record)),
                Effect.orDie
              )
            ),
            Effect.map(() => ({ version, data: record } as CachedRecord<A>))
          ),
        () =>
          pipe(
            getData(record),
            Effect.chain((data) =>
              hmSetRec(getKey(record.id), {
                version,
                timestamp: new Date(),
                data,
              })
            ),
            Effect.orDie,
            Effect.map(() => ({ version, data: record } as CachedRecord<A>))
          )
      )
    }

    function getIndex(record: A) {
      const index = makeIndexKey(record)
      return getIdx(index)
    }

    function setIndex(record: A) {
      const index = makeIndexKey(record)
      return setIdx(index, record)
    }

    function lockIndex(record: A) {
      const index = makeIndexKey(record)
      return lockRedisIdx(index)
    }

    function getIdx(index: Index) {
      return pipe(
        RED.hget(getIdxKey(index), index.key),
        EO.map((i) => i as TKey)
      )
    }

    function setIdx(index: Index, r: A) {
      return RED.hset(getIdxKey(index), index.key, r.id)
    }

    function lockRedisIdx(index: Index) {
      const lockKey = getIdxLockKey(index)
      return M.make_(
        Effect.bimap_(
          // acquire
          Effect.chain_(RED.lock, (lock) =>
            Effect.tryPromise(() => lock.lock(lockKey, ttl) as any as Promise<Lock>)
          ),
          (err) => new CouldNotAquireDbLockException(type, lockKey, err as Error),
          // release
          (lock) => ({
            release: Effect.tryPromise(() => lock.unlock() as any as Promise<void>).orDie(),
          })
        ),
        (l) => l.release
      )
    }

    function lockRedisRecord(id: string) {
      return M.make_(
        Effect.bimap_(
          // acquire
          Effect.chain_(RED.lock, (lock) =>
            Effect.tryPromise(() => lock.lock(getLockKey(id), ttl) as any as Promise<Lock>)
          ),
          (err) => new CouldNotAquireDbLockException(type, id, err as Error),
          // release
          (lock) => ({
            // TODO
            release: Effect.tryPromise(() => lock.unlock() as any as Promise<void>).orDie(),
          })
        ),
        (l) => l.release
      )
    }

    function getKey(id: string) {
      return `v${schemaVersion}.${getRecordName(type, id)}`
    }

    function getLockKey(id: string) {
      return `v${schemaVersion}.locks.${getRecordName(type, id)}`
    }

    function getIdxKey(index: Index) {
      return `v${schemaVersion}.${getIndexName(type, index.doc)}`
    }
    function getIdxLockKey(index: Index) {
      return `v${schemaVersion}.locks.${getIndexName(type, index.doc)}_${index.key}`
    }
  }

  function hmSetRec(key: string, val: RedisSerializedDBRecord) {
    const enc = RedisSerializedDBRecord.Encoder(val)
    return Effect.chain_(RED.client, (client) =>
      Effect.uninterruptible(
        Effect.effectAsync<unknown, ConnectionException, void>((res) => {
          client.hmset(
            key,
            "version",
            enc.version,
            "timestamp",
            enc.timestamp,
            "data",
            enc.data,
            (err) =>
              err ? res(Effect.fail(new ConnectionException(err))) : res(Effect.succeed(void 0))
          )
        })
      )
    )
  }
}

export class RedisSerializedDBRecord extends MO.Model<RedisSerializedDBRecord>()({
  version: MO.prop(MO.string),
  timestamp: MO.prop(MO.date),
  data: MO.prop(MO.string),
}) {}

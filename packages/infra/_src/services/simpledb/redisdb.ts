/* eslint-disable @typescript-eslint/no-explicit-any */

import { flow, pipe } from "@effect-app/core/Function"
import * as MO from "@effect-app/schema"
import type { Lock } from "redlock"

import * as RED from "@effect-app/infra-adapters/redis-client"
import type { CachedRecord, DBRecord, Index } from "./shared.js"
import { ConnectionException, CouldNotAquireDbLockException, getIndexName, getRecordName } from "./shared.js"
import * as simpledb from "./simpledb.js"

const ttl = 10 * 1000

export function createContext<TKey extends string, EA, A extends DBRecord<TKey>>() {
  return <REncode, RDecode, EDecode>(
    type: string,
    encode: (record: A) => Effect<REncode, never, EA>,
    decode: (d: EA) => Effect<RDecode, EDecode, A>,
    schemaVersion: string,
    makeIndexKey: (r: A) => Index
  ) => {
    const getData = flow(encode, _ => _.map(JSON.stringify))
    return {
      find: simpledb.find(find, decode, type),
      findByIndex: getIdx,
      save: simpledb.store(find, store, lockRedisRecord, type)
    }

    function find(id: string) {
      return RED.hmgetAll(getKey(id)).flatMapOpt(v =>
        pipe(
          RedisSerializedDBRecord.Parser,
          MO.condemnFail
        )(v)
          .map(({ data, version }) => ({
            data: JSON.parse(data) as EA,
            version
          }))
          .mapError(e => new ConnectionException(new Error(e.toString())))
      ).orDie
    }
    function store(record: A, currentVersion: Opt<string>) {
      const version = currentVersion
        .map(cv => (parseInt(cv) + 1).toString())
        .getOrElse(() => "1")
      return currentVersion.match(
        () =>
          lockIndex(record).zipRight(
            getIndex(record)
              .zipRightOpt(
                Effect.fail(() => new Error("Combination already exists, abort"))
              )
              .zipRight(getData(record))
              // TODO: instead use MULTI & EXEC to make it in one command?
              .flatMap(data =>
                hmSetRec(getKey(record.id), {
                  version,
                  timestamp: new Date(),
                  data
                })
              )
              .zipRight(setIndex(record))
              .orDie.map(() => ({ version, data: record } as CachedRecord<A>))
          ).scoped,
        () =>
          getData(record)
            .flatMap(data =>
              hmSetRec(getKey(record.id), {
                version,
                timestamp: new Date(),
                data
              })
            )
            .orDie.map(() => ({ version, data: record } as CachedRecord<A>))
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
      return RED.hget(getIdxKey(index), index.key).map(_ => _.map(i => i as TKey))
    }

    function setIdx(index: Index, r: A) {
      return RED.hset(getIdxKey(index), index.key, r.id)
    }

    function lockRedisIdx(index: Index) {
      const lockKey = getIdxLockKey(index)
      // acquire
      return RED.lock
        .flatMap(lock => Effect.tryPromise(() => lock.lock(lockKey, ttl) as unknown as Promise<Lock>))
        .mapBoth(
          err => new CouldNotAquireDbLockException(type, lockKey, err as Error),
          // release
          lock => ({
            release: Effect.tryPromise(() => lock.unlock() as unknown as Promise<void>)
              .orDie
          })
        ).acquireRelease(
          l => l.release
        )
    }

    function lockRedisRecord(id: string) {
      // acquire
      return RED.lock
        .flatMap(lock =>
          Effect.tryPromise(
            () => lock.lock(getLockKey(id), ttl) as unknown as Promise<Lock>
          )
        )
        .mapBoth(
          err => new CouldNotAquireDbLockException(type, id, err as Error),
          // release
          lock => ({
            // TODO
            release: Effect.tryPromise(() => lock.unlock() as unknown as Promise<void>)
              .orDie
          })
        ).acquireRelease(
          l => l.release
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
    return RED.client.flatMap(
      client =>
        Effect.async<never, ConnectionException, void>(res => {
          client.hmset(
            key,
            "version",
            enc.version,
            "timestamp",
            enc.timestamp,
            "data",
            enc.data,
            err =>
              err
                ? res(Effect.fail(new ConnectionException(err)))
                : res(Effect(void 0))
          )
        }).uninterruptible
    )
  }
}

export class RedisSerializedDBRecord extends MO.Model<RedisSerializedDBRecord>()({
  version: MO.prop(MO.string),
  timestamp: MO.prop(MO.date),
  data: MO.prop(MO.string)
}) {}

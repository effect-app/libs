import { Effect, Layer, Maybe } from "@effect-ts-app/core/Prelude"

import {
  CachedRecord,
  DBRecord,
  EffectMap,
  makeMap,
  OptimisticLockException,
} from "./shared.js"

export type Version = string
export class InvalidStateError {
  readonly _tag = "InvalidStateError"
  constructor(readonly message: string, readonly details?: unknown) {}
}

export function makeLiveRecordCache() {
  const m = new Map<string, EffectMap<string, unknown>>()
  return {
    get: <T>(type: string) =>
      Effect.succeedWith(() => {
        const ex = m.get(type)
        if (!ex) {
          const nm = makeMap<string, unknown>()
          m.set(type, nm)
          return nm as EffectMap<string, CachedRecord<T>>
        }
        return ex as EffectMap<string, CachedRecord<T>>
      }),
  }
}

export interface RecordCache extends ReturnType<typeof makeLiveRecordCache> {}

// module tag
export const RecordCache = Has.tag<RecordCache>()

export const LiveRecordCache = Layer.fromFunction(RecordCache)(makeLiveRecordCache)

const getM =
  <T>(type: string) =>
  <R, E, A>(eff: (m: EffectMap<string, CachedRecord<T>>) => Effect<R, E, A>) =>
    Effect.gen(function* ($) {
      const { get } = yield* $(RecordCache)
      return yield* $(get<T>(type).flatMap(eff))
    })

export function find<R, RDecode, EDecode, E, EA, A>(
  tryRead: (id: string) => Effect<R, E, Maybe<CachedRecord<EA>>>,
  decode: (d: EA) => Effect<RDecode, EDecode, A>,
  type: string
) {
  const getCache = getM<A>(type)
  const read = (id: string) =>
    tryRead(id)
      .flatMapMaybeEffect(({ data, version }) =>
        decode(data).bimap(
          (err) => new InvalidStateError("DB serialisation Issue", err),
          (data) => ({ data, version })
        )
      )
      .tapMaybe((r) => getCache((c) => c.set(id, r)))
      .mapMaybe((r) => r.data)

  return (id: string) =>
    getCache((c) =>
      c
        .find(id)
        .mapMaybe((existing) => existing.data)
        .alt(() => read(id))
    )
}

export function storeDirectly<R, E, TKey extends string, A extends DBRecord<TKey>>(
  save: (r: A, version: Maybe<Version>) => Effect<R, E, CachedRecord<A>>,
  type: string
) {
  const getCache = getM<A>(type)
  return (record: A) =>
    getCache((c) =>
      c
        .find(record.id)
        .mapMaybe((x) => x.version)
        .flatMap((cv) => save(record, cv))
        .tap((r) => c.set(record.id, r))
        .map((r) => r.data)
    )
}

export function store<R, E, R2, E2, TKey extends string, EA, A extends DBRecord<TKey>>(
  tryRead: (id: string) => Effect<R, E, Maybe<CachedRecord<EA>>>,
  save: (r: A, version: Maybe<Version>) => Effect<R, E, CachedRecord<A>>,
  lock: (id: string) => Managed<R2, E2, unknown>,
  type: string
) {
  const getCache = getM<A>(type)
  return (record: A) =>
    getCache((c) =>
      c
        .find(record.id)
        .mapMaybe((x) => x.version)
        .flatMap(
          Maybe.fold(() => save(record, Maybe.none), confirmVersionAndSave(record))
        )
        .tap((r) => c.set(record.id, r))
        .map((r) => r.data)
    )

  function confirmVersionAndSave(record: A) {
    return (cv: Version) =>
      Managed.use_(lock(record.id), () =>
        tryRead(record.id)
          .flatMap(
            Maybe.fold(
              () => Effect.fail(new InvalidStateError("record is gone")),
              Effect.succeed
            )
          )
          .tap(({ version }) =>
            version !== cv
              ? Effect.fail(new OptimisticLockException(type, record.id))
              : Effect.unit
          )
          .zipRight(save(record, Maybe.some(cv)))
      )
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import { Array, Effect, Exit, type NonEmptyArray, Option, Request, RequestResolver } from "effect-app"
import { type InvalidStateError, NotFoundError, type OptimisticConcurrencyException } from "effect-app/client/errors"
import { type FixEnv, type PureEnv, runTerm } from "effect-app/Pure"
import { AnyPureDSL } from "../dsl.js"
import type { FieldValues } from "../filter/types.js"
import type { Query, QueryEnd, QueryWhere } from "../query.js"
import * as Q from "../query.js"
import type { Repository } from "./service.js"

interface BatchOptions {
  readonly batch?: true | number
}

const asReadonlyArray = <T>(itemOrItems: T | ReadonlyArray<T>): ReadonlyArray<T> =>
  globalThis.Array.isArray(itemOrItems)
    ? itemOrItems as ReadonlyArray<T>
    : [itemOrItems as T]

const getBatchSize = (batch?: true | number) =>
  batch === true
    ? 100
    : typeof batch === "number" && Number.isFinite(batch) && batch > 0
    ? Math.floor(batch)
    : undefined

export const extendRepo = <
  T,
  Encoded extends FieldValues,
  Evt,
  ItemType extends string,
  IdKey extends keyof T & keyof Encoded,
  RSchema,
  RPublish,
  RProvided = never
>(
  repo: Repository<T, Encoded, Evt, ItemType, IdKey, RSchema, RPublish, RProvided>
) => {
  const get = (id: T[IdKey]) =>
    repo.find(id).pipe(
      Effect.flatMap(Option.match({
        onNone: () => Effect.fail(new NotFoundError<ItemType>({ type: repo.itemType, id })),
        onSome: Effect.succeed
      }))
    )
  function saveManyWithPure_<
    R,
    A,
    E,
    S1 extends T,
    S2 extends T
  >(
    items: Iterable<S1>,
    pure: Effect.Effect<A, E, FixEnv<R, Evt, readonly S1[], readonly S2[]>>
  ) {
    return saveAllWithEffectInt(
      runTerm(pure, [...items])
    )
  }

  function saveWithPure_<
    R,
    A,
    E,
    S1 extends T,
    S2 extends T
  >(
    item: S1,
    pure: Effect.Effect<A, E, FixEnv<R, Evt, S1, S2>>
  ) {
    return saveAllWithEffectInt(
      runTerm(pure, item)
        .pipe(Effect
          .map(([item, events, a]) => [[item], events, a]))
    )
  }

  function saveAllWithEffectInt<
    P extends T,
    R,
    E,
    A
  >(
    gen: Effect.Effect<readonly [Iterable<P>, Iterable<Evt>, A], E, R>
  ) {
    return Effect.flatMap(gen, ([items, events, a]) => repo.saveAndPublish(items, events).pipe(Effect.map(() => a)))
  }

  function saveManyWithPureBatched_<
    R,
    A,
    E,
    S1 extends T,
    S2 extends T
  >(
    items: Iterable<S1>,
    pure: Effect.Effect<A, E, FixEnv<R, Evt, readonly S1[], readonly S2[]>>,
    batchSize = 100
  ) {
    return Effect.forEach(
      Array.chunksOf(items, batchSize),
      (batch) =>
        saveAllWithEffectInt(
          runTerm(pure, batch)
        )
    )
  }

  const queryAndSavePure: {
    <A, E2, R2, T2 extends T>(
      q: (
        q: Query<Encoded>
      ) => QueryEnd<Encoded, "one">,
      pure: Effect.Effect<A, E2, FixEnv<R2, Evt, T, T2>>
    ): Effect.Effect<
      A,
      InvalidStateError | OptimisticConcurrencyException | NotFoundError<ItemType> | E2,
      Exclude<R2, {
        env: PureEnv<Evt, T, T2>
      }>
    >
    <A, E2, R2, T2 extends T>(
      q: (
        q: Query<Encoded>
      ) =>
        | Query<Encoded>
        | QueryWhere<Encoded>
        | QueryEnd<Encoded, "many">,
      pure: Effect.Effect<A, E2, FixEnv<R2, Evt, readonly T[], readonly T2[]>>
    ): Effect.Effect<
      A,
      InvalidStateError | OptimisticConcurrencyException | E2,
      | RSchema
      | RPublish
      | Exclude<R2, {
        env: PureEnv<Evt, readonly T[], readonly T2[]>
      }>
    >
    <A, E2, R2, T2 extends T>(
      q: (
        q: Query<Encoded>
      ) =>
        | Query<Encoded>
        | QueryWhere<Encoded>
        | QueryEnd<Encoded, "many">,
      pure: Effect.Effect<A, E2, FixEnv<R2, Evt, readonly T[], readonly T2[]>>,
      batch: "batched" | number
    ): Effect.Effect<
      A[],
      InvalidStateError | OptimisticConcurrencyException | E2,
      | RSchema
      | RPublish
      | Exclude<R2, {
        env: PureEnv<Evt, readonly T[], readonly T2[]>
      }>
    >
  } = (q, pure, batch?: "batched" | number) =>
    repo.query(q).pipe(
      Effect.andThen((_) =>
        Array.isArray(_)
          ? batch === undefined
            ? saveManyWithPure_(_ as any, pure as any)
            : saveManyWithPureBatched_(_ as any, pure as any, batch === "batched" ? 100 : batch)
          : saveWithPure_(_ as any, pure as any)
      )
    ) as any

  const saveManyWithPure: {
    <R, A, E, S1 extends T, S2 extends T>(
      items: Iterable<S1>,
      pure: Effect.Effect<A, E, FixEnv<R, Evt, readonly S1[], readonly S2[]>>
    ): Effect.Effect<
      A,
      InvalidStateError | OptimisticConcurrencyException | E,
      | RSchema
      | RPublish
      | Exclude<R, {
        env: PureEnv<Evt, readonly S1[], readonly S2[]>
      }>
    >
    <R, A, E, S1 extends T, S2 extends T>(
      items: Iterable<S1>,
      pure: Effect.Effect<A, E, FixEnv<R, Evt, readonly S1[], readonly S2[]>>,
      batch: "batched" | number
    ): Effect.Effect<
      A[],
      InvalidStateError | OptimisticConcurrencyException | E,
      | RSchema
      | RPublish
      | Exclude<R, {
        env: PureEnv<Evt, readonly S1[], readonly S2[]>
      }>
    >
  } = (items, pure, batch?: "batched" | number) =>
    batch
      ? Effect.forEach(
        Array.chunksOf(items, batch === "batched" ? 100 : batch),
        (batch) =>
          saveAllWithEffectInt(
            runTerm(pure, batch)
          )
      )
      : saveAllWithEffectInt(
        runTerm(pure, [...items])
      )

  const byIdAndSaveWithPure: {
    <R, A, E, S2 extends T>(
      id: T[IdKey],
      pure: Effect.Effect<A, E, FixEnv<R, Evt, T, S2>>
    ): Effect.Effect<
      A,
      InvalidStateError | OptimisticConcurrencyException | NotFoundError<ItemType> | E,
      | RSchema
      | RPublish
      | Exclude<R, {
        env: PureEnv<Evt, T, S2>
      }>
    >
  } = (id, pure): any => get(id).pipe(Effect.flatMap((item) => saveWithPure_(item, pure)))

  type Req =
    & Request.Request<T, NotFoundError<ItemType>>
    & { _tag: `Get${ItemType}`; id: T[IdKey] }
  const _request = Request.tagged<Req>(`Get${repo.itemType}`)

  const requestResolver = RequestResolver
    .make((
      entries: NonEmptyArray<Request.Entry<Req>>,
      _key: unknown
    ) =>
      (repo.query(Q.where(repo.idKey as any, "in" as any, entries.map((_) => _.request.id)) as any) as Effect.Effect<
        readonly T[],
        never
      >)
        // TODO
        .pipe(
          Effect.andThen((items) =>
            Effect.forEach(entries, (entry) =>
              Request.complete(
                Array
                  .findFirst(items, (_) => _[repo.idKey] === entry.request.id)
                  .pipe(Option.match({
                    onNone: () => Exit.fail(new NotFoundError({ type: repo.itemType, id: entry.request.id })),
                    onSome: Exit.succeed
                  }))
              )(entry), { discard: true })
          ),
          Effect
            .catchCause((cause) =>
              Effect.forEach(entries, (entry) => Request.complete(Exit.failCause(cause))(entry), { discard: true })
            )
        )
    )
    .pipe(
      RequestResolver.batchN(20)
    )

  const exts = {
    request: (id: T[IdKey]) => Effect.request(_request({ id }), requestResolver),
    get,
    log: (evt: Evt) => AnyPureDSL.log(evt),
    /**
     * Enables chunked writes for large batches via `options.batch`.
     * Note: batching breaks transactional properties because chunks are saved independently.
     */
    save: ((itemOrItems: T | ReadonlyArray<T>, options?: BatchOptions) => {
      const items = asReadonlyArray(itemOrItems)
      if (!Array.isReadonlyArrayNonEmpty(items)) {
        return Effect.void
      }
      const batchSize = getBatchSize(options?.batch)
      if (batchSize === undefined) {
        return repo.saveAndPublish(items)
      }
      return Effect.forEach(
        Array.chunksOf(items, batchSize),
        (batch) => repo.saveAndPublish(batch),
        { discard: true }
      )
    }) as (
      itemOrItems: T | ReadonlyArray<T>,
      options?: BatchOptions
    ) => Effect.Effect<
      void,
      InvalidStateError | OptimisticConcurrencyException,
      RSchema | RPublish
    >,
    saveWithEvents: (events: Iterable<Evt>) => (...items: NonEmptyArray<T>) => repo.saveAndPublish(items, events),
    /**
     * Enables chunked deletes for large batches via `options.batch`.
     * Note: batching breaks transactional properties because chunks are removed independently.
     */
    remove: ((itemOrItems: T | ReadonlyArray<T>, options?: BatchOptions) => {
      const items = asReadonlyArray(itemOrItems)
      if (!Array.isReadonlyArrayNonEmpty(items)) {
        return Effect.void
      }
      const batchSize = getBatchSize(options?.batch)
      if (batchSize === undefined) {
        return repo.removeAndPublish(items)
      }
      return Effect.forEach(
        Array.chunksOf(items, batchSize),
        (batch) => repo.removeAndPublish(batch),
        { discard: true }
      )
    }) as (
      itemOrItems: T | ReadonlyArray<T>,
      options?: BatchOptions
    ) => Effect.Effect<void, never, RSchema | RPublish>,
    /**
     * Enables chunked deletes for large batches via `options.batch`.
     * Note: batching breaks transactional properties because chunks are removed independently.
     */
    removeById: ((idOrIds: T[IdKey] | ReadonlyArray<T[IdKey]>, options?: BatchOptions) => {
      const ids = asReadonlyArray(idOrIds)
      if (!Array.isReadonlyArrayNonEmpty(ids)) {
        return Effect.void
      }
      const batchSize = getBatchSize(options?.batch)
      if (batchSize === undefined) {
        return repo.removeById(ids)
      }
      return Effect.forEach(
        Array.chunksOf(ids, batchSize),
        (batch) => repo.removeById(batch),
        { discard: true }
      )
    }) as (
      idOrIds: T[IdKey] | ReadonlyArray<T[IdKey]>,
      options?: BatchOptions
    ) => Effect.Effect<void, never, RSchema>,
    queryAndSavePure,
    saveManyWithPure,
    byIdAndSaveWithPure,
    saveWithPure: <
      R,
      A,
      E,
      S1 extends T,
      S2 extends T
    >(
      item: S1,
      pure: Effect.Effect<A, E, FixEnv<R, Evt, S1, S2>>
    ) =>
      saveAllWithEffectInt(
        runTerm(pure, item)
          .pipe(Effect.map(([item, events, a]) => [[item], events, a]))
      )
  }

  return {
    ...repo,
    ...exts
  } as Repository<T, Encoded, Evt, ItemType, IdKey, RSchema, RPublish, RProvided> & typeof exts
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ExtendedRepository<
  T,
  Encoded extends FieldValues,
  Evt,
  ItemType extends string,
  IdKey extends keyof T & keyof Encoded,
  RSchema,
  RPublish,
  RProvided = never
> extends ReturnType<typeof extendRepo<T, Encoded, Evt, ItemType, IdKey, RSchema, RPublish, RProvided>> {}

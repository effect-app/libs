/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import { Array, Effect, Exit, type NonEmptyArray, type NonEmptyReadonlyArray, Option, Request, RequestResolver } from "effect-app"
import { type InvalidStateError, NotFoundError, type OptimisticConcurrencyException } from "effect-app/client/errors"
import { type FixEnv, type PureEnv, runTerm } from "effect-app/Pure"
import { AnyPureDSL } from "../dsl.js"
import type { FieldValues } from "../filter/types.js"
import type { Query, QueryEnd, QueryWhere } from "../query.js"
import * as Q from "../query.js"
import type { Repository } from "./service.js"

export const extendRepo = <
  T,
  Encoded extends FieldValues,
  Evt,
  ItemType extends string,
  IdKey extends keyof T & keyof Encoded,
  RSchema,
  RPublish
>(
  repo: Repository<T, Encoded, Evt, ItemType, IdKey, RSchema, RPublish>
) => {
  const get = (id: T[IdKey]) =>
    Effect.flatMap(
      repo.find(id),
      (_) => Effect.mapError(_, () => new NotFoundError<ItemType>({ type: repo.itemType, id }))
    )
  function saveManyWithPure_<
    R,
    A,
    E,
    S1 extends T,
    S2 extends T
  >(
    items: Iterable<S1>,
    pure: Effect<A, E, FixEnv<R, Evt, readonly S1[], readonly S2[]>>
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
    pure: Effect<A, E, FixEnv<R, Evt, S1, S2>>
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
    gen: Effect<readonly [Iterable<P>, Iterable<Evt>, A], E, R>
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
    pure: Effect<A, E, FixEnv<R, Evt, readonly S1[], readonly S2[]>>,
    batchSize = 100
  ) {
    return Effect.forEach(
      Array.chunk_(items, batchSize),
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
      pure: Effect<A, E2, FixEnv<R2, Evt, T, T2>>
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
      pure: Effect<A, E2, FixEnv<R2, Evt, readonly T[], readonly T2[]>>
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
      pure: Effect<A, E2, FixEnv<R2, Evt, readonly T[], readonly T2[]>>,
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
      pure: Effect<A, E, FixEnv<R, Evt, readonly S1[], readonly S2[]>>
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
      pure: Effect<A, E, FixEnv<R, Evt, readonly S1[], readonly S2[]>>,
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
        Array.chunk_(items, batch === "batched" ? 100 : batch),
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
      pure: Effect<A, E, FixEnv<R, Evt, T, S2>>
    ): Effect<
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
    .makeBatched((
      requests: NonEmptyReadonlyArray<Req>
    ) =>
      (repo.query(Q.where(repo.idKey as any, "in" as any, requests.map((_) => _.id)) as any) as Effect<
        readonly T[],
        never
      >)
        // TODO
        .pipe(
          Effect.andThen((items) =>
            Effect.forEach(requests, (r) =>
              Request.complete(
                r,
                Array
                  .findFirst(items, (_) => _[repo.idKey] === r.id)
                  .pipe(Option.match({
                    onNone: () => Exit.fail(new NotFoundError({ type: repo.itemType, id: r.id })),
                    onSome: Exit.succeed
                  }))
              ), { discard: true })
          ),
          Effect
            .catchAllCause((cause) =>
              Effect.forEach(requests, Request.complete(Exit.failCause(cause)), { discard: true })
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
    save: (...items: NonEmptyArray<T>) => repo.saveAndPublish(items),
    saveWithEvents: (events: Iterable<Evt>) => (...items: NonEmptyArray<T>) => repo.saveAndPublish(items, events),
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
      pure: Effect<A, E, FixEnv<R, Evt, S1, S2>>
    ) =>
      saveAllWithEffectInt(
        runTerm(pure, item)
          .pipe(Effect.map(([item, events, a]) => [[item], events, a]))
      )
  }

  return {
    ...repo,
    ...exts
  } as Repository<T, Encoded, Evt, ItemType, IdKey, RSchema, RPublish> & typeof exts
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ExtendedRepository<
  T,
  Encoded extends FieldValues,
  Evt,
  ItemType extends string,
  IdKey extends keyof T & keyof Encoded,
  RSchema,
  RPublish
> extends ReturnType<typeof extendRepo<T, Encoded, Evt, ItemType, IdKey, RSchema, RPublish>> {}

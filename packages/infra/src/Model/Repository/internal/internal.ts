/* eslint-disable @typescript-eslint/no-explicit-any */
import type {} from "effect/Equal"
import type {} from "effect/Hash"
import { Array, Chunk, Context, Effect, Equivalence, flow, type NonEmptyReadonlyArray, Option, pipe, Pipeable, PubSub, S, Unify } from "effect-app"
import { toNonEmptyArray } from "effect-app/Array"
import { NotFoundError } from "effect-app/client/errors"
import { flatMapOption } from "effect-app/Effect"
import { NonNegativeInt, type Schema } from "effect-app/Schema"
import { setupRequestContextFromCurrent } from "../../../api/setupRequest.js"
import { type FilterArgs, type PersistenceModelType, type StoreConfig, StoreMaker } from "../../../Store.js"
import { getContextMap } from "../../../Store/ContextMapContainer.js"
import type { FieldValues } from "../../filter/types.js"
import * as Q from "../../query.js"
import type { Repository } from "../service.js"

const dedupe = Array.dedupeWith(Equivalence.string)

/**
 * A base implementation to create a repository.
 */
export function makeRepoInternal<
  Evt = never
>() {
  return <
    ItemType extends string,
    R,
    Encoded extends FieldValues,
    T,
    IdKey extends keyof T & keyof Encoded
  >(
    name: ItemType,
    schema: S.Schema<T, Encoded, R>,
    mapFrom: (pm: Encoded) => Encoded,
    mapTo: (e: Encoded, etag: string | undefined) => PersistenceModelType<Encoded>,
    idKey: IdKey
  ) => {
    type PM = PersistenceModelType<Encoded>
    function mapToPersistenceModel(
      e: Encoded,
      getEtag: (id: string) => string | undefined
    ): PM {
      return mapTo(e, getEtag(e[idKey]))
    }

    function mapReverse(
      { _etag, ...e }: PM,
      setEtag: (id: string, eTag: string | undefined) => void
    ): Encoded {
      setEtag((e as any)[idKey], _etag)
      return mapFrom(e as unknown as Encoded)
    }

    const mkStore = makeStore<Encoded>()(name, schema, mapTo, idKey)

    function make<RInitial = never, E = never, RPublish = never, RCtx = never>(
      args: [Evt] extends [never] ? {
          schemaContext?: Context.Context<RCtx>
          makeInitial?: Effect<readonly T[], E, RInitial> | undefined
          config?: Omit<StoreConfig<Encoded>, "partitionValue"> & {
            partitionValue?: (a: Encoded) => string
          }
        }
        : {
          schemaContext?: Context.Context<RCtx>
          publishEvents: (evt: NonEmptyReadonlyArray<Evt>) => Effect<void, never, RPublish>
          makeInitial?: Effect<readonly T[], E, RInitial> | undefined
          config?: Omit<StoreConfig<Encoded>, "partitionValue"> & {
            partitionValue?: (a: Encoded) => string
          }
        }
    ) {
      return Effect
        .gen(function*() {
          const rctx: Context<RCtx> = args.schemaContext ?? Context.empty() as any
          const provideRctx = Effect.provide(rctx)
          const encodeMany = flow(
            S.encode(S.Array(schema)),
            provideRctx,
            Effect.withSpan("encodeMany", { captureStackTrace: false })
          )
          const decode = flow(S.decode(schema), provideRctx)
          const decodeMany = flow(
            S.decode(S.Array(schema)),
            provideRctx,
            Effect.withSpan("decodeMany", { captureStackTrace: false })
          )

          const store = yield* mkStore(args.makeInitial, args.config)
          const cms = Effect.andThen(getContextMap.pipe(Effect.orDie), (_) => ({
            get: (id: string) => _.get(`${name}.${id}`),
            set: (id: string, etag: string | undefined) => _.set(`${name}.${id}`, etag)
          }))

          const pub = "publishEvents" in args
            ? args.publishEvents
            : () => Effect.void
          const changeFeed = yield* PubSub.unbounded<[T[], "save" | "remove"]>()

          const allE = cms
            .pipe(Effect.flatMap((cm) => Effect.map(store.all, (_) => _.map((_) => mapReverse(_, cm.set)))))

          const all = Effect
            .flatMap(
              allE,
              (_) => decodeMany(_).pipe(Effect.orDie)
            )
            .pipe(Effect.map((_) => _ as T[]))

          const fieldsSchema = schema as unknown as { fields: any }
          // assumes the id field never needs a service...
          const i = ("fields" in fieldsSchema ? S.Struct(fieldsSchema["fields"]) as unknown as typeof schema : schema)
            .pipe((_) => {
              let ast = _.ast
              if (ast._tag === "Declaration") ast = ast.typeParameters[0]!

              const s = S.make(ast) as unknown as Schema<T, Encoded, R>

              return ast._tag === "Union"
                // we need to get the TypeLiteral, incase of class it's behind a transform...
                ? S.Union(
                  ...ast.types.map((_) =>
                    (S.make(_._tag === "Transformation" ? _.from : _) as unknown as Schema<T, Encoded>)
                      .pipe(S.pick(idKey as any))
                  )
                )
                : s.pipe(S.pick(idKey as any))
            })
          const encodeId = flow(S.encode(i), provideRctx)
          function findEId(id: Encoded[IdKey]) {
            return Effect.flatMap(
              store.find(id),
              (item) =>
                Effect.gen(function*() {
                  const { set } = yield* cms
                  return item.pipe(Option.map((_) => mapReverse(_, set)))
                })
            )
          }
          // TODO: select the particular field, instead of as struct
          function findE(id: T[IdKey]) {
            return pipe(
              encodeId({ [idKey]: id } as any),
              Effect.orDie,
              Effect.map((_) => (_ as any)[idKey]),
              Effect.flatMap(findEId)
            )
          }

          function find(id: T[IdKey]) {
            return Effect.flatMapOption(findE(id), (_) => Effect.orDie(decode(_)))
          }

          const saveAllE = (a: Iterable<Encoded>) =>
            Effect
              .flatMapOption(
                Effect
                  .sync(() => toNonEmptyArray([...a])),
                (a) =>
                  Effect.gen(function*() {
                    const { get, set } = yield* cms
                    const items = a.map((_) => mapToPersistenceModel(_, get))
                    const ret = yield* store.batchSet(items)
                    ret.forEach((_) => set(_[idKey], _._etag))
                  })
              )
              .pipe(Effect.asVoid)

          const saveAll = (a: Iterable<T>) =>
            encodeMany(Array.fromIterable(a))
              .pipe(
                Effect.orDie,
                Effect.andThen(saveAllE)
              )

          const saveAndPublish = (items: Iterable<T>, events: Iterable<Evt> = []) => {
            return Effect
              .suspend(() => {
                const it = Chunk.fromIterable(items)
                return saveAll(it)
                  .pipe(
                    Effect.andThen(Effect.sync(() => toNonEmptyArray([...events]))),
                    // TODO: for full consistency the events should be stored within the same database transaction, and then picked up.
                    (_) => Effect.flatMapOption(_, pub),
                    Effect.andThen(changeFeed.publish([Chunk.toArray(it), "save"])),
                    Effect.asVoid
                  )
              })
              .pipe(Effect.withSpan("saveAndPublish", { captureStackTrace: false }))
          }

          function removeAndPublish(a: Iterable<T>, events: Iterable<Evt> = []) {
            return Effect.gen(function*() {
              const { get, set } = yield* cms
              const it = [...a]
              const items = yield* encodeMany(it).pipe(Effect.orDie)
              // TODO: we should have a batchRemove on store so the adapter can actually batch...
              for (const e of items) {
                yield* store.remove(mapToPersistenceModel(e, get))
                set(e[idKey], undefined)
              }
              yield* Effect
                .sync(() => toNonEmptyArray([...events]))
                // TODO: for full consistency the events should be stored within the same database transaction, and then picked up.
                .pipe((_) => Effect.flatMapOption(_, pub))

              yield* changeFeed.publish([it, "remove"])
            })
          }

          const parseMany = (items: readonly PM[]) =>
            Effect
              .flatMap(cms, (cm) =>
                decodeMany(items.map((_) => mapReverse(_, cm.set)))
                  .pipe(Effect.orDie, Effect.withSpan("parseMany", { captureStackTrace: false })))
          const parseMany2 = <A, R>(
            items: readonly PM[],
            schema: S.Schema<A, Encoded, R>
          ) =>
            Effect
              .flatMap(cms, (cm) =>
                S
                  .decode(S.Array(schema))(
                    items.map((_) => mapReverse(_, cm.set))
                  )
                  .pipe(Effect.orDie, Effect.withSpan("parseMany2", { captureStackTrace: false })))
          const filter = <U extends keyof Encoded = keyof Encoded>(args: FilterArgs<Encoded, U>) =>
            store
              .filter(
                // always enforce id and _etag because they are system fields, required for etag tracking etc
                {
                  ...args,
                  select: args.select
                    ? dedupe([...args.select, idKey, "_etag" as any])
                    : undefined
                } as typeof args
              )
              .pipe(
                Effect.tap((items) =>
                  Effect.map(cms, ({ set }) => items.forEach((_) => set((_ as Encoded)[idKey], (_ as PM)._etag)))
                )
              )

          // TODO: For raw we should use S.from, and drop the R...
          const query: {
            <A, R, From extends FieldValues>(
              q: Q.QueryProjection<Encoded extends From ? From : never, A, R>
            ): Effect.Effect<readonly A[], S.ParseResult.ParseError, R>
            <A, R, EncodedRefined extends Encoded = Encoded>(
              q: Q.QAll<NoInfer<Encoded>, NoInfer<EncodedRefined>, A, R>
            ): Effect.Effect<readonly A[], never, R>
          } = (<A, R, EncodedRefined extends Encoded = Encoded>(q: Q.QAll<Encoded, EncodedRefined, A, R>) => {
            const a = Q.toFilter(q)
            const eff = a.mode === "project"
              ? filter(a)
                // TODO: mapFrom but need to support per field and dependencies
                .pipe(
                  Effect.andThen(flow(S.decode(S.Array(a.schema ?? schema)), provideRctx))
                )
              : a.mode === "collect"
              ? filter(a)
                // TODO: mapFrom but need to support per field and dependencies
                .pipe(
                  Effect.flatMap(flow(
                    S.decode(S.Array(a.schema)),
                    Effect.map(Array.getSomes),
                    provideRctx
                  ))
                )
              : Effect.flatMap(
                filter(a),
                (_) =>
                  Unify.unify(
                    a.schema
                      // TODO: partial may not match?
                      ? parseMany2(_ as any, a.schema as any)
                      : parseMany(_ as any)
                  )
              )
            return pipe(
              a.ttype === "one"
                ? Effect.andThen(
                  eff,
                  flow(
                    Array.head,
                    Effect.mapError(() => new NotFoundError({ id: "query", /* TODO */ type: name }))
                  )
                )
                : a.ttype === "count"
                ? Effect
                  .andThen(eff, (_) => NonNegativeInt(_.length))
                  .pipe(Effect.catchTag("ParseError", (e) => Effect.die(e)))
                : eff,
              Effect.withSpan("Repository.query [effect-app/infra]", {
                captureStackTrace: false,
                attributes: {
                  "repository.model_name": name,
                  query: { ...a, schema: a.schema ? "__SCHEMA__" : a.schema, filter: a.filter }
                }
              })
            )
          }) as any

          const r: Repository<T, Encoded, Evt, ItemType, IdKey, Exclude<R, RCtx>, RPublish> = {
            changeFeed,
            itemType: name,
            idKey,
            find,
            all,
            saveAndPublish,
            removeAndPublish,
            query(q: any) {
              // eslint-disable-next-line prefer-rest-params
              return query(typeof q === "function" ? Pipeable.pipeArguments(Q.make(), arguments) : q) as any
            },
            /**
             * @internal
             */
            mapped: <A, R>(schema: S.Schema<A, any, R>) => {
              const dec = S.decode(schema)
              const encMany = S.encode(S.Array(schema))
              const decMany = S.decode(S.Array(schema))
              return {
                all: allE.pipe(
                  Effect.flatMap(decMany),
                  Effect.map((_) => _ as any[])
                ),
                find: (id: T[IdKey]) => flatMapOption(findE(id), dec),
                // query: (q: any) => {
                //   const a = Q.toFilter(q)

                //   return filter(a)
                //     .pipe(
                //       Effect.flatMap(decMany),
                //       Effect.map((_) => _ as any[]),
                //       Effect.withSpan("Repository.mapped.query [effect-app/infra]", {
                //  captureStackTrace: false,
                //         attributes: {
                //           "repository.model_name": name,
                //           query: { ...a, schema: a.schema ? "__SCHEMA__" : a.schema, filter: a.filter.build() }
                //         }
                //       })
                //     )
                // },
                save: (...xes: any[]) =>
                  Effect.flatMap(encMany(xes), (_) => saveAllE(_)).pipe(
                    Effect.withSpan("mapped.save", { captureStackTrace: false })
                  )
              }
            }
          }
          return r
        })
        .pipe(Effect
          // .withSpan("Repository.make [effect-app/infra]", { attributes: { "repository.model_name": name } })
          .withLogSpan("Repository.make: " + name))
    }

    return {
      make,
      Q: Q.make<Encoded>()
    }
  }
}

const pluralize = (s: string) =>
  s.endsWith("s")
    ? s + "es"
    : s.endsWith("y")
    ? s.substring(0, s.length - 1) + "ies"
    : s + "s"

export function makeStore<Encoded extends FieldValues>() {
  return <
    ItemType extends string,
    R,
    E,
    T,
    IdKey extends keyof Encoded
  >(
    name: ItemType,
    schema: S.Schema<T, E, R>,
    mapTo: (e: E, etag: string | undefined) => Encoded,
    idKey: IdKey
  ) => {
    function makeStore<RInitial = never, EInitial = never>(
      makeInitial?: Effect<readonly T[], EInitial, RInitial> | undefined,
      config?: Omit<StoreConfig<Encoded>, "partitionValue"> & {
        partitionValue?: (a: Encoded) => string
      }
    ) {
      function encodeToEncoded() {
        const getEtag = () => undefined
        return (t: T) =>
          S.encode(schema)(t).pipe(
            Effect.orDie,
            Effect.map((_) => mapToPersistenceModel(_, getEtag))
          )
      }

      function mapToPersistenceModel(
        e: E,
        getEtag: (id: string) => string | undefined
      ): Encoded {
        return mapTo(e, getEtag((e as any)[idKey] as string))
      }

      return Effect.gen(function*() {
        const { make } = yield* StoreMaker

        const store = yield* make<IdKey, Encoded, RInitial | R, EInitial>(
          pluralize(name),
          idKey,
          makeInitial
            ? makeInitial
              .pipe(
                Effect.flatMap(Effect.forEach(encodeToEncoded())),
                setupRequestContextFromCurrent("Repository.makeInitial [effect-app/infra]", {
                  attributes: { "repository.model_name": name }
                })
              )
            : undefined,
          {
            ...config,
            partitionValue: config?.partitionValue
              ?? ((_) => "primary") /*(isIntegrationEvent(r) ? r.companyId : r.id*/
          }
        )

        return store
      })
    }

    return makeStore
  }
}

export interface Repos<
  T,
  Encoded extends { id: string },
  RSchema,
  Evt,
  ItemType extends string,
  IdKey extends keyof T,
  RPublish
> {
  make<RInitial = never, E = never, R2 = never>(
    args: [Evt] extends [never] ? {
        makeInitial?: Effect<readonly T[], E, RInitial> | undefined
        config?: Omit<StoreConfig<Encoded>, "partitionValue"> & {
          partitionValue?: (a: Encoded) => string
        }
      }
      : {
        publishEvents: (evt: NonEmptyReadonlyArray<Evt>) => Effect<void, never, R2>
        makeInitial?: Effect<readonly T[], E, RInitial> | undefined
        config?: Omit<StoreConfig<Encoded>, "partitionValue"> & {
          partitionValue?: (a: Encoded) => string
        }
      }
  ): Effect<Repository<T, Encoded, Evt, ItemType, IdKey, RSchema, RPublish>, E, StoreMaker | RInitial | R2>
  makeWith<Out, RInitial = never, E = never, R2 = never>(
    args: [Evt] extends [never] ? {
        makeInitial?: Effect<readonly T[], E, RInitial> | undefined
        config?: Omit<StoreConfig<Encoded>, "partitionValue"> & {
          partitionValue?: (a: Encoded) => string
        }
      }
      : {
        publishEvents: (evt: NonEmptyReadonlyArray<Evt>) => Effect<void, never, R2>
        makeInitial?: Effect<readonly T[], E, RInitial> | undefined
        config?: Omit<StoreConfig<Encoded>, "partitionValue"> & {
          partitionValue?: (a: Encoded) => string
        }
      },
    f: (r: Repository<T, Encoded, Evt, ItemType, IdKey, RSchema, RPublish>) => Out
  ): Effect<Out, E, StoreMaker | RInitial | R2>
  readonly Q: ReturnType<typeof Q.make<Encoded>>
  readonly type: Repository<T, Encoded, Evt, ItemType, IdKey, RSchema, RPublish>
}

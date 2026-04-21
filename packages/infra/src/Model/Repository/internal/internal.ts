/* eslint-disable @typescript-eslint/no-explicit-any */
import type {} from "effect/Equal"
import type {} from "effect/Hash"
import { Array, Chunk, Context, Effect, Equivalence, flow, type NonEmptyReadonlyArray, Option, pipe, Pipeable, PubSub, Result, S, SchemaAST, Unify } from "effect-app"
import { toNonEmptyArray } from "effect-app/Array"
import { NotFoundError } from "effect-app/client/errors"
import { flatMapOption } from "effect-app/Effect"
import { type Codec, NonNegativeInt } from "effect-app/Schema"
import { setupRequestContextFromCurrent } from "../../../api/setupRequest.js"
import { type FilterArgs, type PersistenceModelType, type StoreConfig, StoreMaker } from "../../../Store.js"
import { getContextMap } from "../../../Store/ContextMapContainer.js"
import type { FieldValues } from "../../filter/types.js"
import * as Q from "../../query.js"
import type { Repository } from "../service.js"
import { ValidationError, ValidationResult } from "../validation.js"

const dedupe = Array.dedupeWith(Equivalence.String)

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
    schema: S.Codec<T, Encoded, R>,
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
          makeInitial?: Effect.Effect<readonly T[], E, RInitial> | undefined
          config?: Omit<StoreConfig<Encoded>, "partitionValue"> & {
            partitionValue?: (e?: Encoded) => string
          }
        }
        : {
          schemaContext?: Context.Context<RCtx>
          publishEvents: (evt: NonEmptyReadonlyArray<Evt>) => Effect.Effect<void, never, RPublish>
          makeInitial?: Effect.Effect<readonly T[], E, RInitial> | undefined
          config?: Omit<StoreConfig<Encoded>, "partitionValue"> & {
            partitionValue?: (e?: Encoded) => string
          }
        }
    ) {
      return Effect
        .gen(function*() {
          const rctx: Context.Context<RCtx> = args.schemaContext ?? Context.empty() as any
          const provideRctx = Effect.provide(rctx)
          const encodeMany = flow(
            S.encodeEffect(S.Array(schema)),
            provideRctx,
            Effect.withSpan("encodeMany", { attributes: { itemType: name } }, { captureStackTrace: false })
          )
          const decode = flow(S.decodeEffect(schema), provideRctx)
          const decodeMany = flow(
            S.decodeEffect(S.Array(schema)),
            provideRctx
          )

          const store = yield* mkStore(args.makeInitial, args.config)
          const cms = Effect.map(getContextMap.pipe(Effect.orDie), (_) => ({
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

              const pickIdFromAst = (a: SchemaAST.AST) => {
                // Unwrap Declaration (e.g. TaggedClass) to get the underlying Objects AST
                let inner = a
                if (inner._tag === "Declaration") inner = inner.typeParameters[0]!
                // Pick from the original AST to preserve the full encoding chain (e.g. decodeTo transformations).
                // Using toEncoded would lose transformation info needed to encode Type -> Encoded.
                if (SchemaAST.isObjects(inner)) {
                  const field = inner.propertySignatures.find((_) => _.name === idKey)
                  if (field) {
                    return S.Struct({ [idKey]: S.make(field.type) }) as unknown as Codec<T, Encoded>
                  }
                }
                return S.make(a) as unknown as Codec<T, Encoded>
              }

              return ast._tag === "Union"
                // we need to get the Objects (TypeLiteral), in case of class it has encoding chain...
                ? S.Union(
                  ast.types.map((_) => pickIdFromAst(_))
                )
                : pickIdFromAst(ast)
            })
          const encodeId = flow(S.encodeEffect(i), provideRctx)
          const encodeIdOnly = (id: string) =>
            encodeId({ [idKey]: id } as any).pipe(
              Effect.map((_: Record<string, unknown>) => _[idKey as string] as Encoded[IdKey])
            )
          const findEId = Effect.fnUntraced(function*(id: Encoded[IdKey]) {
            yield* Effect.annotateCurrentSpan({ itemId: id })

            return yield* Effect.flatMap(
              store.find(id),
              (item) =>
                Effect.gen(function*() {
                  const { set } = yield* cms
                  return item.pipe(Option.map((_) => mapReverse(_, set)))
                })
            )
          })
          // TODO: select the particular field, instead of as struct
          const findE = Effect.fnUntraced(function*(id: T[IdKey]) {
            yield* Effect.annotateCurrentSpan({ itemId: id })

            return yield* pipe(
              encodeId({ [idKey]: id } as any),
              Effect.orDie,
              Effect.map((_) => (_ as any)[idKey]),
              Effect.flatMap(findEId)
            )
          })

          const find = Effect.fn("find", { attributes: { itemType: name } })(function*(id: T[IdKey]) {
            yield* Effect.annotateCurrentSpan({ itemId: id })

            return yield* flatMapOption(findE(id), (_) => Effect.orDie(decode(_)))
          })

          const saveAllE = (a: Iterable<Encoded>) =>
            flatMapOption(
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

          const saveAndPublish = Effect.fn("saveAndPublish", { attributes: { itemType: name } })(
            function*(items: Iterable<T>, events: Iterable<Evt> = []) {
              const it = Chunk.fromIterable(items)
              const evts = [...events]
              yield* Effect.annotateCurrentSpan({ itemIds: [...Chunk.map(it, (_) => _[idKey])], events: evts.length })
              return yield* saveAll(it)
                .pipe(
                  Effect.andThen(Effect.sync(() => toNonEmptyArray(evts))),
                  // TODO: for full consistency the events should be stored within the same database transaction, and then picked up.
                  (_) => flatMapOption(_, pub),
                  Effect.andThen(PubSub.publish(changeFeed, [Chunk.toArray(it), "save"] as [T[], "save" | "remove"])),
                  Effect.asVoid
                )
            }
          )

          const removeAndPublish = Effect.fn("removeAndPublish", { attributes: { itemType: name } })(
            function*(a: Iterable<T>, events: Iterable<Evt> = []) {
              const { set } = yield* cms
              const it = [...a]
              const evts = [...events]
              yield* Effect.annotateCurrentSpan({ itemIds: it.map((_) => _[idKey]), eventCount: evts.length })
              const items = yield* encodeMany(it).pipe(Effect.orDie)
              if (Array.isReadonlyArrayNonEmpty(items)) {
                yield* store.batchRemove(
                  items.map((_) => (_[idKey])),
                  args.config?.partitionValue?.(items[0])
                )
                for (const e of items) {
                  set(e[idKey], undefined)
                }
                yield* Effect
                  .sync(() => toNonEmptyArray(evts))
                  // TODO: for full consistency the events should be stored within the same database transaction, and then picked up.
                  .pipe((_) => flatMapOption(_, pub))

                yield* PubSub.publish(changeFeed, [it, "remove"] as [T[], "save" | "remove"])
              }
            }
          )

          const removeById = Effect.fn("removeById", { attributes: { itemType: name } })(
            function*(...ids: readonly T[IdKey][]) {
              if (!Array.isReadonlyArrayNonEmpty(ids)) {
                return
              }
              const { set } = yield* cms
              const eids = yield* Effect.forEach(ids, (_) => encodeIdOnly(_ as any)).pipe(Effect.orDie)
              yield* Effect.annotateCurrentSpan({ itemIds: eids })
              yield* store.batchRemove(eids)
              for (const id of eids) {
                set(id, undefined)
              }
              yield* PubSub.publish(changeFeed, [[], "remove"] as [T[], "save" | "remove"])
            }
          )

          const parseMany = Effect.fn("parseMany", { attributes: { itemType: name } })(function*(items: readonly PM[]) {
            const cm = yield* cms
            return yield* decodeMany(items.map((_) => mapReverse(_, cm.set))).pipe(Effect.orDie)
          })
          const parseMany2 = Effect.fn("parseMany2", { attributes: { itemType: name } })(
            function*<A, R>(items: readonly PM[], schema: S.Codec<A, Encoded, R>) {
              const cm = yield* cms
              return yield* S.decodeEffect(S.Array(schema))(items.map((_) => mapReverse(_, cm.set))).pipe(Effect.orDie)
            }
          )
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
            ): Effect.Effect<readonly A[], S.SchemaError, Exclude<R, RCtx>>
            <A, R, EncodedRefined extends Encoded = Encoded>(
              q: Q.QAll<NoInfer<Encoded>, NoInfer<EncodedRefined>, A, R>
            ): Effect.Effect<readonly A[], never, Exclude<R, RCtx>>
          } = (<A, R, EncodedRefined extends Encoded = Encoded>(q: Q.QAll<Encoded, EncodedRefined, A, R>) => {
            const a = Q.toFilter(q)
            const eff = a.mode === "project"
              ? filter(a)
                // TODO: mapFrom but need to support per field and dependencies
                .pipe(
                  Effect.andThen(flow(S.decodeEffect(S.Array(a.schema ?? schema)), provideRctx))
                )
              : a.mode === "collect"
              ? filter(a)
                // TODO: mapFrom but need to support per field and dependencies
                .pipe(
                  Effect.flatMap(flow(
                    S.decodeEffect(S.Array(a.schema)),
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
                ? Effect.flatMap(
                  eff,
                  flow(
                    Array.head,
                    Option.match({
                      onNone: () => Effect.fail(new NotFoundError({ id: "query", /* TODO */ type: name })),
                      onSome: Effect.succeed
                    })
                  )
                )
                : a.ttype === "count"
                ? Effect
                  .map(eff, (_) => NonNegativeInt(_.length))
                  .pipe(Effect.catchTag("SchemaError", (e) => Effect.die(e)))
                : eff,
              Effect.withSpan("Repository.query [effect-app/infra]", {
                attributes: {
                  itemType: name,
                  "repository.model_name": name,
                  query: { ...a, schema: a.schema ? "__SCHEMA__" : a.schema, filter: a.filter }
                }
              }, { captureStackTrace: false })
            )
          }) as any

          const validateSample = Effect.fn("validateSample", { attributes: { itemType: name } })(function*(options?: {
            percentage?: number
            maxItems?: number
          }) {
            const percentage = options?.percentage ?? 0.1 // default 10%
            const maxItems = options?.maxItems

            // 1. get all IDs with projection (bypasses main schema decode)
            const allIds = yield* store.filter({
              t: null as unknown as Encoded,
              select: [idKey as keyof Encoded]
            })

            // 2. random subset
            const shuffled = [...allIds].sort(() => Math.random() - 0.5)
            const sampleSize = Math.min(
              maxItems ?? Infinity,
              Math.ceil(allIds.length * percentage)
            )
            const sample = shuffled.slice(0, sampleSize)

            // 3. validate each item
            const errors: ValidationError[] = []

            for (const item of sample) {
              const id = item[idKey]
              const rawResult = yield* store.find(id)

              if (Option.isNone(rawResult)) continue

              const rawData = rawResult.value as Encoded
              const jitMResult = mapFrom(rawData) // apply jitM

              const decodeResult = yield* S.decodeEffect(schema)(jitMResult).pipe(
                Effect.result,
                provideRctx
              )

              if (Result.isFailure(decodeResult)) {
                errors.push(
                  new ValidationError({
                    id,
                    rawData,
                    jitMResult,
                    error: decodeResult.failure
                  })
                )
              }
            }

            return new ValidationResult({
              total: NonNegativeInt(allIds.length),
              sampled: NonNegativeInt(sample.length),
              valid: NonNegativeInt(sample.length - errors.length),
              errors
            })
          })

          const r = {
            changeFeed,
            itemType: name,
            idKey,
            find,
            all,
            saveAndPublish,
            removeAndPublish,
            removeById,
            seedNamespace: (namespace: string) => store.seedNamespace(namespace),
            validateSample,
            queryRaw<A, Out, QR>(schema: S.Codec<A, Out, QR>, q: Q.RawQuery<Encoded, Out>) {
              const dec = S.decodeEffect(S.Array(schema))
              return store.queryRaw(q).pipe(Effect.flatMap(dec))
            },
            query(q: any) {
              // eslint-disable-next-line prefer-rest-params
              return query(typeof q === "function" ? Pipeable.pipeArguments(Q.make(), arguments) : q) as any
            },
            /**
             * @internal
             */
            mapped: <A, R>(schema: S.Codec<A, any, R>) => {
              const dec = S.decodeEffect(schema)
              const encMany = S.encodeEffect(S.Array(schema))
              const decMany = S.decodeEffect(S.Array(schema))
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
                    Effect.withSpan("mapped.save", { attributes: { itemType: name } }, { captureStackTrace: false })
                  )
              }
            }
          }
          return r as Repository<T, Encoded, Evt, ItemType, IdKey, Exclude<R, RCtx>, RPublish, RCtx>
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
    schema: S.Codec<T, E, R>,
    mapTo: (e: E, etag: string | undefined) => Encoded,
    idKey: IdKey
  ) => {
    function makeStore<RInitial = never, EInitial = never>(
      makeInitial?: Effect.Effect<readonly T[], EInitial, RInitial>,
      config?: Omit<StoreConfig<Encoded>, "partitionValue"> & {
        partitionValue?: (e?: Encoded) => string
      }
    ) {
      function encodeToEncoded() {
        const getEtag = () => undefined
        return (t: T) =>
          S.encodeEffect(schema)(t).pipe(
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
        makeInitial?: Effect.Effect<readonly T[], E, RInitial> | undefined
        config?: Omit<StoreConfig<Encoded>, "partitionValue"> & {
          partitionValue?: (e?: Encoded) => string
        }
      }
      : {
        publishEvents: (evt: NonEmptyReadonlyArray<Evt>) => Effect.Effect<void, never, R2>
        makeInitial?: Effect.Effect<readonly T[], E, RInitial> | undefined
        config?: Omit<StoreConfig<Encoded>, "partitionValue"> & {
          partitionValue?: (e?: Encoded) => string
        }
      }
  ): Effect.Effect<Repository<T, Encoded, Evt, ItemType, IdKey, RSchema, RPublish>, E, StoreMaker | RInitial | R2>
  makeWith<Out, RInitial = never, E = never, R2 = never>(
    args: [Evt] extends [never] ? {
        makeInitial?: Effect.Effect<readonly T[], E, RInitial> | undefined
        config?: Omit<StoreConfig<Encoded>, "partitionValue"> & {
          partitionValue?: (e?: Encoded) => string
        }
      }
      : {
        publishEvents: (evt: NonEmptyReadonlyArray<Evt>) => Effect.Effect<void, never, R2>
        makeInitial?: Effect.Effect<readonly T[], E, RInitial> | undefined
        config?: Omit<StoreConfig<Encoded>, "partitionValue"> & {
          partitionValue?: (e?: Encoded) => string
        }
      },
    f: (r: Repository<T, Encoded, Evt, ItemType, IdKey, RSchema, RPublish>) => Out
  ): Effect.Effect<Out, E, StoreMaker | RInitial | R2>
  readonly Q: ReturnType<typeof Q.make<Encoded>>
  readonly type: Repository<T, Encoded, Evt, ItemType, IdKey, RSchema, RPublish>
}

/* eslint-disable @typescript-eslint/no-explicit-any */

import * as Array from "effect-app/Array"
import type { NonEmptyReadonlyArray } from "effect-app/Array"
import { toNonEmptyArray } from "effect-app/Array"
import * as Chunk from "effect-app/Chunk"
import { NotFoundError } from "effect-app/client/errors"
import * as Context from "effect-app/Context"
import * as Effect from "effect-app/Effect"
import { flatMapOption } from "effect-app/Effect"
import * as Option from "effect-app/Option"
import * as S from "effect-app/Schema"
import { type Codec, NonNegativeInt } from "effect-app/Schema"
import * as Equivalence from "effect/Equivalence"
import { flow, pipe } from "effect/Function"
import * as Pipeable from "effect/Pipeable"
import * as PubSub from "effect/PubSub"
import * as Request from "effect/Request"
import * as RequestResolver from "effect/RequestResolver"
import * as Result from "effect/Result"
import * as SchemaAST from "effect/SchemaAST"
import * as Unify from "effect/Unify"
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
            Effect.withSpan("encodeMany", { attributes: { "app.entity": name } }, { captureStackTrace: false })
          )
          const decode = flow(S.decodeEffectConcurrently(schema), provideRctx)
          const decodeMany = flow(
            S.decodeEffectConcurrently(S.Array(schema)),
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
            .pipe(
              Effect.map((_) => _ as T[]),
              Effect.withSpan("Repository.all", {
                kind: "client",
                attributes: { "app.entity": name }
              }, { captureStackTrace: false })
            )

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
            yield* Effect.annotateCurrentSpan({ "app.entity.id": id })

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
            yield* Effect.annotateCurrentSpan({ "app.entity.id": id })

            return yield* pipe(
              encodeId({ [idKey]: id } as any),
              Effect.orDie,
              Effect.map((_) => (_ as any)[idKey]),
              Effect.flatMap(findEId)
            )
          })

          const find = Effect.fn("Repository.find", {
            kind: "client",
            attributes: { "app.entity": name }
          })(function*(id: T[IdKey]) {
            yield* Effect.annotateCurrentSpan({ "app.entity.id": id })
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

          const saveAndPublish = Effect.fn("Repository.saveAndPublish", { attributes: { "app.entity": name } })(
            function*(items: Iterable<T>, events: Iterable<Evt> = []) {
              const it = Chunk.fromIterable(items)
              const evts = [...events]
              yield* Effect.annotateCurrentSpan({
                "app.entity.ids": Chunk.map(it, (_) => _[idKey]),
                "app.event.count": evts.length
              })
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

          const removeAndPublish = Effect.fn("Repository.removeAndPublish", { attributes: { "app.entity": name } })(
            function*(a: Iterable<T>, events: Iterable<Evt> = []) {
              const { set } = yield* cms
              const it = [...a]
              const evts = [...events]
              yield* Effect.annotateCurrentSpan({
                "app.entity.ids": it.map((_) => _[idKey]),
                "app.event.count": evts.length
              })
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

          const removeById = Effect.fn("Repository.removeById", { attributes: { "app.entity": name } })(
            function*(idOrIds: T[IdKey] | ReadonlyArray<T[IdKey]>) {
              const ids = globalThis.Array.isArray(idOrIds)
                ? idOrIds as readonly T[IdKey][]
                : [idOrIds as T[IdKey]]
              if (!Array.isReadonlyArrayNonEmpty(ids)) {
                return
              }
              const { set } = yield* cms
              const eids = yield* Effect.forEach(ids, (_) => encodeIdOnly(_ as any)).pipe(Effect.orDie)
              yield* Effect.annotateCurrentSpan({ "app.entity.ids": eids })
              yield* store.batchRemove(eids)
              for (const id of eids) {
                set(id, undefined)
              }
              yield* PubSub.publish(changeFeed, [[], "remove"] as [T[], "save" | "remove"])
            }
          )

          const parseMany = Effect.fn("parseMany", {
            attributes: { "app.entity": name, "app.query.mode": "transform" }
          })(
            function*(items: readonly PM[]) {
              const cm = yield* cms
              return yield* decodeMany(items.map((_) => mapReverse(_, cm.set))).pipe(Effect.orDie)
            }
          )
          const decodeManyCache = new WeakMap<
            S.Codec<any, any, any>,
            (i: readonly any[]) => Effect.Effect<any, any, any>
          >()
          const getDecodeMany = (s: S.Codec<any, Encoded, any>) => {
            let dec = decodeManyCache.get(s)
            if (!dec) {
              dec = S.decodeEffectConcurrently(S.Array(s))
              decodeManyCache.set(s, dec)
            }
            return dec
          }
          const parseMany2 = Effect.fn("parseMany", {
            attributes: { "app.entity": name, "app.query.mode": "transform" }
          })(
            function*<A, R>(items: readonly PM[], schema: S.Codec<A, Encoded, R>) {
              const cm = yield* cms
              return yield* getDecodeMany(schema)(items.map((_) => mapReverse(_, cm.set))).pipe(Effect.orDie)
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

          type SelectItem = NonNullable<FilterArgs<Encoded, keyof Encoded>["select"]>[number]
          type PlainSelectItem = string | { key: string; subKeys: readonly string[] }
          interface QueryBatchRequest extends Request.Request<unknown, unknown> {
            readonly _tag: "RepositoryQueryBatch"
            readonly key: string
            readonly baseArgs: Omit<FilterArgs<Encoded>, "select">
            readonly fixedSelect: readonly SelectItem[]
            readonly plainSelect: readonly PlainSelectItem[] | undefined
            readonly resolve: (rows: readonly PM[]) => Effect.Effect<unknown, unknown, never>
          }
          const QueryBatchRequest = Request.tagged<QueryBatchRequest>("RepositoryQueryBatch")

          const splitSelect = (select: FilterArgs<Encoded, keyof Encoded>["select"]) => {
            const plain: PlainSelectItem[] = []
            const fixed: SelectItem[] = []
            if (select) {
              for (const item of select) {
                if (typeof item === "string" || (typeof item === "object" && item !== null && "subKeys" in item)) {
                  plain.push(item)
                } else {
                  fixed.push(item)
                }
              }
            }
            return {
              plain: Array.isArrayNonEmpty(plain) ? plain : undefined,
              fixed
            }
          }

          const mergePlainSelect = (
            plainSelects: readonly (readonly PlainSelectItem[] | undefined)[]
          ): readonly PlainSelectItem[] | undefined => {
            if (plainSelects.some((_) => _ === undefined)) {
              return undefined
            }
            const all = plainSelects.flatMap((_) => _ ?? [])
            if (!Array.isArrayNonEmpty(all)) {
              return undefined
            }
            const keys = new Map<string, PlainSelectItem>()
            const subKeys = new Map<string, Set<string>>()
            for (const item of all) {
              if (typeof item === "string") {
                keys.set(item, item)
                subKeys.delete(item)
              } else if (!keys.has(item.key) || typeof keys.get(item.key) !== "string") {
                const set = subKeys.get(item.key) ?? new Set<string>()
                for (const subKey of item.subKeys) {
                  set.add(subKey)
                }
                subKeys.set(item.key, set)
                keys.set(item.key, { key: item.key, subKeys: [...set] })
              }
            }
            return [...keys.values()]
          }

          const makeBatchKey = (options: {
            readonly baseArgs: Omit<FilterArgs<Encoded>, "select">
            readonly mode: "collect" | "project" | "transform" | "aggregate" | undefined
            readonly ttype: "one" | "many" | "count" | undefined
            readonly fixedSelect: readonly SelectItem[]
          }) => {
            const canonicalize = (value: unknown): unknown => {
              if (globalThis.Array.isArray(value)) {
                return value.map(canonicalize)
              }
              if (typeof value === "object" && value !== null) {
                const record = value as Record<string, unknown>
                return Object.fromEntries(
                  Object
                    .entries(record)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([key, val]) => [key, canonicalize(val)])
                )
              }
              return value
            }
            return JSON.stringify(canonicalize({
              mode: options.mode,
              ttype: options.ttype,
              filter: options.baseArgs.filter,
              order: options.baseArgs.order,
              limit: options.baseArgs.limit,
              skip: options.baseArgs.skip,
              fixedSelect: options.fixedSelect
            }))
          }

          const queryBatchResolver = RequestResolver.makeGrouped<QueryBatchRequest, string>({
            key: ({ request }) => request.key,
            resolver: Effect.fnUntraced(function*(entries) {
              const first = entries[0].request
              const mergedPlainSelect = mergePlainSelect(entries.map((_) => _.request.plainSelect))
              const mergedSelect = mergedPlainSelect
                ? [...first.fixedSelect, ...mergedPlainSelect]
                : first.fixedSelect
              const select = [...mergedSelect]
              const rows = yield* filter({
                ...first.baseArgs,
                select: Array.isArrayNonEmpty(select) ? select : undefined
              })
              for (const entry of entries) {
                const exit = yield* Effect.exit(entry.request.resolve(rows))
                yield* Request.complete(exit)(entry)
              }
            })
          })

          const runQueryFromRows = <A, R, EncodedRefined extends Encoded = Encoded>(
            a: ReturnType<typeof Q.toFilter<Encoded, A, R, EncodedRefined>>,
            rows: readonly PM[]
          ) => {
            const eff = a.mode === "project"
              ? flow(
                S.decodeEffectConcurrently(S.Array(a.schema ?? schema)),
                provideRctx,
                Effect.withSpan("parseMany", {
                  attributes: { "app.entity": name, "app.query.mode": "project" }
                })
              )(rows as readonly Encoded[])
              : a.mode === "collect"
              ? flow(
                S.decodeEffectConcurrently(S.Array(a.schema)),
                Effect.map(Array.getSomes),
                provideRctx,
                Effect.withSpan("parseMany", {
                  attributes: { "app.entity": name, "app.query.mode": "collect" }
                })
              )(rows as readonly Encoded[])
              : Unify.unify(
                a.schema
                  // TODO: partial may not match?
                  ? parseMany2(rows, a.schema)
                  : parseMany(rows)
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
              Effect.tap((r) =>
                Effect.annotateCurrentSpan({
                  "app.query.ttype": a.ttype,
                  "app.query.mode": a.mode,
                  "db.response.returned_rows": Array.isArray(r) ? r.length : 1
                })
              )
            )
          }

          // TODO: For raw we should use S.from, and drop the R...
          const query: {
            <A, R, From extends FieldValues>(
              q: Q.QueryProjection<Encoded extends From ? From : never, A, R>
            ): Effect.Effect<readonly A[], S.SchemaError, Exclude<R, RCtx>>
            <A, R, EncodedRefined extends Encoded = Encoded>(
              q: Q.QAll<NoInfer<Encoded>, NoInfer<EncodedRefined>, A, R>
            ): Effect.Effect<readonly A[], never, Exclude<R, RCtx>>
          } = (<A, R, EncodedRefined extends Encoded = Encoded>(q: Q.QAll<Encoded, EncodedRefined, A, R>) => {
            const a = Q.toFilter(q, schema)
            // Mode dispatch — see `Q.project` JSDoc for the contract:
            //   aggregate: GROUP BY + aggregate functions at DB level; decode raw rows with schema; SchemaError surfaces.
            //   project  : decode raw encoded rows with schema; no PM reverse-mapping; SchemaError surfaces.
            //   collect  : same as project, but schema yields Option and None rows are dropped.
            //   transform: PM reverse-map (re-inject _etag/PM state from cms cache) then decode; orDie.
            const eff = a.mode === "aggregate"
              ? store
                // `a.select` contains `{ key, aggregate }` items not expressible in FilterFunc<Encoded, U>'s
                // `U extends keyof Encoded` generic. Cast is unavoidable until FilterFunc supports aggregate mode.
                .filter(a as any)
                // Decode raw aggregate rows directly — no PM reverse-mapping, no id/_etag needed.
                .pipe(
                  Effect.andThen(
                    flow(
                      S.decodeEffectConcurrently(S.Array(a.schema ?? schema)),
                      provideRctx,
                      Effect.withSpan("parseMany", {
                        attributes: { "app.entity": name, "app.query.mode": "aggregate" }
                      })
                    )
                  )
                )
              : a.mode === "project"
              ? filter(a)
                // TODO: mapFrom but need to support per field and dependencies
                .pipe(
                  Effect.andThen(
                    flow(
                      S.decodeEffectConcurrently(S.Array(a.schema ?? schema)),
                      provideRctx,
                      Effect.withSpan("parseMany", {
                        attributes: { "app.entity": name, "app.query.mode": "project" }
                      })
                    )
                  )
                )
              : a.mode === "collect"
              ? filter(a)
                // TODO: mapFrom but need to support per field and dependencies
                .pipe(
                  Effect.flatMap(flow(
                    S.decodeEffectConcurrently(S.Array(a.schema)),
                    Effect.map(Array.getSomes),
                    provideRctx,
                    Effect.withSpan("parseMany", {
                      attributes: { "app.entity": name, "app.query.mode": "collect" }
                    })
                  ))
                )
              : Effect.flatMap(
                filter(a),
                (_) => runQueryFromRows(a, _)
              )
            return pipe(
              eff,
              Effect.withSpan("Repository.query", {
                kind: "client",
                attributes: { "app.entity": name }
              }, { captureStackTrace: false })
            )
          }) as any

          const queryBatched: typeof query = (<A, R, EncodedRefined extends Encoded = Encoded>(
            q: Q.QAll<Encoded, EncodedRefined, A, R>
          ) => {
            const a = Q.toFilter(q, schema)
            if (a.mode === "aggregate") {
              return query(q)
            }
            const { plain, fixed } = splitSelect(a.select)
            const baseArgs: Omit<FilterArgs<Encoded>, "select"> = {
              t: a.t,
              filter: a.filter,
              order: a.order,
              limit: a.limit,
              skip: a.skip
            }
            const key = makeBatchKey({
              baseArgs,
              mode: a.mode,
              ttype: a.ttype,
              fixedSelect: fixed
            })
            return Effect
              .request(
                QueryBatchRequest({
                  key,
                  baseArgs,
                  fixedSelect: fixed,
                  plainSelect: plain,
                  resolve: (rows) => runQueryFromRows(a, rows) as Effect.Effect<unknown, unknown, never>
                }),
                queryBatchResolver
              )
              .pipe(
                Effect.withSpan("Repository.queryBatched", {
                  kind: "client",
                  attributes: { "app.entity": name }
                }, { captureStackTrace: false })
              )
          }) as typeof query

          const validateSample = Effect.fn("Repository.validateSample", { attributes: { "app.entity": name } })(
            function*(options?: {
              percentage?: number
              maxItems?: number
            }) {
              const percentage = options?.percentage ?? 0.1 // default 10%
              const maxItems = options?.maxItems

              // 1. get all IDs with projection (bypasses main schema decode)
              const allIds = yield* store
                .filter({
                  t: null as unknown as Encoded,
                  select: [idKey as keyof Encoded]
                })
                .pipe(Effect.withSpan("Repository.filter", {
                  kind: "client",
                  attributes: { "app.entity": name }
                }, { captureStackTrace: false }))

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
                const rawResult = yield* store.find(id).pipe(
                  Effect.withSpan("Repository.find", {
                    kind: "client",
                    attributes: { "app.entity": name, "app.entity.id": id }
                  }, { captureStackTrace: false })
                )

                if (Option.isNone(rawResult)) continue

                const rawData = rawResult.value as Encoded
                const jitMResult = mapFrom(rawData) // apply jitM

                const decodeResult = yield* S.decodeEffectConcurrently(schema)(jitMResult).pipe(
                  Effect.result,
                  provideRctx
                )

                if (Result.isFailure(decodeResult)) {
                  errors.push(
                    ValidationError.make({
                      id,
                      rawData,
                      jitMResult,
                      error: decodeResult.failure
                    })
                  )
                }
              }

              return ValidationResult.make({
                total: NonNegativeInt(allIds.length),
                sampled: NonNegativeInt(sample.length),
                valid: NonNegativeInt(sample.length - errors.length),
                errors
              })
            }
          )

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
              const dec = S.decodeEffectConcurrently(S.Array(schema))
              return store.queryRaw(q).pipe(
                Effect.flatMap(dec),
                Effect.withSpan("Repository.queryRaw", {
                  kind: "client",
                  attributes: { "app.entity": name }
                }, { captureStackTrace: false })
              )
            },
            query(q: any) {
              // eslint-disable-next-line prefer-rest-params
              return query(typeof q === "function" ? Pipeable.pipeArguments(Q.make(), arguments) : q) as any
            },
            queryBatched(q: any) {
              // eslint-disable-next-line prefer-rest-params
              return queryBatched(typeof q === "function" ? Pipeable.pipeArguments(Q.make(), arguments) : q) as any
            },
            /**
             * @internal
             */
            mapped: <A, R>(schema: S.Codec<A, any, R>) => {
              const dec = S.decodeEffectConcurrently(schema)
              const encMany = S.encodeEffect(S.Array(schema))
              const decMany = S.decodeEffectConcurrently(S.Array(schema))
              const spanAttrs = { kind: "client" as const, attributes: { "app.entity": name } }
              return {
                all: allE.pipe(
                  Effect.flatMap(decMany),
                  Effect.map((_) => _ as any[]),
                  Effect.withSpan("Repository.mapped.all", spanAttrs, { captureStackTrace: false })
                ),
                find: (id: T[IdKey]) =>
                  flatMapOption(findE(id), dec).pipe(
                    Effect.withSpan("Repository.mapped.find", {
                      ...spanAttrs,
                      attributes: { ...spanAttrs.attributes, "app.entity.id": id }
                    }, { captureStackTrace: false })
                  ),
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
                    Effect.withSpan("Repository.mapped.save", spanAttrs, { captureStackTrace: false })
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
                  attributes: { "app.entity": name }
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

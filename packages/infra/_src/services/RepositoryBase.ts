/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/ban-types */
import type { ParserEnv } from "@effect-app/schema/custom/Parser"
import type { Repository } from "./Repository.js"
import { StoreMaker } from "./Store.js"
import type { Filter, StoreConfig, Where } from "./Store.js"
import type {} from "effect/Equal"
import type {} from "effect/Hash"
import type { Opt } from "@effect-app/core/Option"
import { makeCodec } from "@effect-app/infra/api/codec"
import { makeFilters } from "@effect-app/infra/filter"
import type { Schema } from "@effect-app/prelude"
import { EParserFor } from "@effect-app/prelude/schema"
import type { InvalidStateError, OptimisticConcurrencyException } from "../errors.js"
import { ContextMapContainer } from "./Store/ContextMapContainer.js"

/**
 * @tsplus type Repository
 */
export abstract class RepositoryBaseC<
  T extends { id: string },
  PM extends { id: string },
  Evt,
  ItemType extends string
> {
  abstract readonly itemType: ItemType
  abstract readonly find: (id: T["id"]) => Effect<never, never, Opt<T>>
  abstract readonly all: Effect<never, never, T[]>
  abstract readonly saveAndPublish: (
    items: Iterable<T>,
    events?: Iterable<Evt>
  ) => Effect<never, InvalidStateError | OptimisticConcurrencyException, void>
  abstract readonly utils: {
    parseMany: (a: readonly PM[], env?: ParserEnv | undefined) => Effect<never, never, readonly T[]>
    all: Effect<never, never, PM[]>
    filter: (filter: Filter<PM>, cursor?: { limit?: number; skip?: number }) => Effect<never, never, PM[]>
  }
  abstract readonly changeFeed: PubSub<[T[], "save" | "remove"]>
  abstract readonly removeAndPublish: (
    items: Iterable<T>,
    events?: Iterable<Evt>
  ) => Effect<never, never, void>
}

export abstract class RepositoryBaseC1<
  T extends { id: string },
  PM extends { id: string },
  Evt,
  ItemType extends string
> extends RepositoryBaseC<T, PM, Evt, ItemType> {
  constructor(
    public readonly itemType: ItemType
  ) {
    super()
  }
}

export class RepositoryBaseC2<T extends { id: string }, PM extends { id: string }, Evt, ItemType extends string>
  extends RepositoryBaseC1<T, PM, Evt, ItemType>
{
  constructor(
    itemType: ItemType,
    protected readonly impl: Repository<T, PM, Evt, ItemType>
  ) {
    super(itemType)
  }
  // makes super calls a compiler error, as it should
  override saveAndPublish = this.impl.saveAndPublish
  override removeAndPublish = this.impl.removeAndPublish
  override find = this.impl.find
  override all = this.impl.all
  override utils = this.impl.utils
  override changeFeed = this.impl.changeFeed
}

/**
 * A base implementation to create a repository.
 */
export function makeRepo<
  PM extends { id: string; _etag: string | undefined },
  Evt = never
>() {
  return <
    ItemType extends string,
    T extends { id: string },
    ConstructorInput,
    Api,
    From extends { id: string }
  >(
    name: ItemType,
    schema: Schema.Schema<unknown, T, ConstructorInput, From, Api>,
    mapFrom: (pm: Omit<PM, "_etag">) => From,
    mapTo: (e: From, etag: string | undefined) => PM
  ) => {
    const where = makeWhere<PM>()

    function mapToPersistenceModel(
      e: From,
      getEtag: (id: string) => string | undefined
    ): PM {
      return mapTo(e, getEtag(e.id))
    }

    function mapReverse(
      { _etag, ...e }: PM,
      setEtag: (id: string, eTag: string | undefined) => void
    ): From {
      setEtag(e.id, _etag)
      return mapFrom(e)
    }

    const mkStore = makeStore<PM>()(name, schema, mapTo)

    function make<R = never, E = never, R2 = never>(
      args: [Evt] extends [never] ? {
          makeInitial?: Effect<R, E, readonly T[]>
          config?: Omit<StoreConfig<PM>, "partitionValue"> & {
            partitionValue?: (a: PM) => string
          }
        }
        : {
          publishEvents: (evt: NonEmptyReadonlyArray<Evt>) => Effect<R2, never, void>
          makeInitial?: Effect<R, E, readonly T[]>
          config?: Omit<StoreConfig<PM>, "partitionValue"> & {
            partitionValue?: (a: PM) => string
          }
        }
    ) {
      return Do(($) => {
        const store = $(mkStore(args.makeInitial, args.config))
        const cms = $(ContextMapContainer)
        const pubCfg = $(Effect.context<R2>())
        const pub = "publishEvents" in args ? flow(args.publishEvents, (_) => _.provide(pubCfg)) : () => Effect.unit
        const changeFeed = $(PubSub.unbounded<[T[], "save" | "remove"]>())

        const allE = store.all.flatMap((items) =>
          Do(($) => {
            const { set } = $(cms.get)
            return items.map((_) => mapReverse(_, set))
          })
        )

        const parse = EParserFor(schema).condemnDie

        const all = allE.flatMap((_) => _.forEachEffect((_) => parse(_)))

        function findE(id: T["id"]) {
          return store
            .find(id)
            .flatMap((items) =>
              Do(($) => {
                const { set } = $(cms.get)
                return items.map((_) => mapReverse(_, set))
              })
            )
        }

        function find(id: T["id"]) {
          return findE(id).flatMapOpt(EParserFor(schema).condemnDie)
        }

        const saveAllE = (a: Iterable<From>) =>
          Effect(a.toNonEmptyArray)
            .flatMapOpt((a) =>
              Do(($) => {
                const { get, set } = $(cms.get)
                const items = a.map((_) => mapToPersistenceModel(_, get))
                const ret = $(store.batchSet(items))
                ret.forEach((_) => set(_.id, _._etag))
              })
            )
        const encode = Encoder.for(schema)

        const saveAll = (a: Iterable<T>) => saveAllE(a.toChunk.map(encode))

        const saveAndPublish = (items: Iterable<T>, events: Iterable<Evt> = []) => {
          const it = items.toChunk
          return saveAll(it)
            > Effect(events.toNonEmptyArray)
              // TODO: for full consistency the events should be stored within the same database transaction, and then picked up.
              .flatMapOpt(pub)
            > changeFeed.publish([it.toArray, "save"])
        }

        function removeAndPublish(a: Iterable<T>, events: Iterable<Evt> = []) {
          return Effect.gen(function*($) {
            const { get, set } = yield* $(cms.get)
            const it = a.toChunk
            const items = it.map(encode)
            // TODO: we should have a batchRemove on store so the adapter can actually batch...
            for (const e of items) {
              yield* $(store.remove(mapToPersistenceModel(e, get)))
              set(e.id, undefined)
            }
            yield* $(
              Effect(events.toNonEmptyArray)
                // TODO: for full consistency the events should be stored within the same database transaction, and then picked up.
                .flatMapOpt(pub)
            )

            yield* $(changeFeed.publish([it.toArray, "remove"]))
          })
        }

        const p = Parser.for(schema).unsafe

        const r: Repository<T, PM, Evt, ItemType> = {
          /**
           * @internal
           */
          utils: {
            parseMany: (items) => cms.get.map((cm) => items.map((_) => p(mapReverse(_, cm.set)))),
            filter: store
              .filter
              .flow((_) => _.tap((items) => cms.get.map(({ set }) => items.forEach((_) => set(_.id, _._etag))))),
            all: store.all.tap((items) => cms.get.map(({ set }) => items.forEach((_) => set(_.id, _._etag))))
          },
          changeFeed,
          itemType: name,
          find,
          all,
          saveAndPublish,
          removeAndPublish
        }
        return r
      })
        // .withSpan("Repository.make [effect-app/infra]", { attributes: { "repository.model_name": name } })
        .withLogSpan("Repository.make: " + name)
    }

    return {
      make,
      where
    }
  }
}

/**
 * only use this as a shortcut if you don't have the item already
 * @tsplus fluent Repository removeById
 */
export function removeById<
  T extends { id: string },
  PM extends { id: string },
  Evt,
  ItemType extends string
>(
  self: Repository<T, PM, Evt, ItemType>,
  id: T["id"]
) {
  return self.get(id).flatMap((_) => self.removeAndPublish([_]))
}

export function makeWhere<PM extends { id: string; _etag: string | undefined }>() {
  const f_ = makeFilters<PM>()
  type WhereFilter = typeof f_

  function makeFilter_(filter: (f: WhereFilter) => Filter<PM>) {
    return filter(f_)
  }

  function where(
    makeWhere: (
      f: WhereFilter
    ) => Where | readonly [Where, ...Where[]],
    mode?: "or" | "and"
  ) {
    return makeFilter_((f) => {
      const m = makeWhere ? makeWhere(f) : []
      return ({
        mode,
        where: (Array.isArray(m) ? m as unknown as [Where, ...Where[]] : [m]) as readonly [Where, ...Where[]]
      })
    })
  }
  return where
}

const pluralize = (s: string) =>
  s.endsWith("s")
    ? s + "es"
    : s.endsWith("y")
    ? s.substring(0, s.length - 1) + "ies"
    : s + "s"

export function makeStore<
  PM extends { id: string; _etag: string | undefined }
>() {
  return <
    ItemType extends string,
    T extends { id: string },
    ConstructorInput,
    Api,
    E extends { id: string }
  >(
    name: ItemType,
    schema: Schema.Schema<unknown, T, ConstructorInput, E, Api>,
    mapTo: (e: E, etag: string | undefined) => PM
  ) => {
    const [_dec, encode] = makeCodec(schema)
    function encodeToPM() {
      const getEtag = () => undefined
      return flow(encode, (v) => mapToPersistenceModel(v, getEtag))
    }

    function mapToPersistenceModel(
      e: E,
      getEtag: (id: string) => string | undefined
    ): PM {
      return mapTo(e, getEtag(e.id))
    }

    function makeStore<R = never, E = never>(
      makeInitial?: Effect<R, E, readonly T[]>,
      config?: Omit<StoreConfig<PM>, "partitionValue"> & {
        partitionValue?: (a: PM) => string
      }
    ) {
      return Do(($) => {
        const { make } = $(StoreMaker)

        const store = $(
          make<PM, string, R, E>(
            pluralize(name),
            makeInitial
              ? (makeInitial
                .map((_) => _.map(encodeToPM())))
                .withSpan("Repository.makeInitial [effect-app/infra]", {
                  attributes: { "repository.model_name": name }
                })
              : undefined,
            {
              ...config,
              partitionValue: config?.partitionValue
                ?? ((_) => "primary") /*(isIntegrationEvent(r) ? r.companyId : r.id*/
            }
          )
        )
        return store
      })
    }

    return makeStore
  }
}

type Repos<
  Service,
  T extends { id: string },
  PM extends { id: string; _etag: string | undefined },
  Evt,
  ItemType extends string
> = {
  make<R = never, E = never, R2 = never>(
    args: [Evt] extends [never] ? {
        makeInitial?: Effect<R, E, readonly T[]>
        config?: Omit<StoreConfig<PM>, "partitionValue"> & {
          partitionValue?: (a: PM) => string
        }
      }
      : {
        publishEvents: (evt: NonEmptyReadonlyArray<Evt>) => Effect<R2, never, void>
        makeInitial?: Effect<R, E, readonly T[]>
        config?: Omit<StoreConfig<PM>, "partitionValue"> & {
          partitionValue?: (a: PM) => string
        }
      }
  ): Effect<
    StoreMaker | ContextMapContainer | R | R2,
    E,
    Repository<T, PM, Evt, ItemType>
  >
  makeWith<Out, R = never, E = never, R2 = never>(
    args: [Evt] extends [never] ? {
        makeInitial?: Effect<R, E, readonly T[]>
        config?: Omit<StoreConfig<PM>, "partitionValue"> & {
          partitionValue?: (a: PM) => string
        }
      }
      : {
        publishEvents: (evt: NonEmptyReadonlyArray<Evt>) => Effect<R2, never, void>
        makeInitial?: Effect<R, E, readonly T[]>
        config?: Omit<StoreConfig<PM>, "partitionValue"> & {
          partitionValue?: (a: PM) => string
        }
      },
    f: (r: Repository<T, PM, Evt, ItemType>) => Out
  ): Effect<
    StoreMaker | ContextMapContainer | R | R2,
    E,
    Out
  >
  readonly where: ReturnType<typeof makeWhere<PM>>
  readonly flatMap: <R1, E1, B>(f: (a: Service) => Effect<R1, E1, B>) => Effect<Service | R1, E1, B>
  readonly makeLayer: (svc: Service) => Layer<never, never, Service>
  readonly map: <B>(f: (a: Service) => B) => Effect<Service, never, B>
  readonly type: Repository<T, PM, Evt, ItemType>
}

export type GetRepoType<T> = T extends { type: infer R } ? R : never

export const RepositoryBaseImpl = <Service>() => {
  return <
    PM extends { id: string; _etag: string | undefined },
    Evt = never
  >() =>
  <ItemType extends string, T extends { id: string }, ConstructorInput, Api, E extends { id: string }>(
    itemType: ItemType,
    schema: Schema.Schema<unknown, T, ConstructorInput, E, Api>,
    mapFrom: (pm: Omit<PM, "_etag">) => E,
    mapTo: (e: E, etag: string | undefined) => PM
  ):
    & (abstract new() => RepositoryBaseC1<T, PM, Evt, ItemType>)
    & Tag<Service, Service>
    & Repos<
      Service,
      T,
      PM,
      Evt,
      ItemType
    > =>
  {
    const mkRepo = makeRepo<PM, Evt>()(itemType, schema, mapFrom, mapTo)
    abstract class Cls extends RepositoryBaseC1<T, PM, Evt, ItemType> {
      constructor() {
        super(itemType)
      }
      static readonly make = mkRepo.make
      static readonly makeWith = ((a: any, b: any) => mkRepo.make(a).map(b)) as any

      static readonly where = makeWhere<PM>()
      static flatMap<R1, E1, B>(f: (a: Service) => Effect<R1, E1, B>): Effect<Service | R1, E1, B> {
        return Effect.flatMap(this as unknown as Tag<Service, Service>, f)
      }
      static map<B>(f: (a: Service) => B): Effect<Service, never, B> {
        return Effect.map(this as unknown as Tag<Service, Service>, f)
      }
      static makeLayer(svc: Service) {
        return Layer.succeed(this as unknown as Tag<Service, Service>, svc)
      }
      static readonly type: Repository<T, PM, Evt, ItemType> = undefined as any
    }
    return assignTag<Service>()(Cls)
  }
}

export const RepositoryDefaultImpl = <Service>() => {
  return <
    PM extends { id: string; _etag: string | undefined },
    Evt = never
  >() =>
  <ItemType extends string, T extends { id: string }, ConstructorInput, Api, E extends { id: string }>(
    itemType: ItemType,
    schema: Schema.Schema<unknown, T, ConstructorInput, E, Api>,
    mapFrom: (pm: Omit<PM, "_etag">) => E,
    mapTo: (e: E, etag: string | undefined) => PM
  ):
    & (abstract new(
      impl: Repository<T, PM, Evt, ItemType>
    ) => RepositoryBaseC2<T, PM, Evt, ItemType>)
    & Tag<Service, Service>
    & Repos<
      Service,
      T,
      PM,
      Evt,
      ItemType
    > =>
  {
    const mkRepo = makeRepo<PM, Evt>()(itemType, schema, mapFrom, mapTo)
    abstract class Cls extends RepositoryBaseC2<T, PM, Evt, ItemType> {
      constructor(
        impl: Repository<T, PM, Evt, ItemType>
      ) {
        super(itemType, impl)
      }
      static readonly make = mkRepo.make
      static readonly makeWith = ((a: any, b: any) => mkRepo.make(a).map(b)) as any

      static readonly where = makeWhere<PM>()
      static flatMap<R1, E1, B>(f: (a: Service) => Effect<R1, E1, B>): Effect<Service | R1, E1, B> {
        return Effect.flatMap(this as unknown as Tag<Service, Service>, f)
      }
      static map<B>(f: (a: Service) => B): Effect<Service, never, B> {
        return Effect.map(this as unknown as Tag<Service, Service>, f)
      }
      static makeLayer(svc: Service) {
        return Layer.succeed(this as unknown as Tag<Service, Service>, svc)
      }

      static readonly type: Repository<T, PM, Evt, ItemType> = undefined as any
    }
    return assignTag<Service>()(Cls) as any // impl is missing, but its marked protected
  }
}

// @useClassFeaturesForSchema
// export class Shop extends Class<Shop>()({ id: string }) {}

// /**
//  * @tsplus type ShopRepo
//  * @tsplus companion ShopRepo.Ops
//  */
// export class ShopRepo extends RepositoryDefaultImpl<ShopRepo>()<Shop & { _etag: string | undefined }>()(
//   "Shop",
//   Shop,
//   (pm) => pm,
//   (e, _etag) => ({ ...e, _etag })
// ) {
//   override saveAndPublish = (items: Iterable<Shop>, events?: Iterable<unknown> | undefined) => {
//     return this.impl.saveAndPublish(items, events)
//   }
// }

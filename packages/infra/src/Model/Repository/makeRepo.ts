/* eslint-disable @typescript-eslint/no-empty-object-type */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-explicit-any */

// import type { ParserEnv } from "effect-app/Schema/custom/Parser"
import type {} from "effect/Equal"
import type {} from "effect/Hash"
import { type Context, Effect, type NonEmptyReadonlyArray, type S } from "effect-app"
import type { StoreConfig, StoreMaker } from "../../Store.js"
import type { FieldValues } from "../filter/types.js"
import { type ExtendedRepository, extendRepo } from "./ext.js"
import { makeRepoInternal } from "./internal/internal.js"
import type { Repository } from "./service.js"

export interface RepositoryOptions<
  IdKey extends keyof T & keyof Encoded,
  Encoded extends FieldValues,
  T,
  ItemType extends string,
  Evt = never,
  RPublish = never,
  E = never,
  RInitial = never,
  RCtx = never,
  RSchema = never
> {
  /**
   * Specify the idKey of the Type side, if it's different from the default "id".
   * Does not change the Encoded side, which is always "id" to support database drivers.
   * At this time as queries are operating on the Encoded side, the queries must still specify "id" regardless.
   */
  idKey: IdKey
  /**
   * just in time Migration: for complex migrations that aren't just default simple values
   * use the config.defaultValues instead for simple default values
   */
  jitM?: (pm: Encoded) => Encoded
  config?: Omit<StoreConfig<Encoded>, "partitionValue"> & {
    partitionValue?: (a: Encoded) => string
  }
  /**
   * Optional handler to be able to publish events after successfull save.
   */
  publishEvents?: (evt: NonEmptyReadonlyArray<Evt>) => Effect.Effect<void, never, RPublish>
  /**
   * Optional creator for initial data in the table when it's created for the first itme.
   */
  makeInitial?: Effect.Effect<readonly T[], E, RInitial> | undefined
  /**
   * Optional context to be provided to Schema decode/encode.
   * Useful for effectful transformations like XWithItems, where items is a transformation retrieving elements from another database table or other source.
   */
  schemaContext?: Context.Context<RCtx>

  overrides?: (
    repo: Repository<T, Encoded, Evt, ItemType, IdKey, Exclude<RSchema, RCtx>, RPublish>
  ) => Repository<T, Encoded, Evt, ItemType, IdKey, Exclude<RSchema, RCtx>, RPublish>
}

/**
 * Create a repository instance.
 * @param itemType an identifier used for the table name and e.g NotFoundError
 * @param schema the Schema used for this Repository
 * @param options @see RepositoryOptions
 * @returns a Repository
 */
export const makeRepo: {
  <
    ItemType extends string,
    RSchema,
    Encoded extends FieldValues,
    T,
    IdKey extends keyof T & keyof Encoded,
    E = never,
    Evt = never,
    RInitial = never,
    RPublish = never,
    RCtx = never
  >(
    itemType: ItemType,
    schema: S.Schema<T, Encoded, RSchema>,
    options: RepositoryOptions<IdKey, Encoded, T, ItemType, Evt, RPublish, E, RInitial, RCtx, RSchema>
  ): Effect.Effect<
    ExtendedRepository<T, Encoded, Evt, ItemType, IdKey, Exclude<RSchema, RCtx>, RPublish>,
    E,
    RInitial | StoreMaker
  >
  <
    ItemType extends string,
    RSchema,
    Encoded extends FieldValues,
    T extends { id: unknown },
    E = never,
    Evt = never,
    RInitial = never,
    RPublish = never,
    RCtx = never
  >(
    itemType: ItemType,
    schema: S.Schema<T, Encoded, RSchema>,
    options: Omit<RepositoryOptions<"id", Encoded, T, ItemType, Evt, RPublish, E, RInitial, RCtx, RSchema>, "idKey">
  ): Effect.Effect<
    ExtendedRepository<T, Encoded, Evt, ItemType, "id", Exclude<RSchema, RCtx>, RPublish>,
    E,
    RInitial | StoreMaker
  >
} = <
  ItemType extends string,
  RSchema,
  Encoded extends FieldValues,
  T,
  IdKey extends keyof T & keyof Encoded,
  E = never,
  RInitial = never,
  RPublish = never,
  Evt = never,
  RCtx = never
>(
  itemType: ItemType,
  schema: S.Schema<T, Encoded, RSchema>,
  options: Omit<RepositoryOptions<IdKey, Encoded, T, ItemType, Evt, RPublish, E, RInitial, RCtx, RSchema>, "idKey"> & {
    idKey?: IdKey
  }
) =>
  Effect.gen(function*() {
    const mkRepo = makeRepoInternal<Evt>()(
      itemType,
      schema,
      options?.jitM ? (pm) => options.jitM!(pm) : (pm) => pm,
      (e, _etag) => ({ ...e, _etag }),
      options.idKey ?? "id" as any
    )
    let r = yield* mkRepo.make<RInitial, E, RPublish, RCtx>(options as any)
    if (options.overrides) r = options.overrides(r)
    const repo = extendRepo(r)
    return repo
  })

/* eslint-disable @typescript-eslint/no-explicit-any */
import type { UniqueKey } from "@azure/cosmos"
import { Context, Effect, type NonEmptyReadonlyArray, type Option, type Redacted } from "effect-app"
import type { OptimisticConcurrencyException } from "../errors.js"
import type { FilterResult } from "../Model/filter/filterApi.js"
import type { FieldValues } from "../Model/filter/types.js"
import type { FieldPath } from "../Model/filter/types/path/index.js"
import { type RawQuery } from "../Model/query.js"

export interface StoreConfig<E> {
  partitionValue: (e: E) => string | undefined
  /**
   * Primarily used for testing, creating namespaces in the database to separate data e.g to run multiple tests in isolation within the same database
   * currently only supported in disk/memory. CosmosDB is TODO.
   */
  allowNamespace?: (namespace: string) => boolean
  /**
   * just in time migrations, supported by the database driver, supporting queries, for simple default values
   */
  defaultValues?: Partial<E>

  /**
   * How many items can be processed in one batch at a time.
   * Defaults to 100 for CosmosDB.
   */
  maxBulkSize?: number

  /**
   * Unique indexes, mainly for CosmosDB
   */
  uniqueKeys?: UniqueKey[]
}

export type SupportedValues = string | boolean | number | null
export type SupportedValues2 = string | boolean | number

// default is eq
export type Where =
  | { key: string; t?: "eq" | "not-eq"; value: SupportedValues }
  | { key: string; t: "gt" | "lt" | "gte" | "lte"; value: SupportedValues2 }
  | {
    key: string
    t: "contains" | "starts-with" | "ends-with" | "not-contains" | "not-starts-with" | "not-ends-with"
    value: string
  }
  | { key: string; t: "includes" | "not-includes"; value: string }
  | {
    key: string
    t: "in" | "not-in"
    value: readonly (SupportedValues)[]
  }

export type Filter = readonly FilterResult[]

export interface O<TFieldValues extends FieldValues> {
  key: FieldPath<TFieldValues>
  direction: "ASC" | "DESC"
}

export interface FilterArgs<Encoded extends FieldValues, U extends keyof Encoded = never> {
  t: Encoded
  filter?: Filter | undefined
  select?: NonEmptyReadonlyArray<U | { key: string; subKeys: readonly string[] }> | undefined
  order?: NonEmptyReadonlyArray<O<NoInfer<Encoded>>>
  limit?: number | undefined
  skip?: number | undefined
}

export type FilterFunc<Encoded extends FieldValues> = <U extends keyof Encoded = never>(
  args: FilterArgs<Encoded, U>
) => Effect<(U extends undefined ? Encoded : Pick<Encoded, U>)[]>

export interface Store<
  IdKey extends keyof Encoded,
  Encoded extends FieldValues,
  PM extends PersistenceModelType<Encoded> = PersistenceModelType<Encoded>
> {
  all: Effect<PM[]>
  filter: FilterFunc<Encoded>
  find: (id: Encoded[IdKey]) => Effect<Option<PM>>
  set: (e: PM) => Effect<PM, OptimisticConcurrencyException>
  batchSet: (
    items: NonEmptyReadonlyArray<PM>
  ) => Effect<NonEmptyReadonlyArray<PM>, OptimisticConcurrencyException>
  bulkSet: (
    items: NonEmptyReadonlyArray<PM>
  ) => Effect<NonEmptyReadonlyArray<PM>, OptimisticConcurrencyException>
  /**
   * Requires the Encoded type, not Id, because various stores may need to calculate e.g partition keys.
   */
  remove: (e: Encoded) => Effect<void>

  queryRaw: <Out>(query: RawQuery<Encoded, Out>) => Effect<readonly Out[]>
}

export class StoreMaker extends Context.TagId("effect-app/StoreMaker")<StoreMaker, {
  make: <IdKey extends keyof Encoded, Encoded extends FieldValues, R = never, E = never>(
    name: string,
    idKey: IdKey,
    seed?: Effect<Iterable<Encoded>, E, R>,
    config?: StoreConfig<Encoded>
  ) => Effect<Store<IdKey, Encoded>, E, R>
}>() {
}

export const makeContextMap = () => {
  const etags = new Map<string, string>()
  const getEtag = (id: string) => etags.get(id)
  const setEtag = (id: string, eTag: string | undefined) => {
    if (eTag === undefined) {
      etags.delete(id)
    } else {
      etags.set(id, eTag)
    }
  }

  // const parsedCache = new Map<
  //   Parser<any, any, any>,
  //   Map<unknown, These.These<unknown, unknown>>
  // >()

  // const parserCache = new Map<
  //   Parser<any, any, any>,
  //   (i: any) => These.These<any, any>
  // >()

  // const setAndReturn = <I, E, A>(
  //   p: Parser<I, E, A>,
  //   np: (i: I) => These.These<E, A>
  // ) => {
  //   parserCache.set(p, np)
  //   return np
  // }

  // const parserEnv: ParserEnv = {
  //   // TODO: lax: true would turn off refinement checks, may help on large payloads
  //   // but of course removes confirming of validation rules (which may be okay for a database owned by the app, as we write safely)
  //   lax: false,
  //   cache: {
  //     getOrSetParser: (p) => parserCache.get(p) ?? setAndReturn(p, (i) => parserEnv.cache!.getOrSet(i, p)),
  //     getOrSetParsers: (parsers) => {
  //       return Object.entries(parsers).reduce((prev, [k, v]) => {
  //         prev[k] = parserEnv.cache!.getOrSetParser(v)
  //         return prev
  //       }, {} as any)
  //     },
  //     getOrSet: (i, parse): any => {
  //       const c = parsedCache.get(parse)
  //       if (c) {
  //         const f = c.get(i)
  //         if (f) {
  //           // console.log("$$$ cache hit", i)
  //           return f
  //         } else {
  //           const nf = parse(i, parserEnv)
  //           c.set(i, nf)
  //           return nf
  //         }
  //       } else {
  //         const nf = parse(i, parserEnv)
  //         parsedCache.set(parse, new Map([[i, nf]]))
  //         return nf
  //       }
  //     }
  //   }
  // }

  return {
    get: getEtag,
    set: setEtag
    // parserEnv
  }
}

const makeMap = Effect.sync(() => makeContextMap())

export class ContextMap extends Context.TagMakeId("effect-app/ContextMap", makeMap)<ContextMap>() {
}

export type PersistenceModelType<Encoded extends object> = Encoded & {
  _etag?: string | undefined
}

export interface StorageConfig {
  url: Redacted.Redacted<string>
  prefix: string
  dbName: string
}

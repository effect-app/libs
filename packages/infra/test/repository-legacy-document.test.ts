/* eslint-disable @typescript-eslint/no-explicit-any */

import * as Effect from "effect-app/Effect"
import * as Layer from "effect-app/Layer"
import { makeRepo } from "effect-app/Model/Repository"
import { RepositoryRegistryLive } from "effect-app/Model/Repository/Registry"
import * as Option from "effect-app/Option"
import * as S from "effect-app/Schema"
import { setupRequestContextFromCurrent } from "effect-app/setupRequest"
import type { JsonRecord } from "effect-app/Store"
import { StoreMaker } from "effect-app/Store"
import { describe, expect, it } from "vitest"
import { makeJsonDocumentCodec, makeStoredDecode } from "../src/Store/jsonDocument.js"
import { makeMemoryStoreInt } from "../src/Store/Memory.js"
import { makeJsonLower } from "../src/Store/utils.js"

/**
 * A Memory store seeded with *raw stored documents* instead of items encoded
 * through the schema, so that a legacy-shaped document can reach the read path -
 * exactly what Cosmos (`fromStored`) and SQL (`parseRow`) do in production.
 *
 * `MemoryStoreLive` cannot be used for this: it strictly `encode`s whatever it
 * is seeded with, so a legacy document never makes it into the store. The inner
 * store here is therefore schemaless (it may not validate what we seed), and
 * the real store read boundary - `defaultValues` merged, then `jitM`, then the
 * JSON→Encoded decode - is applied on top via {@link makeStoredDecode}.
 */
const LegacyDocStoreLive = (docs: readonly Record<string, unknown>[]) =>
  StoreMaker.toLayer(Effect.sync(() => ({
    make: ((modelName: string, idKey: any, _seed: any, config: any) =>
      Effect.map(
        makeMemoryStoreInt(
          modelName,
          idKey,
          "primary",
          Effect.succeed(docs as any),
          config?.defaultValues,
          undefined,
          makeJsonLower(config)
        ),
        (store) => {
          const decode = makeStoredDecode<any>(makeJsonDocumentCodec<any>(config?.schema), config?.jitM)
          return {
            ...store,
            all: Effect.map(store.all, (rows) => rows.map(decode)),
            find: (id: any) => Effect.map(store.find(id), Option.map(decode)),
            filter: (f: any) => Effect.map(store.filter(f), (rows: any[]) => f.select ? rows : rows.map(decode))
          }
        }
      )) as any
  })))

class Shop extends S.Class<Shop>("LegacyDocShop")({
  id: S.String,
  name: S.NonEmptyString255,
  createdAt: S.Date,
  updatedAt: S.Date,
  vatRate: S.Number,
  tags: S.ReadonlySet(S.String),
  meta: S.ReadonlyMap({ key: S.String, value: S.String })
}) {}

// `vatRate` was added later; stored documents from before that do not have it.
const jitM = (json: JsonRecord): JsonRecord => "vatRate" in json ? json : { ...json, vatRate: 19 }

const legacyDoc = {
  id: "shop-legacy",
  name: "Legacy Shop",
  createdAt: "2024-06-01T00:00:00.000Z",
  updatedAt: "2024-06-03T00:00:00.000Z",
  tags: ["a"],
  meta: [["k", "v"]]
}

const currentDoc = {
  id: "shop-current",
  name: "Current Shop",
  createdAt: "2024-06-02T00:00:00.000Z",
  updatedAt: "2024-06-04T00:00:00.000Z",
  vatRate: 7,
  tags: ["b"],
  meta: [["k2", "v2"]]
}

/** a legacy document that stored an explicit `null` where a Date is expected */
const nullDoc = { ...legacyDoc, id: "shop-null", vatRate: 21, updatedAt: null }

/** `vatRate` present but falsy, `updatedAt` an explicit null */
const zeroDoc = { ...legacyDoc, id: "shop-zero", vatRate: 0, updatedAt: null }

const TestLive = Layer.merge(LegacyDocStoreLive([legacyDoc, currentDoc]), RepositoryRegistryLive)
const NullDocLive = Layer.merge(LegacyDocStoreLive([nullDoc]), RepositoryRegistryLive)
const CurrentDocLive = Layer.merge(LegacyDocStoreLive([currentDoc]), RepositoryRegistryLive)
const DefaultsLive = Layer.merge(LegacyDocStoreLive([legacyDoc, zeroDoc]), RepositoryRegistryLive)

describe("repository reads of legacy documents", () => {
  it("all: jitM fills the key the stored document is missing", () =>
    Effect
      .gen(function*() {
        const repo = yield* makeRepo("LegacyDocShop", Shop, { jitM })

        const items = yield* repo.all

        expect(items).toHaveLength(2)
        const legacy = items.find((_) => _.id === "shop-legacy")!
        expect(legacy).toBeInstanceOf(Shop)
        expect(legacy.vatRate).toBe(19)
        expect(legacy.createdAt).toBeInstanceOf(Date)
        expect(legacy.tags).toBeInstanceOf(Set)
        expect([...legacy.tags]).toEqual(["a"])
        expect(items.find((_) => _.id === "shop-current")!.vatRate).toBe(7)
      })
      .pipe(
        Effect.provide(TestLive),
        setupRequestContextFromCurrent(),
        Effect.scoped,
        Effect.runPromise
      ))

  it("find: a legacy document decodes through jitM", () =>
    Effect
      .gen(function*() {
        const repo = yield* makeRepo("LegacyDocShop", Shop, { jitM })

        const found = yield* repo.find("shop-legacy")

        expect(Option.isSome(found)).toBe(true)
        const shop = Option.getOrThrow(found)
        expect(shop.vatRate).toBe(19)
        expect(shop.name).toBe("Legacy Shop")
        expect(shop.createdAt).toBeInstanceOf(Date)
      })
      .pipe(
        Effect.provide(TestLive),
        setupRequestContextFromCurrent(),
        Effect.scoped,
        Effect.runPromise
      ))

  it("validateSample: legacy documents validate because jitM runs at the store boundary", () =>
    Effect
      .gen(function*() {
        const repo = yield* makeRepo("LegacyDocShop", Shop, { jitM })

        const result = yield* repo.validateSample({ percentage: 1.0 })

        expect(result.total).toBe(2)
        expect(result.sampled).toBe(2)
        expect(result.errors).toHaveLength(0)
        expect(result.valid).toBe(2)
      })
      .pipe(
        Effect.provide(TestLive),
        setupRequestContextFromCurrent(),
        Effect.scoped,
        Effect.runPromise
      ))

  it("jitM repairs an explicit null, and the document decodes end-to-end", () =>
    Effect
      .gen(function*() {
        // the case the store boundary exists for: `null` is not a valid
        // `S.Date` encoding, so no schema decode could ever fix it
        const repairNull = (json: JsonRecord): JsonRecord =>
          json["updatedAt"] === null ? { ...json, updatedAt: "2024-06-05T00:00:00.000Z" } : json

        const repo = yield* makeRepo("LegacyDocShop", Shop, { jitM: repairNull })

        const shop = Option.getOrThrow(yield* repo.find("shop-null"))
        expect(shop.updatedAt).toBeInstanceOf(Date)
        expect(shop.updatedAt.toISOString()).toBe("2024-06-05T00:00:00.000Z")

        const all = yield* repo.all
        expect(all).toHaveLength(1)
        expect(all[0]!.updatedAt.toISOString()).toBe("2024-06-05T00:00:00.000Z")
      })
      .pipe(
        Effect.provide(NullDocLive),
        setupRequestContextFromCurrent(),
        Effect.scoped,
        Effect.runPromise
      ))

  it("jitM receives the raw JSON document, and its JSON result is what the decode consumes", () =>
    Effect
      .gen(function*() {
        const seen: JsonRecord[] = []
        const observe = (json: JsonRecord): JsonRecord => {
          seen.push(json)
          // returning JSON - an ISO string, not a `Date` - is what decodes
          return { ...json, updatedAt: "2024-06-09T00:00:00.000Z" }
        }

        const repo = yield* makeRepo("LegacyDocShop", Shop, { jitM: observe })

        const shop = Option.getOrThrow(yield* repo.find("shop-current"))

        expect(seen).toHaveLength(1)
        const raw = seen[0]!
        // a `Date` field arrives as an ISO string
        expect(typeof raw["createdAt"]).toBe("string")
        expect(raw["createdAt"]).toBe("2024-06-02T00:00:00.000Z")
        // a `ReadonlySet` as an array, a `ReadonlyMap` as an array of pairs
        expect(raw["tags"]).toEqual(["b"])
        expect(raw["meta"]).toEqual([["k2", "v2"]])
        // never native Encoded values
        expect(raw["createdAt"]).not.toBeInstanceOf(Date)
        expect(raw["meta"]).not.toBeInstanceOf(Map)
        // `_etag` is infra metadata and is not part of the document
        expect("_etag" in raw).toBe(false)

        // the JSON the jitM returned was decoded to the native Encoded value
        expect(shop.updatedAt).toBeInstanceOf(Date)
        expect(shop.updatedAt.toISOString()).toBe("2024-06-09T00:00:00.000Z")
        expect(shop.meta).toBeInstanceOf(Map)
        expect([...shop.meta]).toEqual([["k2", "v2"]])
      })
      .pipe(
        Effect.provide(CurrentDocLive),
        setupRequestContextFromCurrent(),
        Effect.scoped,
        Effect.runPromise
      ))

  it("defaultValues only fill absent keys, and a stored null still reaches jitM", () =>
    Effect
      .gen(function*() {
        const seen: JsonRecord[] = []
        const repo = yield* makeRepo("LegacyDocShop", Shop, {
          jitM: (json) => {
            seen.push(json)
            return json["updatedAt"] === null ? { ...json, updatedAt: "2024-06-08T00:00:00.000Z" } : json
          },
          config: {
            defaultValues: {
              vatRate: 19,
              updatedAt: new Date("2024-01-01T00:00:00.000Z")
            }
          }
        })

        const items = yield* repo.all
        expect(items).toHaveLength(2)

        // absent key -> filled by defaultValues
        const missing = items.find((_) => _.id === "shop-legacy")!
        expect(missing.vatRate).toBe(19)
        // present key -> the stored value wins, even when falsy
        const present = items.find((_) => _.id === "shop-zero")!
        expect(present.vatRate).toBe(0)

        // defaultValues are merged *before* jitM runs
        const filledSeen = seen.find((_) => _["id"] === "shop-legacy")!
        expect(filledSeen["vatRate"]).toBe(19)
        // ...but never overwrite a key the document has
        expect(filledSeen["updatedAt"]).toBe("2024-06-03T00:00:00.000Z")

        // a stored explicit `null` is NOT replaced by the default: it reaches jitM
        const nullSeen = seen.find((_) => _["id"] === "shop-zero")!
        expect(nullSeen["updatedAt"]).toBe(null)
        expect(present.updatedAt.toISOString()).toBe("2024-06-08T00:00:00.000Z")
      })
      .pipe(
        Effect.provide(DefaultsLive),
        setupRequestContextFromCurrent(),
        Effect.scoped,
        Effect.runPromise
      ))
})

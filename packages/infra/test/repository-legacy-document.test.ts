/* eslint-disable @typescript-eslint/no-explicit-any */

import * as Effect from "effect-app/Effect"
import * as Layer from "effect-app/Layer"
import { makeRepo } from "effect-app/Model/Repository"
import { RepositoryRegistryLive } from "effect-app/Model/Repository/Registry"
import * as Option from "effect-app/Option"
import * as S from "effect-app/Schema"
import { setupRequestContextFromCurrent } from "effect-app/setupRequest"
import { StoreMaker } from "effect-app/Store"
import { describe, expect, it } from "vitest"
import { makeJsonDocumentCodec } from "../src/Store/jsonDocument.js"
import { makeMemoryStoreInt } from "../src/Store/Memory.js"
import { makeJsonLower } from "../src/Store/utils.js"

/**
 * A Memory store seeded with *raw stored documents* instead of items encoded
 * through the schema, so that a legacy-shaped document can reach the read path -
 * exactly what Cosmos (`fromStored`) and SQL (`parseRow`) do in production.
 *
 * The inner store is schemaless (it may not validate what we seed); the JSON
 * document codec of the repository's schema is applied on read, as the real
 * adapters do.
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
          const decode = makeJsonDocumentCodec<any>(config?.schema).decode
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
  vatRate: S.Number,
  tags: S.ReadonlySet(S.String)
}) {}

// `vatRate` was added later; stored documents from before that do not have it.
const jitM = (pm: typeof Shop.Encoded) => {
  const raw = pm as Record<string, unknown>
  return ("vatRate" in raw ? raw : { ...raw, vatRate: 19 }) as typeof Shop.Encoded
}

const legacyDoc = {
  id: "shop-legacy",
  name: "Legacy Shop",
  createdAt: "2024-06-01T00:00:00.000Z",
  tags: ["a"]
}

const currentDoc = {
  id: "shop-current",
  name: "Current Shop",
  createdAt: "2024-06-02T00:00:00.000Z",
  vatRate: 7,
  tags: ["b"]
}

const TestLive = Layer.merge(LegacyDocStoreLive([legacyDoc, currentDoc]), RepositoryRegistryLive)

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

  it("validateSample: legacy documents validate because jitM runs after the store boundary", () =>
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
})

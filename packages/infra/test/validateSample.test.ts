import * as Effect from "effect-app/Effect"
import * as Layer from "effect-app/Layer"
import { makeRepo, ValidationError, ValidationResult } from "effect-app/Model/Repository"
import { RepositoryRegistryLive } from "effect-app/Model/Repository/Registry"
import * as S from "effect-app/Schema"
import { setupRequestContextFromCurrent } from "effect-app/setupRequest"
import type { JsonRecord } from "effect-app/Store"
import { describe, expect, it } from "vitest"
import { MemoryStoreLive } from "../src/Store/Memory.js"

const TestStoreLive = Layer.merge(MemoryStoreLive, RepositoryRegistryLive)

// simple schema for valid items
class SimpleItem extends S.Class<SimpleItem>("SimpleItem")({
  id: S.String,
  name: S.NonEmptyString255,
  count: S.NonNegativeInt
}) {}

/**
 * `count` is stored as a *string*, so its Encoded shape accepts anything the
 * JSON document happens to hold while the domain decode still demands a finite
 * number.
 *
 * That split is what `validateSample` exists for, and it is the only way to
 * observe a repository-level validation error now that `jitM` runs at the store
 * boundary: the store's `toCodecJson(toEncoded(schema))` decode is strict, so a
 * `jitM` that produced a value the *Encoded* shape rejects would fail loudly in
 * the store instead of ever reaching the repository.
 */
class LooseCountItem extends S.Class<LooseCountItem>("LooseCountItem")({
  id: S.String,
  name: S.NonEmptyString255,
  count: S.FiniteFromString
}) {}

/** build a `LooseCountItem` from its encoded (stored) form */
const looseItem = (id: string, name: string, count: string) => S.decodeSync(LooseCountItem)({ id, name, count })

describe("validateSample", () => {
  it("returns success when all items pass validation", () =>
    Effect
      .gen(function*() {
        const repo = yield* makeRepo("SimpleItem", SimpleItem, {
          makeInitial: Effect.succeed([
            new SimpleItem({ id: "1", name: S.NonEmptyString255("Alice"), count: S.NonNegativeInt(10) }),
            new SimpleItem({ id: "2", name: S.NonEmptyString255("Bob"), count: S.NonNegativeInt(20) }),
            new SimpleItem({ id: "3", name: S.NonEmptyString255("Charlie"), count: S.NonNegativeInt(30) })
          ])
        })

        const result = yield* repo.validateSample({ percentage: 1.0 }) // 100%

        expect(S.is(ValidationResult)(result)).toBe(true)
        expect(result.total).toBe(3)
        expect(result.sampled).toBe(3)
        expect(result.valid).toBe(3)
        expect(result.errors).toHaveLength(0)
      })
      .pipe(
        Effect.provide(TestStoreLive),
        setupRequestContextFromCurrent(),
        Effect.scoped,
        Effect.runPromise
      ))

  it("returns errors when jitM produces data the domain schema rejects", () =>
    Effect
      .gen(function*() {
        // jitM that corrupts two specific items' count into a non-numeric string
        const corruptingJitM = (json: JsonRecord): JsonRecord => {
          if (json["id"] === "2" || json["id"] === "3") {
            return { ...json, count: "not-a-number" } // still a string, so the store decode is happy
          }
          return json
        }

        const repo = yield* makeRepo("CorruptItem", LooseCountItem, {
          jitM: corruptingJitM,
          makeInitial: Effect.succeed([
            looseItem("1", "Valid", "10"),
            looseItem("2", "WillBeInvalid1", "20"),
            looseItem("3", "WillBeInvalid2", "30")
          ])
        })

        const result = yield* repo.validateSample({ percentage: 1.0 }) // 100%

        expect(S.is(ValidationResult)(result)).toBe(true)
        expect(result.total).toBe(3)
        expect(result.sampled).toBe(3)
        expect(result.valid).toBe(1)
        expect(result.errors).toHaveLength(2)

        // verify error structure
        for (const error of result.errors) {
          expect(S.is(ValidationError)(error)).toBe(true)
          expect(error.id).toBeDefined()
          expect(error.rawData).toBeDefined()
          expect(error.jitMResult).toBeDefined()
          expect(error.error).toBeDefined()
        }

        // verify the failing ids are the corrupted ones
        const failingIds = result.errors.map((e) => e.id)
        expect(failingIds).toContain("2")
        expect(failingIds).toContain("3")
      })
      .pipe(
        Effect.provide(TestStoreLive),
        setupRequestContextFromCurrent(),
        Effect.scoped,
        Effect.runPromise
      ))

  it("returns empty result for empty repository", () =>
    Effect
      .gen(function*() {
        const repo = yield* makeRepo("EmptyItem", SimpleItem, {})

        const result = yield* repo.validateSample({ percentage: 1.0 })

        expect(result.total).toBe(0)
        expect(result.sampled).toBe(0)
        expect(result.valid).toBe(0)
        expect(result.errors).toHaveLength(0)
      })
      .pipe(
        Effect.provide(TestStoreLive),
        setupRequestContextFromCurrent(),
        Effect.scoped,
        Effect.runPromise
      ))

  it("respects maxItems option", () =>
    Effect
      .gen(function*() {
        const repo = yield* makeRepo("MaxItemsTest", SimpleItem, {
          makeInitial: Effect.succeed([
            new SimpleItem({ id: "1", name: S.NonEmptyString255("A"), count: S.NonNegativeInt(1) }),
            new SimpleItem({ id: "2", name: S.NonEmptyString255("B"), count: S.NonNegativeInt(2) }),
            new SimpleItem({ id: "3", name: S.NonEmptyString255("C"), count: S.NonNegativeInt(3) }),
            new SimpleItem({ id: "4", name: S.NonEmptyString255("D"), count: S.NonNegativeInt(4) }),
            new SimpleItem({ id: "5", name: S.NonEmptyString255("E"), count: S.NonNegativeInt(5) })
          ])
        })

        const result = yield* repo.validateSample({
          percentage: 1.0, // 100%
          maxItems: 2 // but cap at 2
        })

        expect(result.total).toBe(5)
        expect(result.sampled).toBe(2)
        expect(result.valid).toBe(2)
        expect(result.errors).toHaveLength(0)
      })
      .pipe(
        Effect.provide(TestStoreLive),
        setupRequestContextFromCurrent(),
        Effect.scoped,
        Effect.runPromise
      ))

  it("validates with jitM transformation that adds defaults", () =>
    Effect
      .gen(function*() {
        // schema that expects a 'status' field
        class ItemWithStatus extends S.Class<ItemWithStatus>("ItemWithStatus")({
          id: S.String,
          status: S.Literals(["active", "inactive"])
        }) {}

        // jitM that adds default status for items
        const repo = yield* makeRepo("ItemWithStatus", ItemWithStatus, {
          jitM: (json) => ({
            ...json,
            status: json["status"] ?? "active" // default to active if missing
          }),
          makeInitial: Effect.succeed([
            new ItemWithStatus({ id: "1", status: "active" }),
            new ItemWithStatus({ id: "2", status: "inactive" })
          ])
        })

        const result = yield* repo.validateSample({ percentage: 1.0 })

        expect(result.total).toBe(2)
        expect(result.sampled).toBe(2)
        expect(result.valid).toBe(2)
        expect(result.errors).toHaveLength(0)
      })
      .pipe(
        Effect.provide(TestStoreLive),
        setupRequestContextFromCurrent(),
        Effect.scoped,
        Effect.runPromise
      ))

  it("captures full context in validation errors", () =>
    Effect
      .gen(function*() {
        // jitM that corrupts the data
        const corruptingJitM = (json: JsonRecord): JsonRecord => ({
          ...json,
          count: "not-a-number" // always corrupt count
        })

        const repo = yield* makeRepo("ContextErrorTest", LooseCountItem, {
          jitM: corruptingJitM,
          makeInitial: Effect.succeed([looseItem("bad-item", "Test", "100")])
        })

        const result = yield* repo.validateSample({ percentage: 1.0 })

        expect(result.errors).toHaveLength(1)

        const error = result.errors[0]!
        expect(error.id).toBe("bad-item")

        // rawData is what the store returned: jitM already ran at the store
        // boundary, so the corrupted count is what the repository decoded
        expect(error.rawData).toMatchObject({
          id: "bad-item",
          name: "Test",
          count: "not-a-number"
        })

        // jitMResult is kept for compatibility and is identical to rawData
        expect(error.jitMResult).toEqual(error.rawData)

        // error should be a SchemaError
        expect(error.error).toBeDefined()
        expect((error.error as { _tag?: string })._tag).toBe("SchemaError")
      })
      .pipe(
        Effect.provide(TestStoreLive),
        setupRequestContextFromCurrent(),
        Effect.scoped,
        Effect.runPromise
      ))

  it("handles single item validation", () =>
    Effect
      .gen(function*() {
        const repo = yield* makeRepo("SingleItem", SimpleItem, {
          makeInitial: Effect.succeed([
            new SimpleItem({ id: "only", name: S.NonEmptyString255("OnlyOne"), count: S.NonNegativeInt(42) })
          ])
        })

        const result = yield* repo.validateSample({ percentage: 1.0 })

        expect(result.total).toBe(1)
        expect(result.sampled).toBe(1)
        expect(result.valid).toBe(1)
        expect(result.errors).toHaveLength(0)
      })
      .pipe(
        Effect.provide(TestStoreLive),
        setupRequestContextFromCurrent(),
        Effect.scoped,
        Effect.runPromise
      ))
})

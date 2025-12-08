import { Effect, S } from "effect-app"
import { describe, expect, it } from "vitest"
import { setupRequestContextFromCurrent } from "../src/api/setupRequest.js"
import { makeRepo, ValidationError, ValidationResult } from "../src/Model/Repository.js"
import { MemoryStoreLive } from "../src/Store/Memory.js"

// simple schema for valid items
class SimpleItem extends S.Class<SimpleItem>("SimpleItem")({
  id: S.String,
  name: S.NonEmptyString255,
  count: S.NonNegativeInt
}) {}

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

        expect(result).toBeInstanceOf(ValidationResult)
        expect(result.total).toBe(3)
        expect(result.sampled).toBe(3)
        expect(result.valid).toBe(3)
        expect(result.errors).toHaveLength(0)
      })
      .pipe(
        Effect.provide(MemoryStoreLive),
        setupRequestContextFromCurrent(),
        Effect.runPromise
      ))

  it("returns errors when jitM produces invalid data", () =>
    Effect
      .gen(function*() {
        // jitM that corrupts one specific item's count to be negative
        const corruptingJitM = (pm: typeof SimpleItem.Encoded) => {
          if (pm.id === "2" || pm.id === "3") {
            return { ...pm, count: -999 } // make count negative (invalid for NonNegativeInt)
          }
          return pm
        }

        const repo = yield* makeRepo("CorruptItem", SimpleItem, {
          jitM: corruptingJitM,
          makeInitial: Effect.succeed([
            new SimpleItem({ id: "1", name: S.NonEmptyString255("Valid"), count: S.NonNegativeInt(10) }),
            new SimpleItem({ id: "2", name: S.NonEmptyString255("WillBeInvalid1"), count: S.NonNegativeInt(20) }),
            new SimpleItem({ id: "3", name: S.NonEmptyString255("WillBeInvalid2"), count: S.NonNegativeInt(30) })
          ])
        })

        const result = yield* repo.validateSample({ percentage: 1.0 }) // 100%

        expect(result).toBeInstanceOf(ValidationResult)
        expect(result.total).toBe(3)
        expect(result.sampled).toBe(3)
        expect(result.valid).toBe(1)
        expect(result.errors).toHaveLength(2)

        // verify error structure
        for (const error of result.errors) {
          expect(error).toBeInstanceOf(ValidationError)
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
        Effect.provide(MemoryStoreLive),
        setupRequestContextFromCurrent(),
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
        Effect.provide(MemoryStoreLive),
        setupRequestContextFromCurrent(),
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
        Effect.provide(MemoryStoreLive),
        setupRequestContextFromCurrent(),
        Effect.runPromise
      ))

  it("validates with jitM transformation that adds defaults", () =>
    Effect
      .gen(function*() {
        // schema that expects a 'status' field
        class ItemWithStatus extends S.Class<ItemWithStatus>("ItemWithStatus")({
          id: S.String,
          status: S.Literal("active", "inactive")
        }) {}

        // jitM that adds default status for items
        const repo = yield* makeRepo("ItemWithStatus", ItemWithStatus, {
          jitM: (pm) => ({
            ...pm,
            status: pm.status ?? "active" // default to active if missing
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
        Effect.provide(MemoryStoreLive),
        setupRequestContextFromCurrent(),
        Effect.runPromise
      ))

  it("captures full context in validation errors", () =>
    Effect
      .gen(function*() {
        // jitM that corrupts the data
        const corruptingJitM = (pm: typeof SimpleItem.Encoded) => ({
          ...pm,
          count: -999 // always corrupt count
        })

        const repo = yield* makeRepo("ContextErrorTest", SimpleItem, {
          jitM: corruptingJitM,
          makeInitial: Effect.succeed([
            new SimpleItem({ id: "bad-item", name: S.NonEmptyString255("Test"), count: S.NonNegativeInt(100) })
          ])
        })

        const result = yield* repo.validateSample({ percentage: 1.0 })

        expect(result.errors).toHaveLength(1)

        const error = result.errors[0]!
        expect(error.id).toBe("bad-item")

        // rawData should contain the original db data (with valid count)
        expect(error.rawData).toMatchObject({
          id: "bad-item",
          name: "Test",
          count: 100
        })

        // jitMResult should contain the corrupted data
        expect(error.jitMResult).toMatchObject({
          id: "bad-item",
          name: "Test",
          count: -999
        })

        // error should be a ParseError
        expect(error.error).toBeDefined()
        expect((error.error as any)._tag).toBe("ParseError")
      })
      .pipe(
        Effect.provide(MemoryStoreLive),
        setupRequestContextFromCurrent(),
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
        Effect.provide(MemoryStoreLive),
        setupRequestContextFromCurrent(),
        Effect.runPromise
      ))
})

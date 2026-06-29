import { describe, expect, it } from "@effect/vitest"
import * as DataDependencies from "effect-app/DataDependencies"
import * as Effect from "effect-app/Effect"
import * as Layer from "effect-app/Layer"
import { Q } from "effect-app/Model"
import { makeRepo } from "effect-app/Model/Repository"
import { RepositoryRegistryLive } from "effect-app/Model/Repository/Registry"
import * as S from "effect-app/Schema"
import { setupRequestContextFromCurrent } from "effect-app/setupRequest"
import * as Ref from "effect/Ref"
import { MemoryStoreLive } from "../src/Store/Memory.js"

class BatchItem extends S.Class<BatchItem>("BatchItem")({
  id: S.String,
  label: S.String
}) {}

const TestStoreLive = Layer.merge(MemoryStoreLive, RepositoryRegistryLive)

const A = S.TaggedStruct("A", { id: S.String })
const B = S.TaggedStruct("B", { id: S.String })
const C = S.TaggedStruct("C", { id: S.String })

const union = S.Union([A, B, C])

const a = S.Struct({ id: S.String })

const nestedSourceItem = S.TaggedStruct("source-item", {
  id: S.StringId,
  label: S.String
})
const nestedProjectedItem = S.TaggedStruct("source-item", {
  id: S.StringId
})
type NestedProjectedItem = typeof nestedProjectedItem.Type
const nestedSource = S.Struct({
  id: S.String,
  items: S.NonEmptyArray(nestedSourceItem),
  label: S.String
})
const nestedProjection = S.Struct({
  id: S.String,
  items: S.NonEmptyArray(nestedProjectedItem)
})

const nestedProjectedItemsOf = (
  items: readonly [NestedProjectedItem, ...NestedProjectedItem[]]
) => items

const nestedUnionSourceA = S.TaggedStruct("nested-a", {
  id: S.String,
  items: S.NonEmptyArray(nestedSourceItem),
  label: S.String
})
const nestedUnionSourceB = S.TaggedStruct("nested-b", {
  id: S.String,
  items: S.NonEmptyArray(nestedSourceItem),
  count: S.Number
})
const nestedUnionSource = S.Union([nestedUnionSourceA, nestedUnionSourceB])
const nestedUnionProjection = S.Union([
  nestedUnionSourceA.mapFields((fields) => ({
    id: fields.id,
    _tag: fields._tag,
    items: S.NonEmptyArray(nestedProjectedItem)
  })),
  nestedUnionSourceB.mapFields((fields) => ({
    id: fields.id,
    _tag: fields._tag,
    items: S.NonEmptyArray(nestedProjectedItem)
  }))
])

describe("repository ext save/remove batching", () => {
  it.effect("supports projecting full repository schema", () =>
    Effect
      .gen(function*() {
        const unionRepo = yield* makeRepo("UnionItem", union, {})
        const aRepo = yield* makeRepo("AItem", a, {})
        const ARepo = yield* makeRepo("TaggedAItem", A, {})

        expect(yield* unionRepo.query(Q.project(union))).toEqual([])
        expect(yield* aRepo.query(Q.project(a))).toEqual([])
        expect(yield* ARepo.query(Q.project(A))).toEqual([])
      })
      .pipe(
        setupRequestContextFromCurrent(),
        Effect.provide(TestStoreLive)
      ))

  it.effect("supports nested DTO subset projections", () =>
    Effect
      .gen(function*() {
        const repo = yield* makeRepo("NestedProjectionItem", nestedSource, {})
        const unionRepo = yield* makeRepo("NestedUnionProjectionItem", nestedUnionSource, {})
        const result = yield* repo.query(Q.project(nestedProjection, "project"))
        const unionResult = yield* unionRepo.query(Q.project(nestedUnionProjection, "project"))

        result.forEach((_) => nestedProjectedItemsOf(_.items))
        unionResult.forEach((_) => nestedProjectedItemsOf(_.items))
        expect(result).toEqual([])
        expect(unionResult).toEqual([])
      })
      .pipe(
        setupRequestContextFromCurrent(),
        Effect.provide(TestStoreLive)
      ))

  it.effect("supports save batching overload", () =>
    Effect
      .gen(function*() {
        const repo = yield* makeRepo("BatchItem", BatchItem, {})
        const items = [
          new BatchItem({ id: "1", label: "one" }),
          new BatchItem({ id: "2", label: "two" }),
          new BatchItem({ id: "3", label: "three" }),
          new BatchItem({ id: "4", label: "four" })
        ] as const

        yield* repo.save(items, { batch: 2 })

        const all = yield* repo.all
        expect(all).toHaveLength(4)
        expect(all.map((_) => _.id).toSorted()).toEqual(["1", "2", "3", "4"])
      })
      .pipe(
        setupRequestContextFromCurrent(),
        Effect.provide(TestStoreLive)
      ))

  it.effect("supports remove batching overload", () =>
    Effect
      .gen(function*() {
        const repo = yield* makeRepo("BatchItem", BatchItem, {})
        const items = [
          new BatchItem({ id: "1", label: "one" }),
          new BatchItem({ id: "2", label: "two" }),
          new BatchItem({ id: "3", label: "three" }),
          new BatchItem({ id: "4", label: "four" })
        ] as const

        yield* repo.save(items)
        yield* repo.remove([items[0], items[1], items[2]], { batch: true })

        const all = yield* repo.all
        expect(all).toHaveLength(1)
        expect(all[0]?.id).toBe("4")
      })
      .pipe(
        setupRequestContextFromCurrent(),
        Effect.provide(TestStoreLive)
      ))

  it.effect("records repository read and write dependencies", () =>
    Effect
      .gen(function*() {
        const readsRef = yield* Ref.make(DataDependencies.empty())
        const writesRef = yield* Ref.make(DataDependencies.empty())
        const recorder = DataDependencies.makeDataDependencyRecorder(readsRef, writesRef)

        yield* Effect
          .gen(function*() {
            const repo = yield* makeRepo("DependencyItem", BatchItem, {})
            yield* repo.save(new BatchItem({ id: "1", label: "one" }))
            yield* repo.all
            yield* repo.find("1")
            yield* repo.removeById("1")
          })
          .pipe(Effect.provideService(DataDependencies.DataDependencyRecorder, recorder))

        expect(yield* Ref.get(readsRef)).toEqual(new Set([DataDependencies.repo("DependencyItem")]))
        expect(yield* Ref.get(writesRef)).toEqual(new Set([DataDependencies.repo("DependencyItem")]))
      })
      .pipe(
        setupRequestContextFromCurrent(),
        Effect.provide(TestStoreLive)
      ))
})

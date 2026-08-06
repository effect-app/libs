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
import * as Tracer from "effect/Tracer"
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
        expect(yield* Ref.get(writesRef)).toEqual(new Set([DataDependencies.repo("DependencyItem", ["1"])]))
      })
      .pipe(
        setupRequestContextFromCurrent(),
        Effect.provide(TestStoreLive)
      ))

  it.effect("narrows direct repository reads to the requested entity", () =>
    Effect
      .gen(function*() {
        const readsRef = yield* Ref.make(DataDependencies.empty())
        const writesRef = yield* Ref.make(DataDependencies.empty())
        const recorder = DataDependencies.makeDataDependencyRecorder(readsRef, writesRef)

        yield* Effect
          .gen(function*() {
            const repo = yield* makeRepo("DependencyItem", BatchItem, {})
            yield* repo.find("1")
          })
          .pipe(Effect.provideService(DataDependencies.DataDependencyRecorder, recorder))

        expect(yield* Ref.get(readsRef)).toEqual(new Set([DataDependencies.repo("DependencyItem", ["1"])]))
      })
      .pipe(
        setupRequestContextFromCurrent(),
        Effect.provide(TestStoreLive)
      ))

  it("matches entity dependencies by overlapping ids with a coarse fallback", () => {
    const item1 = new Set([DataDependencies.repo("DependencyItem", ["1"])])
    const item2 = new Set([DataDependencies.repo("DependencyItem", ["2"])])
    const collection = new Set([DataDependencies.repo("DependencyItem")])

    expect(DataDependencies.intersects(item1, item2)).toBe(false)
    expect(DataDependencies.intersects(item1, item1)).toBe(true)
    expect(DataDependencies.intersects(collection, item2)).toBe(true)
  })

  it("decodes repository dependencies produced before entity ids were added", () => {
    expect(
      S.decodeUnknownSync(DataDependencies.DataDependency)({
        type: "repo",
        name: "DependencyItem"
      })
    )
      .toEqual(DataDependencies.repo("DependencyItem"))
  })

  it.effect("matches an explicit query scope to a write alias", () =>
    Effect
      .gen(function*() {
        const readsRef = yield* Ref.make(DataDependencies.empty())
        const writesRef = yield* Ref.make(DataDependencies.empty())
        const recorder = DataDependencies.makeDataDependencyRecorder(readsRef, writesRef)

        yield* Effect
          .gen(function*() {
            const repo = yield* makeRepo("DependencyItem", BatchItem, {
              dependencyIds: (item) => [item.id, `alias-${item.id}`]
            })
            yield* repo.save(new BatchItem({ id: "1", label: "one" }))
            yield* repo.all.pipe(repo.withReadScope(["alias-1"]))
          })
          .pipe(Effect.provideService(DataDependencies.DataDependencyRecorder, recorder))

        expect(yield* Ref.get(readsRef)).toEqual(new Set([DataDependencies.repo("DependencyItem", ["alias-1"])]))
        expect(yield* Ref.get(writesRef)).toEqual(
          new Set([DataDependencies.repo("DependencyItem", ["1", "alias-1"])])
        )
      })
      .pipe(
        setupRequestContextFromCurrent(),
        Effect.provide(TestStoreLive)
      ))

  it.effect("records previous and next relationship aliases", () =>
    Effect
      .gen(function*() {
        const readsRef = yield* Ref.make(DataDependencies.empty())
        const writesRef = yield* Ref.make(DataDependencies.empty())
        const recorder = DataDependencies.makeDataDependencyRecorder(readsRef, writesRef)

        yield* Effect
          .gen(function*() {
            const repo = yield* makeRepo("DependencyItem", BatchItem, {
              dependencyIds: (item) => [item.id, `label-${item.label}`]
            })
            yield* repo.save(new BatchItem({ id: "1", label: "old" }))
            yield* recorder.drainWrites

            yield* repo.save(new BatchItem({ id: "1", label: "new" }))
            expect(yield* recorder.drainWrites).toEqual(
              new Set([DataDependencies.repo("DependencyItem", ["1", "label-new", "label-old"])])
            )

            yield* repo.removeById("1")
            expect(yield* recorder.drainWrites).toEqual(
              new Set([DataDependencies.repo("DependencyItem", ["1", "label-new"])])
            )
          })
          .pipe(Effect.provideService(DataDependencies.DataDependencyRecorder, recorder))
      })
      .pipe(
        setupRequestContextFromCurrent(),
        Effect.provide(TestStoreLive)
      ))

  it.effect("records repository and affected-query write dependencies", () =>
    Effect
      .gen(function*() {
        const readsRef = yield* Ref.make(DataDependencies.empty())
        const writesRef = yield* Ref.make(DataDependencies.empty())
        const recorder = DataDependencies.makeDataDependencyRecorder(readsRef, writesRef)

        yield* Effect
          .gen(function*() {
            const repo = yield* makeRepo("DependencyItem", BatchItem, {
              dependencyIds: (item) => [item.id, `alias-${item.id}`],
              additionalWriteDependencies: (item) => [
                DataDependencies.signal("DependencyItem.List", [item.label])
              ]
            })
            yield* repo.save(new BatchItem({ id: "1", label: "one" }))
            yield* DataDependencies.read(DataDependencies.signal("DependencyItem.List", ["one"]))
          })
          .pipe(Effect.provideService(DataDependencies.DataDependencyRecorder, recorder))

        expect(yield* Ref.get(readsRef)).toEqual(
          new Set([DataDependencies.signal("DependencyItem.List", ["one"])])
        )
        expect(yield* Ref.get(writesRef)).toEqual(
          new Set([
            DataDependencies.repo("DependencyItem", ["1", "alias-1"]),
            DataDependencies.signal("DependencyItem.List", ["one"])
          ])
        )
      })
      .pipe(
        setupRequestContextFromCurrent(),
        Effect.provide(TestStoreLive)
      ))

  it.effect("invalidates derived dependencies from previous saves and removeById", () =>
    Effect
      .gen(function*() {
        const readsRef = yield* Ref.make(DataDependencies.empty())
        const writesRef = yield* Ref.make(DataDependencies.empty())
        const recorder = DataDependencies.makeDataDependencyRecorder(readsRef, writesRef)

        yield* Effect
          .gen(function*() {
            const repo = yield* makeRepo("DerivedDependencyItem", BatchItem, {
              additionalWriteDependencies: (item) => [
                DataDependencies.signal("DerivedDependencyItem.List", [item.label])
              ]
            })
            yield* repo.save(new BatchItem({ id: "1", label: "old" }))
            yield* recorder.drainWrites

            yield* repo.save(new BatchItem({ id: "1", label: "new" }))
            expect(yield* recorder.drainWrites).toEqual(
              new Set([
                DataDependencies.repo("DerivedDependencyItem", ["1"]),
                DataDependencies.signal("DerivedDependencyItem.List", ["new", "old"])
              ])
            )

            yield* repo.removeById("1")
            expect(yield* recorder.drainWrites).toEqual(
              new Set([
                DataDependencies.repo("DerivedDependencyItem", ["1"]),
                DataDependencies.signal("DerivedDependencyItem.List", ["new"])
              ])
            )
          })
          .pipe(Effect.provideService(DataDependencies.DataDependencyRecorder, recorder))
      })
      .pipe(
        setupRequestContextFromCurrent(),
        Effect.provide(TestStoreLive)
      ))

  it.effect("records schema timing on repository spans without codec child spans", () =>
    Effect
      .gen(function*() {
        const spans: Tracer.NativeSpan[] = []
        const tracer = Tracer.make({
          span(options) {
            const span = new Tracer.NativeSpan(options)
            spans.push(span)
            return span
          }
        })

        yield* Effect
          .gen(function*() {
            const repo = yield* makeRepo("TelemetryItem", BatchItem, {})
            yield* repo.save(new BatchItem({ id: "1", label: "one" }))
            yield* repo.all
          })
          .pipe(Effect.provideService(Tracer.Tracer, tracer))

        expect(spans.map((_) => _.name)).not.toContain("parseMany")
        expect(spans.map((_) => _.name)).not.toContain("encodeMany")

        const saveSpan = spans.find((_) => _.name === "Repository.saveAndPublish")
        const allSpan = spans.find((_) => _.name === "Repository.all")
        expect(saveSpan?.attributes.get("app.schema.encode.duration_ms")).toEqual(expect.any(Number))
        expect(saveSpan?.attributes.get("app.schema.item_count")).toBe(1)
        expect(saveSpan?.attributes.get("db.operation.duration_ms")).toEqual(expect.any(Number))
        expect(allSpan?.attributes.get("app.schema.decode.duration_ms")).toEqual(expect.any(Number))
        expect(allSpan?.attributes.get("app.schema.item_count")).toBe(1)
        expect(allSpan?.attributes.get("db.operation.duration_ms")).toEqual(expect.any(Number))
      })
      .pipe(
        setupRequestContextFromCurrent(),
        Effect.provide(TestStoreLive)
      ))
})

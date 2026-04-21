import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer, S } from "effect-app"
import { makeRepo } from "../src/Model/Repository.js"
import { RepositoryRegistryLive } from "../src/Model/Repository/Registry.js"
import { MemoryStoreLive } from "../src/Store/Memory.js"

class BatchItem extends S.Class<BatchItem>("BatchItem")({
  id: S.String,
  label: S.String
}) {}

const TestStoreLive = Layer.merge(MemoryStoreLive, RepositoryRegistryLive)

describe("repository ext save/remove batching", () => {
  it.effect("supports save batching overload", () =>
    Effect.gen(function*() {
      const repo = yield* makeRepo("BatchItem", BatchItem, {})
      const items = [
        new BatchItem({ id: "1", label: "one" }),
        new BatchItem({ id: "2", label: "two" }),
        new BatchItem({ id: "3", label: "three" }),
        new BatchItem({ id: "4", label: "four" })
      ] as const

      yield* repo.save({ batch: 2 })(...items)

      const all = yield* repo.all
      expect(all).toHaveLength(4)
      expect(all.map((_) => _.id).toSorted()).toEqual(["1", "2", "3", "4"])
    }).pipe(Effect.provide(TestStoreLive))
  )

  it.effect("supports remove batching overload", () =>
    Effect.gen(function*() {
      const repo = yield* makeRepo("BatchItem", BatchItem, {})
      const items = [
        new BatchItem({ id: "1", label: "one" }),
        new BatchItem({ id: "2", label: "two" }),
        new BatchItem({ id: "3", label: "three" }),
        new BatchItem({ id: "4", label: "four" })
      ] as const

      yield* repo.save(...items)
      yield* repo.remove({ batch: true })(items[0], items[1], items[2])

      const all = yield* repo.all
      expect(all).toHaveLength(1)
      expect(all[0]?.id).toBe("4")
    }).pipe(Effect.provide(TestStoreLive))
  )
})

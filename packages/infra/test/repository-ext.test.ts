import { describe, expect, it } from "@effect/vitest"
import * as Effect from "effect-app/Effect"
import * as Layer from "effect-app/Layer"
import { makeRepo } from "effect-app/Model/Repository"
import { RepositoryRegistryLive } from "effect-app/Model/Repository/Registry"
import * as S from "effect-app/Schema"
import { setupRequestContextFromCurrent } from "../src/setupRequest.js"
import { MemoryStoreLive } from "../src/Store/Memory.js"

class BatchItem extends S.Class<BatchItem>("BatchItem")({
  id: S.String,
  label: S.String
}) {}

const TestStoreLive = Layer.merge(MemoryStoreLive, RepositoryRegistryLive)

describe("repository ext save/remove batching", () => {
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
})

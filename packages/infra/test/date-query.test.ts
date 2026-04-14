import { Schema } from "effect"
import { Context, Effect, Layer, S } from "effect-app"
import { describe, expect, it } from "vitest"
import { setupRequestContextFromCurrent } from "../src/api/setupRequest.js"
import { and, make, order, where } from "../src/Model/query.js"
import { makeRepo } from "../src/Model/Repository.js"
import { MemoryStoreLive } from "../src/Store/Memory.js"

class Event extends S.Class<Event>("Event")({
  id: S.StringId.withDefault,
  title: S.NonEmptyString255,
  occurredAt: Schema.Date.pipe(S.withConstructorDefault(Effect.sync(() => new globalThis.Date())))
}) {}
namespace Event {
  export interface Encoded extends S.Codec.Encoded<typeof Event> {}
}

const d = (iso: string) => new globalThis.Date(iso)

const items = [
  new Event({ title: S.NonEmptyString255("New Year"), occurredAt: d("2024-01-01T00:00:00Z") }),
  new Event({ title: S.NonEmptyString255("Spring"), occurredAt: d("2024-03-20T00:00:00Z") }),
  new Event({ title: S.NonEmptyString255("Summer"), occurredAt: d("2024-06-21T00:00:00Z") }),
  new Event({ title: S.NonEmptyString255("Autumn"), occurredAt: d("2024-09-22T00:00:00Z") }),
  new Event({ title: S.NonEmptyString255("Winter"), occurredAt: d("2024-12-21T00:00:00Z") })
]

// @effect-diagnostics-next-line missingEffectServiceDependency:off
class EventRepo extends Context.Service<EventRepo>()("EventRepo", {
  make: Effect.gen(function*() {
    return yield* makeRepo("Event", Event, {})
  })
}) {
  static readonly Test = Layer
    .effect(
      EventRepo,
      Effect.gen(function*() {
        return EventRepo.of(yield* makeRepo("Event", Event, { makeInitial: Effect.sync(() => items) }))
      })
    )
    .pipe(Layer.provide(MemoryStoreLive))
}

const provideLayer = <A, E>(eff: Effect.Effect<A, E, EventRepo>) =>
  eff.pipe(
    Effect.provide(EventRepo.Test),
    setupRequestContextFromCurrent(),
    Effect.runPromise
  )

const titlesOf = (arr: readonly Event[]) => arr.map((_) => _.title).toSorted()

describe("date where queries", () => {
  it("eq matches exact date", () =>
    provideLayer(Effect.gen(function*() {
      const repo = yield* EventRepo
      const result = yield* repo.query(where("occurredAt", d("2024-06-21T00:00:00Z")))
      expect(titlesOf(result)).toEqual(["Summer"])
    })))

  it("gt returns dates strictly after the bound", () =>
    provideLayer(Effect.gen(function*() {
      const repo = yield* EventRepo
      const result = yield* repo.query(where("occurredAt", "gt", d("2024-06-21T00:00:00Z")))
      expect(titlesOf(result)).toEqual(["Autumn", "Winter"])
    })))

  it("gte includes the bound", () =>
    provideLayer(Effect.gen(function*() {
      const repo = yield* EventRepo
      const result = yield* repo.query(where("occurredAt", "gte", d("2024-06-21T00:00:00Z")))
      expect(titlesOf(result)).toEqual(["Autumn", "Summer", "Winter"])
    })))

  it("lt returns dates strictly before the bound", () =>
    provideLayer(Effect.gen(function*() {
      const repo = yield* EventRepo
      const result = yield* repo.query(where("occurredAt", "lt", d("2024-06-21T00:00:00Z")))
      expect(titlesOf(result)).toEqual(["New Year", "Spring"])
    })))

  it("lte includes the bound", () =>
    provideLayer(Effect.gen(function*() {
      const repo = yield* EventRepo
      const result = yield* repo.query(where("occurredAt", "lte", d("2024-06-21T00:00:00Z")))
      expect(titlesOf(result)).toEqual(["New Year", "Spring", "Summer"])
    })))

  it("neq excludes exact match", () =>
    provideLayer(Effect.gen(function*() {
      const repo = yield* EventRepo
      const result = yield* repo.query(where("occurredAt", "neq", d("2024-06-21T00:00:00Z")))
      expect(titlesOf(result)).toEqual(["Autumn", "New Year", "Spring", "Winter"])
    })))

  it("range gte + lte selects inclusive window", () =>
    provideLayer(Effect.gen(function*() {
      const repo = yield* EventRepo
      const result = yield* repo.query(
        where("occurredAt", "gte", d("2024-03-20T00:00:00Z")),
        and("occurredAt", "lte", d("2024-09-22T00:00:00Z")),
        order("occurredAt")
      )
      expect(result.map((_) => _.title)).toEqual(["Spring", "Summer", "Autumn"])
    })))

  it("returns empty when no rows match", () =>
    provideLayer(Effect.gen(function*() {
      const repo = yield* EventRepo
      const result = yield* repo.query(where("occurredAt", "gt", d("2030-01-01T00:00:00Z")))
      expect(result).toEqual([])
    })))

  it("order by date ascending", () =>
    provideLayer(Effect.gen(function*() {
      const repo = yield* EventRepo
      const q = make<Event.Encoded>().pipe(order("occurredAt"))
      const result = yield* repo.query(() => q)
      expect(result.map((_) => _.title)).toEqual(["New Year", "Spring", "Summer", "Autumn", "Winter"])
    })))
})

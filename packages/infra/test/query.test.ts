/* eslint-disable @typescript-eslint/no-empty-object-type */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { Context, Effect, flow, Layer, Option, pipe, S, Struct } from "effect-app"
import { inspect } from "util"
import { expect, expectTypeOf, it } from "vitest"
import { setupRequestContextFromCurrent } from "../src/api/setupRequest.js"
import type { QueryEnd, QueryProjection, QueryWhere } from "../src/Model/query.js"
import { and, count, make, one, or, order, page, project, toFilter, where } from "../src/Model/query.js"
import { makeRepo } from "../src/Model/Repository.js"
import { memFilter, MemoryStoreLive } from "../src/Store/Memory.js"

const str = S.Struct({ _tag: S.Literal("string"), value: S.String })
const num = S.Struct({ _tag: S.Literal("number"), value: S.Number })
const someUnion = S.Union(str, num)

export class Something extends S.Class<Something>()({
  id: S.StringId.withDefault,
  displayName: S.NonEmptyString255,
  n: S.Date.withDefault,
  union: someUnion.pipe(S.withDefaultConstructor(() => ({ _tag: "string" as const, value: "hi" })))
}) {}
export declare namespace Something {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  export interface Encoded extends S.Schema.Encoded<typeof Something> {}
}

const MakeSomeService = Effect.succeed({ a: 1 })
export class SomeService extends Context.TagMakeId("SomeService", MakeSomeService)<SomeService>() {}

const q = make<Something.Encoded>()
  .pipe( // provided automatically inside Repo.q2()
    where("displayName", "Verona"),
    or(
      where("displayName", "Riley"),
      and("n", "gt", "2021-01-01T00:00:00Z") // TODO: work with To type translation, so Date?
    ),
    order("displayName"),
    page({ take: 10 }),
    // for projection performance benefit, this should be limited to the fields interested, and leads to SELECT fields
    project(
      S.transformToOrFail(
        S.Struct(Struct.pick(Something.fields, "id", "displayName")),
        S.Struct(Struct.pick(Something.fields, "id", "displayName")),
        (_) => Effect.andThen(SomeService, _)
      )
    )
  )

const items = [
  new Something({ displayName: S.NonEmptyString255("Verona"), n: new Date("2020-01-01T00:00:00Z") }),
  new Something({ displayName: S.NonEmptyString255("Riley") }),
  new Something({
    displayName: S.NonEmptyString255("Riley"),
    n: new Date("2020-01-01T00:00:00Z"),
    union: { _tag: "number", value: 1 }
  })
]

// TODO: .merge queries?
// where(x, y).or(a, b) + where(z, v) = (where(x, y) or(a,b)) and where(z, v)) ?

it("merge", () => {
  const a = make().pipe(where("a", "b"), or("c", "d"))
  const b = make().pipe(where("d", "e"), or("f", "g"))

  const merge = (b: any) => (a: any) => pipe(a, and(() => b))

  const r = pipe(a, merge(b), toFilter, (_) => _.filter)

  // TODO: instead this should probably scope the first where/or together e.g (where x, or y) and (...)
  const expected = make().pipe(
    where("a", "b"),
    or("c", "d"),
    and(where("d", "e"), or("f", "g")),
    toFilter,
    (_) => _.filter
  )

  console.log(JSON.stringify({ r, expected }, undefined, 2))
  expect(r).toEqual(expected)
})

it("works", () => {
  console.log("raw", inspect(q, undefined, 25))
  const interpreted = toFilter(q)
  console.log("interpreted", inspect(interpreted, undefined, 25))

  const processed = memFilter(interpreted)(items.map((_) =>
    S.encodeUnknownSync(S.Struct({
      ...Something.omit("displayName"),
      displayName: S.Literal("Verona", "Riley")
    }))(_)
  ))

  expect(processed).toEqual(items.slice(0, 2).toReversed().map(Struct.pick("id", "displayName")))
})

class SomethingRepo extends Effect.Service<SomethingRepo>()("SomethingRepo", {
  effect: Effect.gen(function*() {
    return yield* makeRepo("Something", Something, {})
  })
}) {
  static readonly Test = Layer
    .effect(
      SomethingRepo,
      Effect.gen(function*() {
        return SomethingRepo.make(yield* makeRepo("Something", Something, { makeInitial: Effect.sync(() => items) }))
      })
    )
    .pipe(
      Layer.provide(MemoryStoreLive)
    )
}

it("works with repo", () =>
  Effect
    .gen(function*() {
      const somethingRepo = yield* SomethingRepo
      yield* somethingRepo.saveAndPublish(items)

      const q1 = yield* somethingRepo.query(() => q)
      const q2 = yield* somethingRepo
        .query(
          where("displayName", "Verona"),
          or(
            where("displayName", "Riley"),
            and("n", "gt", "2021-01-01T00:00:00Z") // TODO: work with To type translation, so Date?
          ),
          order("displayName"),
          page({ take: 10 }),
          // for projection performance benefit, this should be limited to the fields interested, and leads to SELECT fields
          project(
            S.transformToOrFail(
              S.Struct(Struct.pick(Something.fields, "displayName")),
              S.Struct(Struct.pick(Something.fields, "displayName")),
              (_) => Effect.andThen(SomeService, _)
            )
          )
        )

      const smtArr = yield* somethingRepo
        .query(
          flow(where("displayName", "Verona"))
        )

      expectTypeOf(smtArr).toEqualTypeOf<readonly Something[]>()

      expect(q1).toEqual(items.slice(0, 2).toReversed().map(Struct.pick("id", "displayName")))
      expect(q2).toEqual(items.slice(0, 2).toReversed().map(Struct.pick("displayName")))
    })
    .pipe(Effect.provide(Layer.mergeAll(SomethingRepo.Test, SomeService.toLayer())), Effect.runPromise))

it("collect", () =>
  Effect
    .gen(function*() {
      const somethingRepo = yield* SomethingRepo
      yield* somethingRepo.saveAndPublish(items)

      expect(
        yield* somethingRepo
          .query(
            where("displayName", "Riley"), // TODO: work with To type translation, so Date?
            // one,
            // for projection performance benefit, this should be limited to the fields interested, and leads to SELECT fields
            project(
              S.transformTo(
                S.encodedSchema(S.Struct({
                  ...Struct.pick(Something.fields, "n"),
                  displayName: S.String
                })),
                S.typeSchema(S.Option(S.String)),
                (_) =>
                  _.displayName === "Riley" && _.n === "2020-01-01T00:00:00.000Z"
                    ? Option.some(`${_.displayName}-${_.n}`)
                    : Option.none()
              ),
              "collect"
            )
          )
      )
        .toEqual(["Riley-2020-01-01T00:00:00.000Z"])

      expect(
        (yield* somethingRepo
          .query(
            where("union._tag", "string"),
            one
          ))
          .union
          .value
      )
        .toEqual("hi")
    })
    .pipe(Effect.provide(Layer.mergeAll(SomethingRepo.Test, SomeService.toLayer())), Effect.runPromise))

class Person extends S.ExtendedTaggedClass<Person, Person.Encoded>()("person", {
  id: S.String,
  surname: S.String
}) {}
class Animal extends S.ExtendedTaggedClass<Animal, Animal.Encoded>()("animal", {
  id: S.String,
  surname: S.String
}) {}
class Test extends S.ExtendedTaggedClass<Test, Test.Encoded>()("test", {
  id: S.String
}) {}

namespace Person {
  export interface Encoded extends S.Struct.Encoded<typeof Person["fields"]> {}
}
namespace Animal {
  export interface Encoded extends S.Struct.Encoded<typeof Animal["fields"]> {}
}
namespace Test {
  export interface Encoded extends S.Struct.Encoded<typeof Test["fields"]> {}
}

const TestUnion = S.Union(Person, Animal, Test)
type TestUnion = typeof TestUnion.Type
namespace TestUnion {
  export type Encoded = typeof TestUnion.Encoded
}

it(
  "refine",
  () =>
    Effect
      .gen(function*() {
        const repo = yield* makeRepo("test", TestUnion, {})
        const result = (yield* repo.query(where("id", "123"), and("_tag", "animal"))) satisfies readonly Animal[]
        const result2 = (yield* repo.query(where("_tag", "animal"))) satisfies readonly Animal[]

        expect(result).toEqual([])
        expect(result2).toEqual([])
      })
      .pipe(Effect.provide(MemoryStoreLive), setupRequestContextFromCurrent(), Effect.runPromise)
)

it(
  "refine2",
  () =>
    Effect
      .gen(function*() {
        class AA extends S.TaggedClass<AA>()("AA", {
          id: S.String,
          a: S.Unknown
        }) {}

        class BB extends S.TaggedClass<BB>()("BB", {
          id: S.String,
          b: S.Unknown
        }) {}

        class CC extends S.TaggedClass<CC>()("CC", {
          id: S.String,
          c: S.Unknown
        }) {}

        class DD extends S.TaggedClass<DD>()("DD", {
          id: S.String,
          d: S.Unknown
        }) {}

        // const repo = yield* makeRepo("test", S.Union(AA, BB, CC, DD), {})

        type Union = AA | BB | CC | DD

        const query1 = make<Union>().pipe(
          where("id", "bla"),
          and("_tag", "AA")
        )
        expectTypeOf(query1).toEqualTypeOf<
          QueryWhere<Union, AA>
        >()

        const query2 = make<Union>().pipe(
          where("_tag", "AA")
        )
        expectTypeOf(query2).toEqualTypeOf<QueryWhere<Union, AA>>()

        const query2a = make<Union>().pipe(
          where("c", "something")
        )
        expectTypeOf(query2a).toEqualTypeOf<
          QueryWhere<Union, {
            readonly id: string
            readonly _tag: "CC"
            readonly c: {} // from unknown to {} because "something" means that it's not null or undefined
          }>
        >()

        const query3 = make<Union>().pipe(
          where("_tag", "AA"),
          or(
            where("id", "test"),
            and("_tag", "BB")
          )
        )
        expectTypeOf(query3).toEqualTypeOf<
          QueryWhere<
            Union,
            AA | BB
          >
        >()

        const query3b = make<Union>().pipe(
          where("_tag", "AA"),
          or(
            where("_tag", "BB")
          )
        )
        expectTypeOf(query3b).toEqualTypeOf<QueryWhere<Union, AA | BB>>()

        const query4 = make<Union>().pipe(
          where("_tag", "AA"),
          project(S.Struct({ id: S.String, a: S.Unknown }))
        )
        expectTypeOf(query4).toEqualTypeOf<
          QueryProjection<
            AA,
            {
              readonly id: string
              readonly a: unknown
            },
            never,
            "many"
          >
        >()

        // eslint-disable-next-line unused-imports/no-unused-vars
        const query5 = make<Union>().pipe(
          where("id", "bla"),
          // @ts-expect-error cannot project over fields that are not in common between the union members (you must refine the union first)
          project(S.Struct({ id: S.String, a: S.Unknown }))
        )
        console.log(query5)

        const query6 = make<Union>().pipe(
          where("_tag", "neq", "AA")
        )
        expectTypeOf(query6).toEqualTypeOf<QueryWhere<Union, BB | CC | DD>>()

        const query7 = make<Union>().pipe(
          where("_tag", "AA"),
          or(
            where("id", "test"),
            and("_tag", "neq", "BB")
          )
        )
        expectTypeOf(query7).toEqualTypeOf<
          QueryWhere<
            Union,
            AA | CC | DD
          >
        >()

        const query8 = make<Union>().pipe(
          where("_tag", "neq", "AA"),
          and("_tag", "AA")
        )
        expectTypeOf(query8).toEqualTypeOf<QueryWhere<Union, never>>()

        const query9 = make<Union>().pipe(
          where("id", "AA"),
          and("_tag", "AA"),
          or(
            where("_tag", "BB"),
            or(
              where("id", "test"),
              and("_tag", "CC")
            )
          )
        )
        expectTypeOf(query9).toEqualTypeOf<
          QueryWhere<
            Union,
            AA | BB | CC
          >
        >()

        const query10 = make<Union>().pipe(
          where("id", "AA"),
          and("_tag", "AA"),
          or(
            where("id", "test"),
            and("_tag", "BB")
          ),
          order("id", "ASC"),
          page({ take: 10 }),
          count
        )
        expectTypeOf(query10).toEqualTypeOf<
          QueryProjection<
            AA | BB,
            S.NonNegativeInt,
            never,
            "count"
          >
        >()

        const query11 = make<Union>().pipe(
          where("id", "AA"),
          and("_tag", "AA"),
          or(
            where("id", "test"),
            and("_tag", "BB")
          ),
          order("id", "ASC"),
          page({ take: 10 }),
          one
        )
        expectTypeOf(query11).toEqualTypeOf<
          QueryEnd<
            AA | BB,
            "one"
          >
        >()

        expect([]).toEqual([])
      })
      .pipe(Effect.provide(MemoryStoreLive), setupRequestContextFromCurrent(), Effect.runPromise)
)

it(
  "refine2",
  () =>
    Effect
      .gen(function*() {
        class AA extends S.Class<AA>()({
          id: S.Literal("AA"),
          a: S.Unknown
        }) {}

        class BB extends S.Class<BB>()({
          id: S.Literal("BB"),
          b: S.Unknown
        }) {}

        class CC extends S.Class<CC>()({
          id: S.Literal("CC"),
          c: S.Unknown
        }) {}

        class DD extends S.Class<DD>()({
          id: S.Literal("DD"),
          d: S.Unknown
        }) {}

        type Union = AA | BB | CC | DD

        const query1 = make<Union>().pipe(
          where("id", "AA")
        )
        expectTypeOf(query1).toEqualTypeOf<QueryWhere<Union, AA>>()

        expect([]).toEqual([])
      })
      .pipe(Effect.runPromise)
)

it(
  "project",
  () =>
    Effect
      .gen(function*() {
        const schema = S.Struct({
          id: S.String,
          createdAt: S
            .optional(S.Date)
            .pipe(
              S.withDefaults({ constructor: () => new Date(), decoding: () => new Date() })
            )
        })
        const repo = yield* makeRepo(
          "test",
          schema,
          {}
        )

        const outputSchema = S.Struct({
          id: S.Literal("123"),
          createdAt: S
            .optional(S.Date)
            .pipe(
              S.withDefaults({ constructor: () => new Date(), decoding: () => new Date() })
            )
        })

        const result = yield* repo.query(where("id", "123"), project(outputSchema))

        expect(result).toEqual([])
      })
      .pipe(Effect.provide(MemoryStoreLive), setupRequestContextFromCurrent(), Effect.runPromise)
)

it(
  "doesn't mess when refining fields",
  () =>
    Effect
      .gen(function*() {
        const schema = S.Struct({
          id: S.String,
          literals: S.Literal("a", "b", "c")
        })

        type Schema = typeof schema.Type

        const repo = yield* makeRepo(
          "test",
          schema,
          {}
        )

        const result = yield* repo.query(
          where("id", "123"),
          and("literals", "a")
        )

        expectTypeOf(result).toEqualTypeOf<readonly Schema[]>()

        expect(result).toEqual([])
      })
      .pipe(Effect.provide(MemoryStoreLive), setupRequestContextFromCurrent(), Effect.runPromise)
)

it(
  "remove null 1",
  () =>
    Effect
      .gen(function*() {
        const schema = S.Struct({
          id: S.String,
          literals: S.Union(S.Literal("a", "b", "c"), S.Null)
        })

        type Schema = typeof schema.Type

        const repo = yield* makeRepo(
          "test",
          schema,
          {}
        )

        const expected = make<Schema>().pipe(
          where("literals", "neq", null)
        )
        expectTypeOf(expected).toEqualTypeOf<
          QueryWhere<Schema, {
            readonly id: string
            readonly literals: "a" | "b" | "c"
          }>
        >()

        const result = yield* repo.query(
          where("literals", "neq", null)
        )

        // TODO patrick: result shouldn't have nulls, but repo.query is not refining the fields
        expectTypeOf(result).toEqualTypeOf<
          readonly {
            readonly id: string
            readonly literals: "a" | "b" | "c"
          }[]
        >()

        expect(result).toEqual([])
      })
      .pipe(Effect.provide(MemoryStoreLive), setupRequestContextFromCurrent(), Effect.runPromise)
)

it(
  "remove null 2",
  () =>
    Effect
      .gen(function*() {
        const schema = S.Struct({
          id: S.String,
          literals: S.Union(S.String, S.Null)
        })

        type Schema = typeof schema.Type

        const repo = yield* makeRepo(
          "test",
          schema,
          {}
        )

        const expected = make<Schema>().pipe(
          where("literals", "ciao")
        )
        expectTypeOf(expected).toEqualTypeOf<
          QueryWhere<Schema, {
            readonly id: string
            readonly literals: string
          }>
        >()

        const result = yield* repo.query(
          where("literals", "neq", null)
        )

        // TODO patrick: result shouldn't have nulls, but repo.query is not refining the fields
        expectTypeOf(result).toEqualTypeOf<
          readonly {
            readonly id: string
            readonly literals: string
          }[]
        >()

        expect(result).toEqual([])
      })
      .pipe(Effect.provide(MemoryStoreLive), setupRequestContextFromCurrent(), Effect.runPromise)
)

it("refine 3", () =>
  Effect
    .gen(function*() {
      class AA extends S.Class<AA>()({
        id: S.Literal("AA"),
        a: S.Unknown
      }) {}

      class BB extends S.Class<BB>()({
        id: S.Literal("BB"),
        b: S.Unknown
      }) {}

      class CC extends S.Class<CC>()({
        id: S.Literal("CC"),
        c: S.Unknown
      }) {}

      class DD extends S.Class<DD>()({
        id: S.Literal("DD"),
        d: S.Unknown
      }) {}

      type Union = AA | BB | CC | DD

      const repo = yield* makeRepo("test", S.Union(AA, BB, CC, DD), {})

      const query1 = make<Union>().pipe(
        where("id", "AA")
      )

      expectTypeOf(query1).toEqualTypeOf<QueryWhere<Union, AA>>()

      const resQuer1 = repo.query(() => query1)

      // TODO patrick: refinement not propagated from encoded to type
      expectTypeOf(resQuer1).toEqualTypeOf<readonly AA[]>()
    })
    .pipe(Effect.provide(MemoryStoreLive), setupRequestContextFromCurrent(), Effect.runPromise))

it("my test", () =>
  Effect
    .gen(function*() {
      class AA extends S.Class<AA>()({
        id: S.String,
        as: S.Array(S.String)
      }) {}

      const repo = yield* makeRepo("test", AA, {})

      const resQuer1 = yield* repo.query(
        where("id", "in", ["id1", "id2"]),
        and(`as.-1`, "startsWith", "a")
      )
      expectTypeOf(resQuer1).toEqualTypeOf<readonly AA[]>()
    })
    .pipe(Effect.provide(MemoryStoreLive), setupRequestContextFromCurrent(), Effect.runPromise))

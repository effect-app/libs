/* eslint-disable unused-imports/no-unused-vars */
/* eslint-disable @typescript-eslint/no-empty-object-type */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { flow, pipe } from "effect"
import * as Context from "effect-app/Context"
import * as Effect from "effect-app/Effect"
import * as Layer from "effect-app/Layer"
import * as Option from "effect-app/Option"
import * as S from "effect-app/Schema"
import * as SchemaTransformation from "effect/SchemaTransformation"
import * as Struct from "effect/Struct"
import { inspect } from "util"
import { expect, expectTypeOf, it } from "vitest"
import { setupRequestContextFromCurrent } from "../src/api/setupRequest.js"
import { and, computed, count, expr, make, one, or, order, page, project, projectComputed, type QueryEnd, type QueryProjection, type QueryWhere, relation, toFilter, where } from "../src/Model/query.js"
import { makeRepo } from "../src/Model/Repository.js"
import { RepositoryRegistryLive } from "../src/Model/Repository/Registry.js"
import { memFilter, MemoryStoreLive } from "../src/Store/Memory.js"
import { SomeService } from "./fixtures.js"

const TestStoreLive = Layer.merge(MemoryStoreLive, RepositoryRegistryLive)

const str = S.Struct({ _tag: S.Literal("string"), value: S.String })
const num = S.Struct({ _tag: S.Literal("number"), value: S.Finite })
const someUnion = S.Union([str, num])

export class Something extends S.Class<Something>("Something")({
  id: S.StringId.withConstructorDefault,
  displayName: S.NonEmptyString255,
  name: S.NullOr(S.NonEmptyString255).withConstructorDefault,
  n: S.Date.withConstructorDefault,
  union: someUnion.pipe(S.withConstructorDefault(Effect.succeed({ _tag: "string" as const, value: "hi" })))
}) {}
export declare namespace Something {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  export interface Encoded extends S.Codec.Encoded<typeof Something> {}
}

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
        S.Struct(Struct.pick(Something.fields, ["id", "displayName"])),
        S.Struct(Struct.pick(Something.fields, ["id", "displayName"])),
        (_) =>
          Effect.gen(function*() {
            yield* SomeService
            return _
          })
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
      ...Struct.omit(Something.fields, ["displayName"]),
      displayName: S.Literals(["Verona", "Riley"])
    }))(_)
  ))

  expect(processed).toEqual(items.slice(0, 2).toReversed().map(Struct.pick(["id", "displayName"])))
})

// @effect-diagnostics-next-line missingEffectServiceDependency:off
class SomethingRepo extends Context.Service<SomethingRepo>()("SomethingRepo", {
  make: Effect.gen(function*() {
    return yield* makeRepo("Something", Something, {})
  })
}) {
  static readonly Test = Layer
    .effect(
      SomethingRepo,
      Effect.gen(function*() {
        return SomethingRepo.of(yield* makeRepo("Something", Something, { makeInitial: Effect.sync(() => items) }))
      })
    )
    .pipe(
      Layer.provide(TestStoreLive)
    )
}

it("works with repo", () =>
  Effect
    .gen(function*() {
      const somethingRepo = yield* SomethingRepo
      yield* somethingRepo.saveAndPublish(items)

      const q0 = yield* somethingRepo.query(one)
      expectTypeOf(q0).toEqualTypeOf<Something>()

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
              S.Struct(Struct.pick(Something.fields, ["displayName"])),
              S.Struct(Struct.pick(Something.fields, ["displayName"])),
              (_) =>
                Effect.gen(function*() {
                  yield* SomeService
                  return _
                })
            )
          )
        )

      const smtArr = yield* somethingRepo
        .query(
          flow(where("displayName", "Verona"))
        )

      expectTypeOf(smtArr).toEqualTypeOf<readonly Something[]>()

      expect(q1).toEqual(items.slice(0, 2).toReversed().map(Struct.pick(["id", "displayName"])))
      expect(q2).toEqual(items.slice(0, 2).toReversed().map(Struct.pick(["displayName"])))
    })
    .pipe(
      Effect.provide(Layer.mergeAll(SomethingRepo.Test, SomeService.Default)),
      setupRequestContextFromCurrent(),
      Effect.runPromise
    ))

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
                S.toEncoded(S.Struct({
                  ...Struct.pick(Something.fields, ["n"]),
                  displayName: S.String
                })),
                S.toType(S.Option(S.String)),
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

      const queryRes = make<Something.Encoded>().pipe(
        where("union._tag", "string"),
        one
      )

      expectTypeOf(queryRes).toEqualTypeOf<
        QueryEnd<{
          readonly id: string
          readonly displayName: string
          readonly n: string
          readonly union: {
            readonly _tag: "string"
            readonly value: string
          }
          readonly name: string | null
        }, "one">
      >()

      const fromRepo = yield* somethingRepo.query(
        where("union._tag", "string"),
        one,
        project(
          S.Struct({
            union: S.Struct({
              _tag: S.Literal("string"),
              value: S.String
            })
          })
        )
      )
      const value = fromRepo.union.value

      expectTypeOf(value).toEqualTypeOf<string>()
      expect(value).toEqual("hi")
    })
    .pipe(
      Effect.provide(Layer.mergeAll(SomethingRepo.Test, SomeService.Default)),
      setupRequestContextFromCurrent(),
      Effect.runPromise
    ))

class Person extends S.TaggedClass<Person, Person.Encoded>()("person", {
  id: S.String,
  surname: S.String
}) {}
class Animal extends S.TaggedClass<Animal, Animal.Encoded>()("animal", {
  id: S.String,
  surname: S.String
}) {}
class Test extends S.TaggedClass<Test, Test.Encoded>()("test", {
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

const TestUnion = S.Union([Person, Animal, Test])
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
        const result = yield* repo.query(where("id", "123"), and("_tag", "animal"))
        const result2 = yield* repo.query(where("_tag", "animal"))

        expectTypeOf(result).toEqualTypeOf<readonly Animal[]>()
        expectTypeOf(result2).toEqualTypeOf<readonly Animal[]>()

        expect(result).toEqual([])
        expect(result2).toEqual([])
      })
      .pipe(Effect.provide(TestStoreLive), setupRequestContextFromCurrent(), Effect.runPromise)
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
          QueryWhere<Union, AA, true>
        >()

        const query2 = make<Union>().pipe(
          where("_tag", "AA")
        )
        expectTypeOf(query2).toEqualTypeOf<QueryWhere<Union, AA, true>>()

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
            "many",
            true
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
        expectTypeOf(query8).toEqualTypeOf<QueryWhere<Union, never, true>>()

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
      .pipe(Effect.provide(TestStoreLive), setupRequestContextFromCurrent(), Effect.runPromise)
)

it(
  "refine2",
  () =>
    Effect
      .gen(function*() {
        class AA extends S.Class<AA>("AA")({
          id: S.Literal("AA"),
          a: S.Unknown
        }) {}

        class BB extends S.Class<BB>("BB")({
          id: S.Literal("BB"),
          b: S.Unknown
        }) {}

        class CC extends S.Class<CC>("CC")({
          id: S.Literal("CC"),
          c: S.Unknown
        }) {}

        class DD extends S.Class<DD>("DD")({
          id: S.Literal("DD"),
          d: S.Unknown
        }) {}

        type Union = AA | BB | CC | DD

        const repo = yield* makeRepo("test", S.Union([AA, BB, CC, DD]), {})

        const query1 = make<Union>().pipe(
          where("id", "AA")
        )
        expectTypeOf(query1).toEqualTypeOf<QueryWhere<Union, AA>>()

        const res = yield* repo.query(() => query1)

        expectTypeOf(res).toEqualTypeOf<readonly AA[]>()

        expect([]).toEqual([])
      })
      .pipe(Effect.provide(TestStoreLive), setupRequestContextFromCurrent(), Effect.runPromise)
)

it(
  "project",
  () =>
    Effect
      .gen(function*() {
        const schema = S.Struct({
          id: S.String,
          createdAt: S.Date.pipe(
            S.withDecodingDefault(Effect.sync(() => new Date().toISOString())),
            S.withConstructorDefault(Effect.sync(() => new Date()))
          )
        })
        const repo = yield* makeRepo(
          "test",
          schema,
          {}
        )

        const outputSchema = S.Struct({
          id: S.Literal("123"),
          createdAt: S.Date.pipe(
            S.withDecodingDefault(Effect.sync(() => new Date().toISOString())),
            S.withConstructorDefault(Effect.sync(() => new Date()))
          )
        })

        const result = yield* repo.query(where("id", "123"), project(outputSchema))

        expect(result).toEqual([])
      })
      .pipe(Effect.provide(TestStoreLive), setupRequestContextFromCurrent(), Effect.runPromise)
)

it(
  "project with encodeKeys in projection maps encoded keys",
  () =>
    Effect
      .gen(function*() {
        const schema = S.Struct({
          id: S.String,
          a: S.Number
        })

        const repo = yield* makeRepo(
          "test",
          schema,
          {
            makeInitial: Effect.sync(() => [{ id: "1", a: 1 }])
          }
        )

        const outputSchema = S.Struct({ b: S.Number }).pipe(S.encodeKeys({ b: "a" }))

        const result = yield* repo.query(project(outputSchema))

        expect(result).toStrictEqual([{ b: 1 }])
      })
      .pipe(Effect.provide(TestStoreLive), setupRequestContextFromCurrent(), Effect.runPromise)
)

it("projectComputed sets computed IR and forces project mode", () => {
  const baseSchema = S.Struct({
    id: S.String,
    items: S.Array(S.Struct({
      state: S.Struct({
        _tag: S.String
      })
    }))
  })
  const query = make<S.Codec.Encoded<typeof baseSchema>>().pipe(
    projectComputed(
      S.Struct({
        pickedCount: S.NonNegativeInt
      }),
      computed({
        pickedCount: relation<S.Codec.Encoded<typeof baseSchema>>("items").count(where("state._tag", "Picked"))
      })
    )
  )
  const interpreted = toFilter(query, baseSchema)
  expect(interpreted.mode).toBe("project")
  expect(interpreted.select).toEqual([
    {
      key: "pickedCount",
      computed: {
        _tag: "relation-count",
        path: "items",
        filter: [{ t: "where", path: "items.-1.state._tag", op: "eq", value: "Picked" }]
      }
    }
  ])
  expect(interpreted.computed?.["pickedCount"]?._tag).toBe("relation-count")
  expect(interpreted.computed?.["pickedCount"]?.path).toBe("items")
  expect(interpreted.computed?.["pickedCount"]?.filter).toEqual([
    { t: "where", path: "items.-1.state._tag", op: "eq", value: "Picked" }
  ])
})

it("projectComputed validates extra computed keys", () => {
  const baseSchema = S.Struct({
    id: S.String,
    items: S.Array(S.Struct({ value: S.Number }))
  })
  const query = make<S.Codec.Encoded<typeof baseSchema>>().pipe(
    projectComputed(
      S.Struct({ id: S.String }),
      computed({
        pickedCount: relation<S.Codec.Encoded<typeof baseSchema>>("items").count()
      })
    )
  )
  expect(() => toFilter(query, baseSchema)).toThrowError("Computed projection keys must exist in projection schema")
})

it("projection schema with computed fields fails without computed map", () => {
  const baseSchema = S.Struct({
    id: S.String,
    items: S.Array(S.Struct({ value: S.Number }))
  })
  const query = make<S.Codec.Encoded<typeof baseSchema>>().pipe(
    projectComputed(S.Struct({ pickedCount: S.NonNegativeInt }), computed({}))
  )
  expect(() => toFilter(query, baseSchema)).toThrowError("Missing computed projections for schema keys")
})

it("projectComputed.every emits relation-every IR", () => {
  const baseSchema = S.Struct({
    id: S.String,
    items: S.Array(S.Struct({ state: S.Struct({ _tag: S.String }) }))
  })
  const query = make<S.Codec.Encoded<typeof baseSchema>>().pipe(
    projectComputed(
      S.Struct({ allPicked: S.Boolean }),
      computed({
        allPicked: relation<S.Codec.Encoded<typeof baseSchema>>("items").every(where("state._tag", "Picked"))
      })
    )
  )
  const interpreted = toFilter(query, baseSchema)
  expect(interpreted.computed?.["allPicked"]?._tag).toBe("relation-every")
  expect(interpreted.computed?.["allPicked"]?.path).toBe("items")
  expect(interpreted.computed?.["allPicked"]?.filter).toEqual([
    { t: "where", path: "items.-1.state._tag", op: "eq", value: "Picked" }
  ])
})

it("projectComputed.distinctCount emits relation-distinct-count IR with field", () => {
  const baseSchema = S.Struct({
    id: S.String,
    items: S.Array(S.Struct({ rowId: S.String, state: S.Struct({ _tag: S.String }) }))
  })
  const query = make<S.Codec.Encoded<typeof baseSchema>>().pipe(
    projectComputed(
      S.Struct({ positionCount: S.NonNegativeInt }),
      computed({
        positionCount: relation<S.Codec.Encoded<typeof baseSchema>>("items").distinctCount(
          "rowId",
          where("state._tag", "neq", "cancelled")
        )
      })
    )
  )
  const interpreted = toFilter(query, baseSchema)
  const ir = interpreted.computed?.["positionCount"]
  expect(ir?._tag).toBe("relation-distinct-count")
  expect((ir as { field: string } | undefined)?.field).toBe("rowId")
  expect(ir?.filter).toEqual([
    { t: "where", path: "items.-1.state._tag", op: "neq", value: "cancelled" }
  ])
})

it("projectComputed.sum emits relation-sum IR with field", () => {
  const baseSchema = S.Struct({
    id: S.String,
    items: S.Array(S.Struct({ weight: S.Number }))
  })
  const query = make<S.Codec.Encoded<typeof baseSchema>>().pipe(
    projectComputed(
      S.Struct({ totalWeight: S.Number }),
      computed({ totalWeight: relation<S.Codec.Encoded<typeof baseSchema>>("items").sum("weight") })
    )
  )
  const interpreted = toFilter(query, baseSchema)
  const ir = interpreted.computed?.["totalWeight"]
  expect(ir?._tag).toBe("relation-sum")
  expect((ir as { field: string } | undefined)?.field).toBe("weight")
  expect(ir?.filter).toEqual([])
})

it("projectComputed.collect / collectDistinct emit relation-collect IR", () => {
  const baseSchema = S.Struct({
    id: S.String,
    items: S.Array(S.Struct({ articleId: S.String }))
  })
  const query = make<S.Codec.Encoded<typeof baseSchema>>().pipe(
    projectComputed(
      S.Struct({
        all: S.Array(S.String),
        distinct: S.Array(S.String)
      }),
      computed({
        all: relation<S.Codec.Encoded<typeof baseSchema>>("items").collect("articleId"),
        distinct: relation<S.Codec.Encoded<typeof baseSchema>>("items").collectDistinct("articleId")
      })
    )
  )
  const interpreted = toFilter(query, baseSchema)
  const all = interpreted.computed?.["all"]
  const distinct = interpreted.computed?.["distinct"]
  expect(all?._tag).toBe("relation-collect")
  expect((all as { distinct: boolean } | undefined)?.distinct).toBe(false)
  expect(distinct?._tag).toBe("relation-collect")
  expect((distinct as { distinct: boolean } | undefined)?.distinct).toBe(true)
})

it("projectComputed.sumExpr emits relation-sum-expr IR", () => {
  const baseSchema = S.Struct({
    id: S.String,
    items: S.Array(S.Struct({
      weight: S.Number,
      tradeUnit: S.Struct({ amount: S.Number, unit: S.String })
    }))
  })
  const query = make<S.Codec.Encoded<typeof baseSchema>>().pipe(
    projectComputed(
      S.Struct({ total: S.Number }),
      computed({
        total: relation<S.Codec.Encoded<typeof baseSchema>>("items").sumExpr(
          expr.mul(expr.field("weight"), expr.field("tradeUnit.amount"))
        )
      })
    )
  )
  const interpreted = toFilter(query, baseSchema)
  const ir = interpreted.computed?.["total"]
  expect(ir?._tag).toBe("relation-sum-expr")
  expect((ir as { expression: unknown } | undefined)?.expression).toEqual({
    _tag: "mul",
    left: { _tag: "field", field: "weight" },
    right: { _tag: "field", field: "tradeUnit.amount" }
  })
})

it("projectComputed.sumExprBy emits relation-sum-expr-by IR", () => {
  const baseSchema = S.Struct({
    id: S.String,
    items: S.Array(S.Struct({
      weight: S.Number,
      tradeUnit: S.Struct({ amount: S.Number, unit: S.String })
    }))
  })
  const query = make<S.Codec.Encoded<typeof baseSchema>>().pipe(
    projectComputed(
      S.Struct({
        totals: S.Array(S.Struct({ unit: S.String, total: S.Number }))
      }),
      computed({
        totals: relation<S.Codec.Encoded<typeof baseSchema>>("items").sumExprBy(
          expr.mul(expr.field("weight"), expr.field("tradeUnit.amount")),
          { unit: "tradeUnit.unit" }
        )
      })
    )
  )
  const interpreted = toFilter(query, baseSchema)
  const ir = interpreted.computed?.["totals"]
  expect(ir?._tag).toBe("relation-sum-expr-by")
  expect((ir as { unit: string } | undefined)?.unit).toBe("tradeUnit.unit")
})

it(
  "doesn't mess when refining fields",
  () =>
    Effect
      .gen(function*() {
        const schema = S.Struct({
          id: S.String,
          literals: S.Literals(["a", "b", "c"])
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
      .pipe(Effect.provide(TestStoreLive), setupRequestContextFromCurrent(), Effect.runPromise)
)

it(
  "remove null 1",
  () =>
    Effect
      .gen(function*() {
        const schema = S.Struct({
          id: S.String,
          literals: S.Union([S.Literals(["a", "b", "c"]), S.Null])
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

        expectTypeOf(result).toEqualTypeOf<
          readonly {
            readonly id: string
            readonly literals: "a" | "b" | "c"
          }[]
        >()

        expect(result).toEqual([])
      })
      .pipe(Effect.provide(TestStoreLive), setupRequestContextFromCurrent(), Effect.runPromise)
)

it(
  "remove null 2",
  () =>
    Effect
      .gen(function*() {
        const schema = S.Struct({
          id: S.String,
          literals: S.Union([S.String, S.Null])
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

        expectTypeOf(result).toEqualTypeOf<
          readonly {
            readonly id: string
            readonly literals: string
          }[]
        >()

        expect(result).toEqual([])
      })
      .pipe(Effect.provide(TestStoreLive), setupRequestContextFromCurrent(), Effect.runPromise)
)

it("remove null from one constituent of a tagged union", () =>
  Effect
    .gen(function*() {
      class AA extends S.Class<AA>("AA")({
        id: S.Literal("AA"),
        a: S.String
      }) {}

      class BB extends S.Class<BB>("BB")({
        id: S.Literal("BB"),
        b: S.NullOr(S.Finite)
      }) {}

      type Union = AA | BB

      const repo = yield* makeRepo("test", S.Union([AA, BB]), {})

      const query1 = make<Union>().pipe(
        where("id", "AA"),
        or(
          where("b", "neq", null)
        )
      )

      expectTypeOf(query1).toEqualTypeOf<
        QueryWhere<
          Union,
          AA | {
            readonly id: "BB"
            readonly b: number
          }
        >
      >()

      const resQuer1 = yield* repo.query(() => query1)

      expectTypeOf(resQuer1).toEqualTypeOf<
        readonly ({
          readonly id: "AA"
          readonly a: string
        } | {
          readonly id: "BB"
          readonly b: number
        })[]
      >()
    })
    .pipe(Effect.provide(TestStoreLive), setupRequestContextFromCurrent(), Effect.runPromise))

it("refine 3", () =>
  Effect
    .gen(function*() {
      class AA extends S.Class<AA>("AA")({
        id: S.Literal("AA"),
        a: S.Unknown
      }) {}

      class BB extends S.Class<BB>("BB")({
        id: S.Literal("BB"),
        b: S.Unknown
      }) {}

      class CC extends S.Class<CC>("CC")({
        id: S.Literal("CC"),
        c: S.Unknown
      }) {}

      class DD extends S.Class<DD>("DD")({
        id: S.Literal("DD"),
        d: S.Unknown
      }) {}

      type Union = AA | BB | CC | DD

      const repo = yield* makeRepo("test", S.Union([AA, BB, CC, DD]), {})

      const query1 = make<Union>().pipe(
        where("id", "AA")
      )

      expectTypeOf(query1).toEqualTypeOf<QueryWhere<Union, AA>>()

      const resQuer1 = yield* repo.query(where("id", "AA"))
      expectTypeOf(resQuer1).toEqualTypeOf<readonly AA[]>()
    })
    .pipe(Effect.provide(TestStoreLive), setupRequestContextFromCurrent(), Effect.runPromise))

it("my test", () =>
  Effect
    .gen(function*() {
      class AA extends S.Class<AA>("AA")({
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
    .pipe(Effect.provide(TestStoreLive), setupRequestContextFromCurrent(), Effect.runPromise))

it("refine inner without imposing a projection", () =>
  Effect
    .gen(function*() {
      class AA extends S.TaggedClass<AA>()("AA", {
        a: S.Unknown
      }) {}

      class BB extends S.TaggedClass<BB>()("BB", {
        b: S.Unknown
      }) {}

      class Data extends S.Class<Data>("Data")({
        id: S.String,
        union: S.Union([AA, BB])
      }) {}

      const repo = yield* makeRepo("data", Data, {})

      const query1 = make<Data>().pipe(
        where("union._tag", "AA"),
        // I can refine the overall output by providing a proper projection
        // that mimics the internal refinement of the encoding type
        project(S.Struct({ union: AA }))
      )
      expectTypeOf(query1).toEqualTypeOf<
        QueryProjection<
          {
            readonly id: string
            readonly union: AA
          },
          {
            readonly union: AA
          },
          never,
          "many"
        >
      >()

      const query2 = make<Data>().pipe(
        where("union._tag", "AA"),
        // But if I wanna the whole Data as output ignoring the inner refinement
        // I wanna be able to do so
        project(Data.mapFields(Struct.pick(["union"])))
      )

      expectTypeOf(query2).toEqualTypeOf<
        QueryProjection<
          {
            readonly id: string
            readonly union: AA
          },
          {
            readonly union: AA | BB
          },
          never,
          "many"
        >
      >()

      const resQuer1 = yield* repo.query(() => query1)
      expectTypeOf(resQuer1).toEqualTypeOf<
        readonly {
          readonly union: AA
        }[]
      >()

      const resQuer2 = yield* repo.query(() => query2)
      expectTypeOf(resQuer2).toEqualTypeOf<
        readonly {
          readonly union: AA | BB
        }[]
      >()
    })
    .pipe(Effect.provide(TestStoreLive), setupRequestContextFromCurrent(), Effect.runPromise))

it("does not allow string queries on arrays", () =>
  Effect
    .gen(function*() {
      type Some = {
        readonly id: string
        readonly id2: `${string}:${string}`
        readonly items: string[]
      }
      const base = make<Some>()

      // @ts-expect-error cannot query with contains on arrays
      const bad1 = base.pipe(where("items", "contains", "a"))
      // @ts-expect-error cannot query with startsWith on arrays
      const bad2 = base.pipe(where("items", "startsWith", "a"))
      // @ts-expect-error cannot query with endsWith on arrays
      const bad3 = base.pipe(where("items", "endsWith", "a"))
      // @ts-expect-error cannot query with notContains on arrays
      const bad4 = base.pipe(where("items", "notContains", "a"))
      // @ts-expect-error cannot query with notStartsWith on arrays
      const bad5 = base.pipe(where("items", "notStartsWith", "a"))
      // @ts-expect-error cannot query with notEndsWith on arrays
      const bad6 = base.pipe(where("items", "notEndsWith", "a"))

      const good1 = base.pipe(where("items", "includes", "a"))
      const good2 = base.pipe(where("items", "includes-any", ["a"]))
      const good3 = base.pipe(where("id", "startsWith", "a"))
      const good4 = base.pipe(where("id2", "startsWith", "a"))

      expectTypeOf(good1).toEqualTypeOf<QueryWhere<Some, Some>>()
      expectTypeOf(good2).toEqualTypeOf<QueryWhere<Some, Some>>()
      expectTypeOf(good3).toEqualTypeOf<QueryWhere<Some, Some>>()
      expectTypeOf(good4).toEqualTypeOf<QueryWhere<Some, Some>>()
    })
    .pipe(Effect.provide(TestStoreLive), setupRequestContextFromCurrent(), Effect.runPromise))

it("test array.length", () =>
  Effect
    .gen(function*() {
      type Something = {
        readonly id: string
        readonly items: string[]
        readonly tuple: [string, string]
      }
      const base = make<Something>()

      const query1 = base.pipe(
        where("items.length", 0)
      )

      const query2 = base.pipe(
        where("items.length", "gt", 2)
      )

      const query3 = base.pipe(
        where("tuple.length", 2)
      )

      base.pipe(
        // @ts-expect-error tuple.length is not valid
        where("tuple.length", 3)
      )

      expectTypeOf(query1).toEqualTypeOf<
        QueryWhere<Something, Something>
      >()

      expectTypeOf(query2).toEqualTypeOf<
        QueryWhere<Something, Something>
      >()

      expectTypeOf(query3).toEqualTypeOf<
        QueryWhere<Something, Something>
      >()
    })
    .pipe(Effect.provide(TestStoreLive), setupRequestContextFromCurrent(), Effect.runPromise))

it("distribution over union", () =>
  Effect
    .gen(function*() {
      const repo = yield* makeRepo("test", TestUnion, {})

      const res = yield* repo.query(
        where("_tag", Math.random() > 0.5 ? "animal" : "person")
      )

      expectTypeOf(res).toEqualTypeOf<
        | readonly ({
          readonly id: string
          readonly surname: string
          readonly _tag: "person"
        })[]
        | readonly ({
          readonly id: string
          readonly surname: string
          readonly _tag: "animal"
        })[]
      >()
    })
    .pipe(Effect.provide(TestStoreLive), setupRequestContextFromCurrent(), Effect.runPromise))

it("refine nested union", () =>
  Effect
    .gen(function*() {
      class TestNested extends S.Class<TestNested>("TestNested")({ id: S.String, nested: TestUnion }) {}

      const repo = yield* makeRepo("test", TestNested, {})

      const base = make<TestNested>()

      const res_query = base.pipe(
        where("nested._tag", Math.random() > 0.5 ? "animal" : "person")
      )

      expectTypeOf(res_query).toEqualTypeOf<
        QueryWhere<TestNested, {
          readonly id: string
          readonly nested: {
            readonly _tag: "person"
            readonly id: string
            readonly surname: string
          } | {
            readonly _tag: "animal"
            readonly id: string
            readonly surname: string
          }
        }, false>
      >()

      const res = yield* repo.query(
        () => res_query
      )

      expectTypeOf(res).toEqualTypeOf<
        readonly {
          readonly id: string
          readonly nested: Person | Animal
        }[]
      >()
    })
    .pipe(Effect.provide(TestStoreLive), setupRequestContextFromCurrent(), Effect.runPromise))

it("find with transformed id", () =>
  Effect
    .gen(function*() {
      const ConfiguratorId = S.NonEmptyString255

      class PreconfigurationId extends S.Class<PreconfigurationId>("PreconfigurationId")({
        configuratorId: ConfiguratorId,
        label: S.NonEmptyString50
      }) {}

      const PreconfigurationIdFromString = S.NonEmptyString255.pipe(
        S.decodeTo(
          S.toType(PreconfigurationId),
          SchemaTransformation.transformOrFail({
            decode: Effect.fnUntraced(function*(value) {
              const values = value.split("_")
              const label = yield* S.SchemaParser.decodeUnknownEffect(S.NonEmptyString50)(values.pop())
              const configuratorId = yield* S.SchemaParser.decodeUnknownEffect(ConfiguratorId)(
                values.join("_")
              )
              return new PreconfigurationId({ configuratorId, label })
            }),
            encode: (id) => Effect.succeed(S.NonEmptyString255(`${id.configuratorId}_${id.label}`))
          })
        ),
        S.revealCodec
      )

      const Preconfiguration = S.Struct({
        id: PreconfigurationIdFromString,
        name: S.String
      })

      const repo = yield* makeRepo("Preconfiguration", Preconfiguration, { idKey: "id" as const })

      const id = new PreconfigurationId({
        configuratorId: S.NonEmptyString255("myConfigurator"),
        label: S.NonEmptyString50("myLabel")
      })
      const item = { id, name: "test preconfig" }

      yield* repo.saveAndPublish([item])

      const found = yield* repo.find(id)
      expect(Option.isSome(found)).toBe(true)
      expect(Option.getOrThrow(found).name).toBe("test preconfig")
      expect(Option.getOrThrow(found).id).toEqual(id)

      const notFound = yield* repo.find(
        new PreconfigurationId({
          configuratorId: S.NonEmptyString255("other"),
          label: S.NonEmptyString50("nope")
        })
      )
      expect(Option.isNone(notFound)).toBe(true)
    })
    .pipe(Effect.provide(TestStoreLive), setupRequestContextFromCurrent(), Effect.runPromise))

it("find with transformed id in tagged union", () =>
  Effect
    .gen(function*() {
      const ConfiguratorId = S.NonEmptyString255

      class PreconfigurationId extends S.Class<PreconfigurationId>("PreconfigurationId")({
        configuratorId: ConfiguratorId,
        label: S.NonEmptyString50
      }) {}

      const PreconfigurationIdFromString = S.NonEmptyString255.pipe(
        S.decodeTo(
          S.toType(PreconfigurationId),
          SchemaTransformation.transformOrFail({
            decode: Effect.fnUntraced(function*(value) {
              const values = value.split("_")
              const label = yield* S.SchemaParser.decodeUnknownEffect(S.NonEmptyString50)(values.pop())
              const configuratorId = yield* S.SchemaParser.decodeUnknownEffect(ConfiguratorId)(
                values.join("_")
              )
              return new PreconfigurationId({ configuratorId, label })
            }),
            encode: (id) => Effect.succeed(S.NonEmptyString255(`${id.configuratorId}_${id.label}`))
          })
        ),
        S.revealCodec
      )

      class Draft extends S.TaggedClass<Draft>()("Draft", {
        id: PreconfigurationIdFromString,
        name: S.String
      }) {}

      class Published extends S.TaggedClass<Published>()("Published", {
        id: PreconfigurationIdFromString,
        name: S.String,
        publishedAt: S.String
      }) {}

      class Archived extends S.TaggedClass<Archived>()("Archived", {
        id: PreconfigurationIdFromString,
        name: S.String,
        archivedAt: S.String
      }) {}

      const Preconfiguration = S.Union([Draft, Published, Archived])

      const repo = yield* makeRepo("Preconfiguration", Preconfiguration, {})

      const id1 = new PreconfigurationId({
        configuratorId: S.NonEmptyString255("conf1"),
        label: S.NonEmptyString50("draft1")
      })
      const id2 = new PreconfigurationId({
        configuratorId: S.NonEmptyString255("conf2"),
        label: S.NonEmptyString50("pub1")
      })
      const id3 = new PreconfigurationId({
        configuratorId: S.NonEmptyString255("conf3"),
        label: S.NonEmptyString50("arch1")
      })

      const draft = new Draft({ id: id1, name: "my draft" })
      const published = new Published({ id: id2, name: "my published", publishedAt: "2024-01-01" })
      const archived = new Archived({ id: id3, name: "my archived", archivedAt: "2024-06-01" })

      yield* repo.saveAndPublish([draft, published, archived])

      // find each by their PreconfigurationId instance
      const foundDraft = yield* repo.find(id1)
      expect(Option.isSome(foundDraft)).toBe(true)
      expect(Option.getOrThrow(foundDraft)._tag).toBe("Draft")
      expect(Option.getOrThrow(foundDraft).name).toBe("my draft")

      const foundPublished = yield* repo.find(id2)
      expect(Option.isSome(foundPublished)).toBe(true)
      expect(Option.getOrThrow(foundPublished)._tag).toBe("Published")

      const foundArchived = yield* repo.find(id3)
      expect(Option.isSome(foundArchived)).toBe(true)
      expect(Option.getOrThrow(foundArchived)._tag).toBe("Archived")

      // not found
      const notFound = yield* repo.find(
        new PreconfigurationId({
          configuratorId: S.NonEmptyString255("nope"),
          label: S.NonEmptyString50("nope")
        })
      )
      expect(Option.isNone(notFound)).toBe(true)
    })
    .pipe(Effect.provide(TestStoreLive), setupRequestContextFromCurrent(), Effect.runPromise))

it("refine union with nested union", () =>
  Effect
    .gen(function*() {
      class A extends S.TaggedClass<A>()("A", {
        a: S.String
      }) {}

      class B extends S.TaggedClass<B>()("B", {
        b: S.String
      }) {}

      class C extends S.TaggedClass<C>()("C", {
        c: S.String
      }) {}

      class D extends S.TaggedClass<D>()("D", {
        d: S.String
      }) {}

      class E extends S.TaggedClass<E>()("E", {
        e: S.String
      }) {}

      class Container1 extends S.TaggedClass<Container1>()("Container1", {
        id: S.String,
        nested: S.Union([A, B, C])
      }) {}

      class Container2 extends S.TaggedClass<Container2>()("Container2", {
        id: S.String,
        nested: S.Union([B, C, D])
      }) {}

      class Container3 extends S.TaggedClass<Container3>()("Container3", {
        id: S.String,
        nested: S.Union([C, D, E])
      }) {}

      const Containers = S.Union([Container1, Container2, Container3])
      type Containers = typeof Containers.Type

      const repo = yield* makeRepo("containers", Containers, {})

      const base = make<Containers>()

      const res_query = base.pipe(
        where("nested._tag", "D")
      )

      expectTypeOf(res_query).toEqualTypeOf<
        QueryWhere<
          Containers,
          {
            readonly id: string
            readonly _tag: "Container2"
            readonly nested: {
              readonly _tag: "D"
              readonly d: string
            }
          } | {
            readonly id: string
            readonly _tag: "Container3"
            readonly nested: {
              readonly _tag: "D"
              readonly d: string
            }
          },
          false
        >
      >()

      const res_query2 = base.pipe(
        where("nested._tag", "in", ["D"])
      )

      expectTypeOf(res_query2).toEqualTypeOf<
        QueryWhere<
          Containers,
          {
            readonly id: string
            readonly _tag: "Container2"
            readonly nested: {
              readonly _tag: "D"
              readonly d: string
            }
          } | {
            readonly id: string
            readonly _tag: "Container3"
            readonly nested: {
              readonly _tag: "D"
              readonly d: string
            }
          },
          false
        >
      >()

      const res = yield* repo.query(
        () => res_query
      )

      expectTypeOf(res).toEqualTypeOf<
        readonly ({
          readonly _tag: "Container2"
          readonly id: string
          readonly nested: D
        } | {
          readonly _tag: "Container3"
          readonly id: string
          readonly nested: D
        })[]
      >()
    })
    .pipe(Effect.provide(TestStoreLive), setupRequestContextFromCurrent(), Effect.runPromise))

// ---------------------------------------------------------------------------
// memFilter: computed projection execution (in-memory) and code filter coverage
// ---------------------------------------------------------------------------

const computedBaseSchema = S.Struct({
  id: S.String,
  status: S.Literals(["active", "archived"]),
  items: S.Array(S.Struct({
    id: S.String,
    tag: S.Literals(["a", "b", "c"]),
    qty: S.Finite,
    note: S.String
  }))
})
type ComputedBase = S.Codec.Encoded<typeof computedBaseSchema>

const computedRows: ComputedBase[] = [
  {
    id: "r1",
    status: "active",
    items: [
      { id: "i1", tag: "a", qty: 10, note: "alpha" },
      { id: "i2", tag: "a", qty: 20, note: "alpha" },
      { id: "i3", tag: "b", qty: 5, note: "beta" }
    ]
  },
  { id: "r2", status: "active", items: [] },
  {
    id: "r3",
    status: "archived",
    items: [
      { id: "i4", tag: "b", qty: 7, note: "gamma" },
      { id: "i5", tag: "b", qty: 7, note: "gamma" },
      { id: "i6", tag: "c", qty: 3, note: "delta" }
    ]
  }
]

it("memFilter: relation-count with filter", () => {
  const q = make<ComputedBase>().pipe(
    projectComputed(
      S.Struct({ id: S.String, aCount: S.NonNegativeInt }),
      computed({
        aCount: relation<ComputedBase>("items").count(where("tag", "a"))
      })
    )
  )
  expect(memFilter(toFilter(q, computedBaseSchema))(computedRows)).toEqual([
    { id: "r1", aCount: 2 },
    { id: "r2", aCount: 0 },
    { id: "r3", aCount: 0 }
  ])
})

it("memFilter: relation-any / every with filter", () => {
  const q = make<ComputedBase>().pipe(
    projectComputed(
      S.Struct({
        id: S.String,
        hasA: S.Boolean,
        allB: S.Boolean
      }),
      computed({
        hasA: relation<ComputedBase>("items").any(where("tag", "a")),
        allB: relation<ComputedBase>("items").every(where("tag", "b"))
      })
    )
  )
  expect(memFilter(toFilter(q, computedBaseSchema))(computedRows)).toEqual([
    { id: "r1", hasA: true, allB: false },
    // empty array: any → false, every → true (JS Array.every on [] is true)
    { id: "r2", hasA: false, allB: true },
    { id: "r3", hasA: false, allB: false }
  ])
})

it("memFilter: relation-distinct-count with filter", () => {
  const q = make<ComputedBase>().pipe(
    projectComputed(
      S.Struct({ id: S.String, distinctNotes: S.NonNegativeInt }),
      computed({
        distinctNotes: relation<ComputedBase>("items").distinctCount("note", where("tag", "neq", "c"))
      })
    )
  )
  expect(memFilter(toFilter(q, computedBaseSchema))(computedRows)).toEqual([
    { id: "r1", distinctNotes: 2 }, // alpha, beta
    { id: "r2", distinctNotes: 0 },
    { id: "r3", distinctNotes: 1 } // gamma (delta filtered out)
  ])
})

it("memFilter: relation-sum with filter", () => {
  const q = make<ComputedBase>().pipe(
    projectComputed(
      S.Struct({ id: S.String, totalQty: S.Finite }),
      computed({
        totalQty: relation<ComputedBase>("items").sum("qty", where("tag", "neq", "c"))
      })
    )
  )
  expect(memFilter(toFilter(q, computedBaseSchema))(computedRows)).toEqual([
    { id: "r1", totalQty: 35 },
    { id: "r2", totalQty: 0 },
    { id: "r3", totalQty: 14 }
  ])
})

it("memFilter: relation-collect / collectDistinct with filter", () => {
  const q = make<ComputedBase>().pipe(
    projectComputed(
      S.Struct({
        id: S.String,
        notes: S.Array(S.String),
        distinctNotes: S.Array(S.String)
      }),
      computed({
        notes: relation<ComputedBase>("items").collect("note", where("tag", "neq", "c")),
        distinctNotes: relation<ComputedBase>("items").collectDistinct("note", where("tag", "neq", "c"))
      })
    )
  )
  expect(memFilter(toFilter(q, computedBaseSchema))(computedRows)).toEqual([
    { id: "r1", notes: ["alpha", "alpha", "beta"], distinctNotes: ["alpha", "beta"] },
    { id: "r2", notes: [], distinctNotes: [] },
    { id: "r3", notes: ["gamma", "gamma"], distinctNotes: ["gamma"] }
  ])
})

it("memFilter: computed projection with multi-statement relation filter", () => {
  const q = make<ComputedBase>().pipe(
    projectComputed(
      S.Struct({ id: S.String, hits: S.NonNegativeInt }),
      computed({
        hits: relation<ComputedBase>("items").count(
          flow(
            where("tag", "a"),
            and("qty", "gt", 10)
          )
        )
      })
    )
  )
  expect(memFilter(toFilter(q, computedBaseSchema))(computedRows)).toEqual([
    { id: "r1", hits: 1 }, // only i2 (a, qty 20)
    { id: "r2", hits: 0 },
    { id: "r3", hits: 0 }
  ])
})

it("memFilter: relation-sum-expr / sum-expr-by / sum-expr-normalized", () => {
  const schema = S.Struct({
    id: S.String,
    items: S.Array(S.Struct({
      weight: S.Finite,
      tradeUnit: S.Struct({ amount: S.Finite, unit: S.String })
    }))
  })
  type Row = S.Codec.Encoded<typeof schema>
  const rows: Row[] = [
    {
      id: "r1",
      items: [
        { weight: 2, tradeUnit: { amount: 5, unit: "kg" } },
        { weight: 4, tradeUnit: { amount: 1000, unit: "g" } },
        { weight: 3, tradeUnit: { amount: 1, unit: "kg" } }
      ]
    },
    { id: "r2", items: [] }
  ]
  const weighted = expr.mul(expr.field("weight"), expr.field("tradeUnit.amount"))
  const q = make<Row>().pipe(
    projectComputed(
      S.Struct({
        id: S.String,
        totalRaw: S.Finite,
        totalsByUnit: S.Array(S.Struct({ unit: S.String, total: S.Finite })),
        totalKg: S.Finite
      }),
      computed({
        totalRaw: relation<Row>("items").sumExpr(weighted, where("weight", "gte", 0)),
        totalsByUnit: relation<Row>("items").sumExprBy(weighted, { unit: "tradeUnit.unit" }, where("weight", "gte", 0)),
        totalKg: relation<Row>("items").sumExprNormalized(weighted, {
          unit: "tradeUnit.unit",
          toBase: "kg",
          factors: { g: 0.001 }
        }, where("weight", "gte", 0))
      })
    )
  )
  expect(memFilter(toFilter(q, schema))(rows)).toEqual([
    {
      id: "r1",
      totalRaw: 4013,
      totalsByUnit: [{ unit: "kg", total: 13 }, { unit: "g", total: 4000 }],
      totalKg: 17
    },
    { id: "r2", totalRaw: 0, totalsByUnit: [], totalKg: 0 }
  ])
})

it("memFilter: computed projection combined with root where filter", () => {
  const q = make<ComputedBase>().pipe(
    where("id", "neq", "r3"),
    projectComputed(
      S.Struct({ id: S.String, totalQty: S.Finite }),
      computed({
        totalQty: relation<ComputedBase>("items").sum("qty", where("tag", "neq", "c"))
      })
    )
  )
  expect(memFilter(toFilter(q, computedBaseSchema))(computedRows)).toEqual([
    { id: "r1", totalQty: 35 },
    { id: "r2", totalQty: 0 }
  ])
})

it("memFilter: computed projection with order/limit/skip applied to base rows", () => {
  const q = make<ComputedBase>().pipe(
    order("id", "DESC"),
    page({ skip: 1, take: 1 }),
    projectComputed(
      S.Struct({ id: S.String, total: S.NonNegativeInt }),
      computed({
        total: relation<ComputedBase>("items").count(where("qty", "gte", 0))
      })
    )
  )
  expect(memFilter(toFilter(q, computedBaseSchema))(computedRows)).toEqual([
    { id: "r2", total: 0 }
  ])
})

it("memFilter: computed projection - relation missing on row returns empty value", () => {
  const partial: ComputedBase[] = [
    { id: "x1" } as ComputedBase,
    { id: "x2", status: "active", items: undefined as unknown as ComputedBase["items"] }
  ]
  const q = make<ComputedBase>().pipe(
    projectComputed(
      S.Struct({
        id: S.String,
        c: S.NonNegativeInt,
        s: S.Finite,
        any_: S.Boolean,
        every_: S.Boolean,
        coll: S.Array(S.String)
      }),
      computed({
        c: relation<ComputedBase>("items").count(where("tag", "a")),
        s: relation<ComputedBase>("items").sum("qty", where("tag", "a")),
        any_: relation<ComputedBase>("items").any(where("tag", "a")),
        every_: relation<ComputedBase>("items").every(where("tag", "a")),
        coll: relation<ComputedBase>("items").collect("note", where("tag", "a"))
      })
    )
  )
  expect(memFilter(toFilter(q, computedBaseSchema))(partial)).toEqual([
    { id: "x1", c: 0, s: 0, any_: false, every_: true, coll: [] },
    { id: "x2", c: 0, s: 0, any_: false, every_: true, coll: [] }
  ])
})

it("memFilter: rejects extra computed keys not in projection schema", () => {
  const q = make<ComputedBase>().pipe(
    projectComputed(
      S.Struct({ id: S.String }),
      computed({
        bogus: relation<ComputedBase>("items").count(where("tag", "a"))
      })
    )
  )
  expect(() => toFilter(q, computedBaseSchema)).toThrowError(
    "Computed projection keys must exist in projection schema"
  )
})

// ---------------------------------------------------------------------------
// memFilter: code filter (where/and/or/scopes) execution coverage
// ---------------------------------------------------------------------------

type CFRow = {
  readonly id: string
  readonly tag: "x" | "y" | "z"
  readonly qty: number
  readonly desc: string
  readonly tags: ReadonlyArray<string>
  readonly nested: { readonly kind: "k1" | "k2"; readonly v: number }
}

const cfRows: CFRow[] = [
  { id: "1", tag: "x", qty: 10, desc: "Hello World", tags: ["red", "green"], nested: { kind: "k1", v: 1 } },
  { id: "2", tag: "y", qty: 20, desc: "Goodbye", tags: ["blue"], nested: { kind: "k2", v: 5 } },
  { id: "3", tag: "z", qty: 0, desc: "Hello again", tags: ["red", "blue", "green"], nested: { kind: "k1", v: 9 } },
  { id: "4", tag: "y", qty: 30, desc: "World cup", tags: [], nested: { kind: "k2", v: 0 } }
]

const runCF = (q: any) => (memFilter(toFilter(q))(cfRows) as unknown as readonly CFRow[]).map((_) => _.id)

it("codeFilter: where + and chain", () => {
  const q = make<CFRow>().pipe(
    where("tag", "y"),
    and("qty", "gt", 25)
  )
  expect(runCF(q)).toEqual(["4"])
})

it("codeFilter: where + or chain", () => {
  const q = make<CFRow>().pipe(
    where("tag", "x"),
    or("tag", "z")
  )
  expect(runCF(q).sort()).toEqual(["1", "3"])
})

it("codeFilter: nested scope precedence (a AND (b OR c))", () => {
  const q = make<CFRow>().pipe(
    where("tag", "y"),
    and(
      where("qty", "gt", 25),
      or("desc", "contains", "good")
    )
  )
  // tag=y AND (qty>25 OR desc contains "good") → row 2 (Goodbye) and row 4 (qty 30)
  expect(runCF(q).sort()).toEqual(["2", "4"])
})

it("codeFilter: contains/startsWith/endsWith are case-insensitive", () => {
  expect(runCF(make<CFRow>().pipe(where("desc", "contains", "WORLD"))).sort()).toEqual(["1", "4"])
  expect(runCF(make<CFRow>().pipe(where("desc", "startsWith", "hello"))).sort()).toEqual(["1", "3"])
  expect(runCF(make<CFRow>().pipe(where("desc", "endsWith", "AGAIN")))).toEqual(["3"])
})

it("codeFilter: array includes / includes-any / includes-all", () => {
  expect(runCF(make<CFRow>().pipe(where("tags", "includes", "red"))).sort()).toEqual(["1", "3"])
  expect(runCF(make<CFRow>().pipe(where("tags", "includes-any", ["blue", "green"]))).sort()).toEqual([
    "1",
    "2",
    "3"
  ])
  expect(runCF(make<CFRow>().pipe(where("tags", "includes-all", ["red", "blue"])))).toEqual(["3"])
})

it("codeFilter: in / notIn", () => {
  expect(runCF(make<CFRow>().pipe(where("tag", "in", ["x", "z"]))).sort()).toEqual(["1", "3"])
  expect(runCF(make<CFRow>().pipe(where("tag", "notIn", ["x", "z"]))).sort()).toEqual(["2", "4"])
})

it("codeFilter: gt / gte / lt / lte / neq", () => {
  expect(runCF(make<CFRow>().pipe(where("qty", "gt", 10))).sort()).toEqual(["2", "4"])
  expect(runCF(make<CFRow>().pipe(where("qty", "gte", 10))).sort()).toEqual(["1", "2", "4"])
  expect(runCF(make<CFRow>().pipe(where("qty", "lt", 10)))).toEqual(["3"])
  expect(runCF(make<CFRow>().pipe(where("qty", "lte", 10))).sort()).toEqual(["1", "3"])
  expect(runCF(make<CFRow>().pipe(where("qty", "neq", 0))).sort()).toEqual(["1", "2", "4"])
})

it("codeFilter: nested path access through dot notation", () => {
  expect(runCF(make<CFRow>().pipe(where("nested.kind", "k1"))).sort()).toEqual(["1", "3"])
  expect(
    runCF(
      make<CFRow>().pipe(
        where("nested.kind", "k2"),
        and("nested.v", "gt", 0)
      )
    )
  )
    .toEqual(["2"])
})

it("codeFilter: array length predicates", () => {
  expect(runCF(make<CFRow>().pipe(where("tags.length", 0)))).toEqual(["4"])
  expect(runCF(make<CFRow>().pipe(where("tags.length", "gte", 2))).sort()).toEqual(["1", "3"])
})

it("codeFilter: order + skip + limit applied after filter", () => {
  const q = make<CFRow>().pipe(
    where("tag", "neq", "z"),
    order("qty", "DESC"),
    page({ skip: 1, take: 2 })
  )
  expect(runCF(q)).toEqual(["2", "1"])
})

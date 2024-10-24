import { Effect, flow, Layer, ManagedRuntime, S } from "effect-app"
import { and, one, page, where } from "../src/services/query.js"
import { makeRepo } from "../src/services/RepositoryBase.js"
import { MemoryStoreLive } from "../src/services/Store/Memory.js"

const str = S.Struct({ _tag: S.Literal("string"), value: S.String })
const num = S.Struct({ _tag: S.Literal("number"), value: S.Number })
const someUnion = S.Union(str, num)

export class Something extends S.TaggedClass<Something>()("Something", {
  id: S.StringId.withDefault,
  displayName: S.NonEmptyString255,
  n: S.Date.withDefault,
  union: someUnion.pipe(S.withDefaultConstructor(() => ({ _tag: "string" as const, value: "hi" })))
}) {}

export class SomethingElse extends S.TaggedClass<SomethingElse>()("SomethingElse", {
  id: S.StringId.withDefault,
  banana: S.NonEmptyString255
}) {}

const Union = S.Union(Something, SomethingElse)

export type Union = typeof Union.Type
export namespace Union {
  export type Encoded = Something.Encoded | SomethingElse.Encoded
}

export declare namespace Something {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  export interface Encoded extends S.Schema.Encoded<typeof Something> {}
}

export declare namespace SomethingElse {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  export interface Encoded extends S.Schema.Encoded<typeof SomethingElse> {}
}

const items = [
  new Something({ displayName: S.NonEmptyString255("Verona"), n: new Date("2020-01-01T00:00:00Z") }),
  new Something({ displayName: S.NonEmptyString255("Riley") }),
  new Something({
    displayName: S.NonEmptyString255("Riley"),
    n: new Date("2020-01-01T00:00:00Z"),
    union: { _tag: "number", value: 1 }
  }),
  new SomethingElse({ banana: S.NonEmptyString255("Banana") }),
  new SomethingElse({ banana: S.NonEmptyString255("Banana2") })
]

class SomethingRepo extends Effect.Service<SomethingRepo>()("SomethingRepo", {
  effect: Effect.gen(function*() {
    return yield* makeRepo("Union", Union, {})
  })
}) {
  static readonly Test = Layer
    .effect(
      SomethingRepo,
      Effect.gen(function*() {
        return SomethingRepo.make(yield* makeRepo("Union", Union, { makeInitial: Effect.sync(() => items) }))
      })
    )
    .pipe(
      Layer.provide(MemoryStoreLive)
    )
}

const program = Effect.gen(function*() {
  const somethingRepo = yield* SomethingRepo
  const r = yield* somethingRepo.query(flow(
    where("id", "Verona"),
    and("_tag", "Something"),
    // or(
    //   where("displayName", "Riley"),
    //   and("n", "gt", "2021-01-01T00:00:00Z"), // TODO: work with To type translation, so Date?
    //   and("_tag", "Something")
    // ),
    // order("displayName")
    page({ take: 1 }),
    one
    // one
    // project(S.Struct(Something.pick("id", "displayName")))
  ))
  console.log("$$ result", r)
})

const rt = ManagedRuntime.make(SomethingRepo.Test)
rt.runFork(program)

/* eslint-disable @typescript-eslint/no-explicit-any */
import { expect, expectTypeOf, it } from "@effect/vitest"
import { configureInvalidation, makeQueryKey } from "effect-app/client"
import type { HandlerInput } from "effect-app/client/clientFor"
import * as Effect from "effect-app/Effect"
import * as S from "effect-app/Schema"
import * as Exit from "effect/Exit"
import * as Fiber from "effect/Fiber"
import { TestClock } from "effect/testing"
import * as Atom from "effect/unstable/reactivity/Atom"
import type { CommandFromRequest } from "../src/makeClient.js"
import { combineQueryInvalidators, invalidateQueries } from "../src/mutate.js"
import { useAtomQuery, useAtomSuspense } from "../src/query.js"
import { Something, SomethingElse, SomethingElseReq, SomethingReq, useClient, useExperimental } from "./stubs.js"

const somethingInvalidationResources = {
  Something: {
    GetSomething2: Something.GetSomething2,
    GetSomething2WithDependencies: Something.GetSomething2WithDependencies,
    GetSomething3: Something.GetSomething3,
    GetSomething4: Something.GetSomething4
  }
}

it("TaggedRequestFor .moduleName and request .id / .moduleName", () => {
  expectTypeOf(SomethingReq.moduleName).toEqualTypeOf<"Something">()
  expectTypeOf(SomethingElseReq.moduleName).toEqualTypeOf<"SomethingElse">()

  expectTypeOf(Something.GetSomething2.moduleName).toEqualTypeOf<"Something">()
  expectTypeOf(Something.GetSomething2.id).toEqualTypeOf<"Something.GetSomething2">()
  expectTypeOf(Something.GetSomething2.type).toEqualTypeOf<"query">()
  expectTypeOf(Something.DoSomething.type).toEqualTypeOf<"command">()

  expectTypeOf(SomethingElse.GetSomething2.moduleName).toEqualTypeOf<"SomethingElse">()
  expectTypeOf(SomethingElse.GetSomething2.id).toEqualTypeOf<"SomethingElse.GetSomething2">()

  const invalidates = configureInvalidation<{
    Something: typeof Something
    SomethingElse: typeof SomethingElse
  }>()((queryKey, { Something, SomethingElse }) => [
    { filters: { queryKey } },
    { filters: { queryKey: makeQueryKey(Something.GetSomething2) } },
    { filters: { queryKey: makeQueryKey(SomethingElse.GetSomething2) } }
  ])

  expectTypeOf(invalidates.invalidatesQueries).toBeFunction()
  configureInvalidation<{ Something: typeof Something }>()((_queryKey) => [
    // @ts-expect-error predicate filters are not supported by the atom query engine
    { filters: { predicate: () => true } }
  ])
  configureInvalidation<{ Something: typeof Something }>()((_queryKey, { Something }) => {
    // @ts-expect-error commands are intentionally excluded from configured resources
    void Something.DoSomething
    return []
  })

  const { clientFor } = useClient()
  const client = clientFor(
    Something,
    undefined,
    somethingInvalidationResources
  )

  // only queries, no commands, and no commands who require resources; shouldn't require invalidation resources args!
  clientFor({ GetSomething: Something.GetSomething2 })

  // @ts-expect-error invalidation resources should be required when any command configures them
  clientFor(Something)

  // @ts-expect-error invalidation resources for this module reject extra top-level resources
  clientFor(Something, undefined, { ...somethingInvalidationResources, SomethingElse })

  const doSomethingInvalidation = client.DoSomething.Request.config["invalidatesQueries"]
  if (doSomethingInvalidation) {
    const entries = doSomethingInvalidation(
      ["$Something"],
      somethingInvalidationResources,
      { id: "abc" },
      Exit.succeed(123)
    )
    expect(Array.isArray(entries)).toBe(true)
  }

  const SomethingCommand = SomethingReq.Command

  class TypeInferenceWithSuccess extends SomethingCommand<TypeInferenceWithSuccess>()("TypeInferenceWithSuccess", {
    id: S.String
  }, {
    success: S.FiniteFromString
  }, (_queryKey, _resources, input, result) => {
    expectTypeOf(input).toEqualTypeOf<{ readonly id: string }>()
    expectTypeOf(result).toEqualTypeOf<Exit.Exit<number, never>>()
    return []
  }) {}
  void TypeInferenceWithSuccess

  class TypeInferenceWithoutSuccess extends SomethingCommand<TypeInferenceWithoutSuccess>()(
    "TypeInferenceWithoutSuccess",
    {
      id: S.String
    },
    {},
    (_queryKey, _resources, input, result) => {
      expectTypeOf(input).toEqualTypeOf<{ readonly id: string }>()
      expectTypeOf(result).toEqualTypeOf<Exit.Exit<void, never>>()
      return []
    }
  ) {}
  void TypeInferenceWithoutSuccess

  type MixedResources = {
    Something: typeof Something
    Misc: {
      value: number
      GetSomething2: typeof Something.GetSomething2
    }
  }

  class TypeInferenceResourceFiltering extends SomethingCommand<
    TypeInferenceResourceFiltering,
    MixedResources
  >()("TypeInferenceResourceFiltering", {
    id: S.String
  }, {
    success: S.FiniteFromString
  }, (_queryKey, resources, _input, _result) => {
    expectTypeOf(resources.Something.GetSomething2).toEqualTypeOf<typeof Something.GetSomething2>()
    expectTypeOf(resources.Misc.GetSomething2).toEqualTypeOf<typeof Something.GetSomething2>()

    // @ts-expect-error commands must be filtered from invalidation resources
    void resources.Something.DoSomething
    // @ts-expect-error non-query values must be filtered from invalidation resources
    void resources.Misc.value

    return []
  }) {}
  void TypeInferenceResourceFiltering

  type WithSuccessInvalidation = NonNullable<typeof TypeInferenceWithSuccess.config.invalidatesQueries> // @ts-expect-error input should be required when command payload is non-empty
  ;((_queryKey, _resources) => []) satisfies WithSuccessInvalidation
})

it("clientFor handler shape — props variants", () => {
  const { clientFor } = useClient()
  const client = clientFor(
    Something,
    undefined,
    somethingInvalidationResources
  )
  expect(client).toBeDefined()

  // no-props (no fields): handler is (i: void) => Effect — callable without arg
  expectTypeOf(client.DoNoProps.handler).toBeFunction()
  client.DoNoProps.handler()

  // no-props: request mirrors handler — (i: void) => Effect, callable without arg
  expectTypeOf(client.DoNoProps.request).toBeFunction()
  client.DoNoProps.request()
  // optional-only: any fields → function handler. Input matches `make`, which for
  // fully-optional payload is omittable.
  expectTypeOf(client.DoOptionalOnly.handler).toBeFunction()
  // arg may be omitted entirely
  client.DoOptionalOnly.handler()
  // or supplied with all-optional payload
  client.DoOptionalOnly.handler({})
  client.DoOptionalOnly.handler({ name: "x" })

  // required-only: function, `id` required
  expectTypeOf(client.DoRequiredOnly.handler).toBeFunction()
  client.DoRequiredOnly.handler({ id: "x" })
  // @ts-expect-error id is required
  client.DoRequiredOnly.handler({})
  // @ts-expect-error arg cannot be omitted
  client.DoRequiredOnly.handler()

  // mixed: id required, name optional
  expectTypeOf(client.DoMixed.handler).toBeFunction()
  client.DoMixed.handler({ id: "x" })
  client.DoMixed.handler({ id: "x", name: "y" })
  // @ts-expect-error id required
  client.DoMixed.handler({ name: "y" })
})

it.effect("mutation invalidation awaits the injected query invalidator", () =>
  Effect.gen(function*() {
    const recorded: Array<readonly [string, ReadonlyArray<unknown>]> = []
    const keys = [["$Something"], ["$Something", "GetSomething2"]]
    const queryInvalidator = combineQueryInvalidators(
      { invalidateAndAwait: (keys) => Effect.sync(() => keys.forEach((key) => recorded.push(["atom", key]))) },
      { invalidateAndAwait: (keys) => Effect.sync(() => keys.forEach((key) => recorded.push(["tanstack", key]))) }
    )
    const mutate = invalidateQueries(
      { id: "Something.DoSomething" },
      { queryInvalidation: () => keys },
      queryInvalidator
    )

    const fiber = yield* Effect.forkChild(mutate(Effect.succeed(123), { id: "abc" }))
    yield* TestClock.adjust("1 millis")
    const result = yield* Fiber.join(fiber)

    expect(result).toBe(123)
    expect(recorded).toEqual([
      ["atom", keys[0]],
      ["atom", keys[1]],
      ["tanstack", keys[0]],
      ["tanstack", keys[1]]
    ])
  }))

it("client[Key].Input — extracted input type per props variant", () => {
  const { clientFor } = useClient()
  const client = clientFor(
    Something,
    undefined,
    somethingInvalidationResources
  )

  // Input mirrors HandlerInput<typeof Request> — the same type the handler accepts.
  expectTypeOf(client.GetSomething2.Input).toEqualTypeOf<HandlerInput<typeof Something.GetSomething2>>()
  expectTypeOf(client.GetSomething3.Input).toEqualTypeOf<HandlerInput<typeof Something.GetSomething3>>()
  // GetSomething4: no fields → void
  expectTypeOf(client.GetSomething4.Input).toBeVoid()
  expectTypeOf(client.GetSomething4.Input).toEqualTypeOf<HandlerInput<typeof Something.GetSomething4>>()

  // commands — props variants
  expectTypeOf(client.DoNoProps.Input).toBeVoid()
  expectTypeOf(client.DoNoProps.Input).toEqualTypeOf<HandlerInput<typeof Something.DoNoProps>>()
  expectTypeOf(client.DoOptionalOnly.Input).toEqualTypeOf<HandlerInput<typeof Something.DoOptionalOnly>>()
  expectTypeOf(client.DoRequiredOnly.Input).toEqualTypeOf<HandlerInput<typeof Something.DoRequiredOnly>>()
  expectTypeOf(client.DoMixed.Input).toEqualTypeOf<HandlerInput<typeof Something.DoMixed>>()
  expectTypeOf(client.DoSomething.Input).toEqualTypeOf<HandlerInput<typeof Something.DoSomething>>()

  // Sanity: a non-trivial handler Input matches the handler's parameter type
  type HandlerArg = Parameters<typeof client.DoMixed.handler>[0]
  expectTypeOf<typeof client.DoMixed.Input>().toEqualTypeOf<HandlerArg>()

  // Stream handlers — Input now extracts via RequestStreamHandlerWithInput fallback.
  expectTypeOf(client.StreamWithoutFinal.Input).toEqualTypeOf<
    { readonly id: string; readonly _tag?: "StreamWithoutFinal" }
  >()
  expectTypeOf(client.StreamWithFinal.Input).toEqualTypeOf<{ readonly id: string; readonly _tag?: "StreamWithFinal" }>()
})

it("CommandFromRequest input shape — props variants", () => {
  type NoPropsArg = Parameters<CommandFromRequest<typeof Something.DoNoProps>["handle"]>[0]

  // no-props (no fields) → void input; void parameter is implicitly optional, so handle() works
  expectTypeOf<NoPropsArg>().toBeVoid()

  // type-only assignability checks for the remaining variants
  if (false as boolean) {
    const noProps = null as unknown as CommandFromRequest<typeof Something.DoNoProps>
    const optOnly = null as unknown as CommandFromRequest<typeof Something.DoOptionalOnly>
    const reqOnly = null as unknown as CommandFromRequest<typeof Something.DoRequiredOnly>
    const mixed = null as unknown as CommandFromRequest<typeof Something.DoMixed>

    // no-props → void param, calling without args is fine
    noProps.handle()

    // optional-only → matches `make` (fully optional, arg omittable)
    optOnly.handle()
    optOnly.handle({})
    optOnly.handle({ name: "x" })

    // required-only → id required
    reqOnly.handle({ id: "x" })
    // @ts-expect-error id required
    reqOnly.handle({})

    // mixed → id required, name optional
    mixed.handle({ id: "x" })
    mixed.handle({ id: "x", name: "y" })
    // @ts-expect-error id required
    mixed.handle({ name: "y" })
  }
})

it.skip("query type tests", () => {
  const { clientFor } = useClient()
  const client = clientFor(
    Something,
    () => ({
      GetSomething2WithDependencies: (queryKey) => [
        { filters: { queryKey } },
        {
          filters: {
            queryKey: makeQueryKey(
              SomethingElse
                .GetSomething2
            )
          }
        }
      ]
    }),
    somethingInvalidationResources
  )

  const q = client.GetSomething2.query

  const [, z] = q({ id: "a" })
  const valz = z.value
  expectTypeOf(valz).toEqualTypeOf<number | undefined>()

  const [, a] = q({ id: "a" }, { placeholderData: () => 123 })
  const val1 = a.value
  expectTypeOf(val1).toEqualTypeOf<number>()

  const [, bbbb] = q({ id: "a" }, { select: (data) => data.toString() })
  const val = bbbb.value
  expectTypeOf(val).toEqualTypeOf<string | undefined>()

  const [, ccc] = q({ id: "a" }, { placeholderData: () => 123, select: (data) => data.toString() })
  const val2 = ccc.value
  expectTypeOf(val2).toEqualTypeOf<string>()

  const [, ddd] = q({ id: "a" }, { initialData: 123, select: (data) => data.toString() })
  const val3 = ddd.value
  expectTypeOf(val3).toEqualTypeOf<string>()

  const [, eee] = q({ id: "a" }, { initialData: 123, placeholderData: () => 123, select: (data) => data.toString() })
  const val4 = eee.value
  expectTypeOf(val4).toEqualTypeOf<string>()
})

it("additive atom query api type tests", () => {
  const { clientFor } = useClient()
  const client = clientFor(
    Something,
    undefined,
    somethingInvalidationResources
  )

  if (false as boolean) {
    const family = client.GetSomething2.family
    const familyAtom = family({ id: "a" })
    expectTypeOf<Atom.Success<typeof familyAtom>>().toEqualTypeOf<number>()

    const mappedFamilyAtom = Atom.mapResult(familyAtom, (data) => data.toString())
    expectTypeOf<Atom.Success<typeof mappedFamilyAtom>>().toEqualTypeOf<string>()
    expectTypeOf(useAtomQuery(() => mappedFamilyAtom).data.value).toEqualTypeOf<string | undefined>()
    useAtomSuspense(() => mappedFamilyAtom).then((view) => {
      expectTypeOf(view[1].value).toEqualTypeOf<string>()
      return view
    })

    const atom = client.GetSomething2.atom({ id: "a" })
    expectTypeOf<Atom.Success<typeof atom>>().toEqualTypeOf<number>()
    // @ts-expect-error raw atom exposure does not accept Vue select projections
    client.GetSomething2.atom({ id: "a" }, { select: (data) => data.toString() })

    const query = client.GetSomething2.queryNew({ id: "a" })
    expectTypeOf(query.data.value).toEqualTypeOf<number | undefined>()

    const selected = client.GetSomething2.queryNew({ id: "a" }, { select: (data) => data.toString() })
    expectTypeOf(selected.data.value).toEqualTypeOf<string | undefined>()

    client.GetSomething2.suspenseNew({ id: "a" }, { select: (data) => data.toString() }).then((view) => {
      expectTypeOf(view[1].value).toEqualTypeOf<string>()
      return view
    })

    const projected = client.GetSomething2.project(S.String)
    const projectedFamilyAtom = projected.family({ id: "a" })
    expectTypeOf<Atom.Success<typeof projectedFamilyAtom>>().toEqualTypeOf<string>()
    const projectedAtom = projected.atom({ id: "a" })
    expectTypeOf<Atom.Success<typeof projectedAtom>>().toEqualTypeOf<string>()
    expectTypeOf(projected.queryNew({ id: "a" }).data.value).toEqualTypeOf<string | undefined>()
    projected.suspenseNew({ id: "a" }).then((view) => {
      expectTypeOf(view[1].value).toEqualTypeOf<string>()
      return view
    })

    const helperFamilyAtom = client.helpers.getSomething2QueryFamily({ id: "a" })
    expectTypeOf<Atom.Success<typeof helperFamilyAtom>>().toEqualTypeOf<number>()
    expectTypeOf(client.helpers.getSomething2QueryNew({ id: "a" }).data.value).toEqualTypeOf<number | undefined>()
    client.helpers.getSomething2SuspenseQueryNew({ id: "a" }).then((view) => {
      expectTypeOf(view[1].value).toEqualTypeOf<number>()
      return view
    })
  }

  expect(true).toBe(true)
})

it.skip("works", () => {
  const { clientFor } = useClient()
  const client = clientFor(Something, undefined, somethingInvalidationResources)
  const Command = useExperimental()

  // just for jsdoc / type testing.
  const a0 = client.GetSomething2.request(null as any)
  const a00 = client.DoSomething.mutate(null as any)
  const a = client.GetSomething2.suspense(null as any)
  const b = client.GetSomething2.query(null as any)

  const de = client.GetSomething3.handler(null as any)
  const de2 = client.GetSomething3.handler({ id: null })

  const de3 = client.GetSomething4.handler()
  void client.GetSomething4.handler

  // @ts-expect-error query requests no longer expose command helpers
  const e = client.GetSomething2.wrap(null as any)
  // @ts-expect-error query requests no longer expose command helpers
  const f = client.GetSomething2.fn(null as any)

  // @ts-expect-error query requests no longer expose command helpers
  const e0 = client.GetSomething2WithDependencies.wrap
  // @ts-expect-error query request does not match Command.wrap mutation signature
  const e000 = Command.wrap(client.GetSomething2WithDependencies)
  const e00 = client.GetSomething2WithDependencies.request(null as any)
  // @ts-expect-error dependencies required that are not provided
  const e1 = client.GetSomething2WithDependencies.suspense(null as any)
  // @ts-expect-error dependencies required that are not provided
  const e2 = client.GetSomething2WithDependencies.query(null as any)
  // @ts-expect-error query requests no longer expose command helpers
  const f0 = client.GetSomething2WithDependencies.fn(null as any)

  const g0 = client.DoSomething.wrap(null as any)
  const g = client.DoSomething.mutate.wrap(null as any)
  const g1 = client.DoSomething.mutate.project(S.String)
  const g2 = g1(null as any)
  const g3 = g1.wrap(null as any)
  const g4 = client.helpers.doSomethingMutation.project(S.String)
  const g5 = g4(null as any)
  const g6 = g4.wrap(null as any)
  const h = client.DoSomething.mutate.fn(null as any)

  // projection
  // GetSomething2 uses FiniteFromString, that means Codec is String -> Number
  // when we project that to S.String, it should work as the encoded shapes are identical
  // aka, when we project, we skip decoding with the original codec, and instead use the provided one
  // we have to make sure the Encoded shape of the provided projection schema matches the Encoded Shape of the original codec.
  const projected = client.GetSomething2.project(S.String)
  // @ts-expect-error encoded type mismatch: original encodes to string, S.Number encodes to number
  client.GetSomething2.project(S.Number)
  const p0 = projected.request(null as any)

  // struct example: success schema encodes to { a: string | null }
  // good: projection schema also expects { a: string | null } on the encoded side
  const projectedStruct = client.GetStructNullable.project(S.Struct({ a: S.NullOr(S.String) }))
  // bad: { a: S.String } has encoded type { a: string } — does not accept null
  // @ts-expect-error encoded type mismatch: original encodes to { a: string | null }, projection expects { a: string }
  client.GetStructNullable.project(S.Struct({ a: S.String }))

  const p00 = projected.query(null as any)
  const p = projected.suspense(null as any)

  expect(true).toBe(true)
  console.log({
    a,
    a0,
    a00,
    b,
    e,
    de,
    de2,
    de3,
    e0,
    e00,
    e000,
    e1,
    e2,
    f,
    f0,
    g0,
    g,
    g1,
    g2,
    g3,
    g4,
    g5,
    g6,
    h,
    p0,
    p00,
    p,
    projectedStruct
  })
})

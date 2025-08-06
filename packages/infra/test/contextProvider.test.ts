/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { expectTypeOf, it } from "@effect/vitest"
import { Context, Effect, Scope } from "effect-app"
import { ContextProvider, mergeContextProviders, MergedContextProvider } from "../src/api/ContextProvider.js"
import { CustomError1, Some, SomeElse, SomeService } from "./fixtures.js"

// @effect-diagnostics-next-line missingEffectServiceDependency:off
class MyContextProvider extends Effect.Service<MyContextProvider>()("MyContextProvider", {
  effect: Effect.gen(function*() {
    yield* SomeService
    if (Math.random() > 0.5) return yield* new CustomError1()

    return Effect.gen(function*() {
      // the only requirements you can have are the one provided by HttpRouter.HttpRouter.Provided
      yield* Scope.Scope

      yield* Effect.logInfo("MyContextProviderGen", "this is a generator")
      yield* Effect.succeed("this is a generator")

      // this is allowed here but mergeContextProviders/MergedContextProvider will trigger an error
      // yield* SomeElse

      // currently the effectful context provider cannot trigger an error when building the per request context
      // this is allowed here but mergeContextProviders/MergedContextProvider will trigger an error
      // if (Math.random() > 0.5) return yield* new CustomError2()

      return Context.make(Some, new Some({ a: 1 }))
    })
  })
}) {}

// @effect-diagnostics-next-line missingEffectServiceDependency:off
class MyContextProvider2 extends Effect.Service<MyContextProvider2>()("MyContextProvider2", {
  effect: Effect.gen(function*() {
    if (Math.random() > 0.5) return yield* new CustomError1()

    return Effect.gen(function*() {
      // we test without dependencies, so that we end up with an R of never.

      return Context.make(SomeElse, new SomeElse({ b: 2 }))
    })
  })
}) {}

// @effect-diagnostics-next-line missingEffectServiceDependency:off
class MyContextProvider2Gen extends Effect.Service<MyContextProvider2Gen>()("MyContextProvider2Gen", {
  effect: Effect.gen(function*() {
    if (Math.random() > 0.5) return yield* new CustomError1()

    return function*() {
      // we test without dependencies, so that we end up with an R of never

      return Context.make(SomeElse, new SomeElse({ b: 2 }))
    }
  })
}) {}

// @effect-diagnostics-next-line missingEffectServiceDependency:off
class MyContextProviderGen extends Effect.Service<MyContextProviderGen>()("MyContextProviderGen", {
  effect: Effect.gen(function*() {
    yield* SomeService
    if (Math.random() > 0.5) return yield* new CustomError1()

    return function*() {
      // the only requirements you can have are the one provided by HttpRouter.HttpRouter.Provided
      yield* Scope.Scope

      yield* Effect.logInfo("MyContextProviderGen", "this is a generator")
      yield* Effect.succeed("this is a generator")

      // this is allowed here but mergeContextProviders/MergedContextProvider will trigger an error
      // yield* SomeElse

      // currently the effectful context provider cannot trigger an error when building the per request context
      // this is allowed here but mergeContextProviders/MergedContextProvider will trigger an error
      // if (Math.random() > 0.5) return yield* new CustomError2()
      return Context.make(Some, new Some({ a: 1 }))
    }
  })
}) {}

// @effect-diagnostics-next-line missingEffectServiceDependency:off
export const someContextProvider = ContextProvider({
  effect: Effect.gen(function*() {
    yield* SomeService
    if (Math.random() > 0.5) return yield* new CustomError1()

    return Effect.gen(function*() {
      // the only requirements you can have are the one provided by HttpRouter.HttpRouter.Provided
      yield* Scope.Scope

      // not allowed
      // yield* SomeElse

      // currently the effectful context provider cannot trigger an error when building the per request context
      // if (Math.random() > 0.5) return yield* new CustomError2()

      return Context.make(Some, new Some({ a: 1 }))
    })
  })
})
export const someContextProviderGen = ContextProvider({
  effect: Effect.gen(function*() {
    yield* SomeService
    if (Math.random() > 0.5) return yield* new CustomError1()

    return function*() {
      // the only requirements you can have are the one provided by HttpRouter.HttpRouter.Provided
      yield* Scope.Scope

      // not allowed
      // yield* SomeElse

      // currently the effectful context provider cannot trigger an error when building the per request context
      // if (Math.random() > 0.5) return yield* new CustomError2()

      return Context.make(Some, new Some({ a: 1 }))
    }
  })
})

it("works", () => {
  expectTypeOf(someContextProvider).toEqualTypeOf<typeof someContextProviderGen>()

  const merged = mergeContextProviders(MyContextProvider)
  const mergedGen = mergeContextProviders(MyContextProviderGen)

  const contextProvider2 = ContextProvider(merged)
  const contextProvider3 = MergedContextProvider(MyContextProvider)
  expectTypeOf(contextProvider2).toEqualTypeOf<typeof someContextProvider>()
  expectTypeOf(contextProvider3).toEqualTypeOf<typeof contextProvider2>()

  const contextProvider2Gen = ContextProvider(mergedGen)
  const contextProvider3Gen = MergedContextProvider(MyContextProviderGen)
  expectTypeOf(contextProvider2Gen).toEqualTypeOf<typeof someContextProvider>()
  expectTypeOf(contextProvider3Gen).toEqualTypeOf<typeof contextProvider2Gen>()

  expectTypeOf(contextProvider2Gen).toEqualTypeOf<typeof contextProvider2>()
  expectTypeOf(contextProvider3Gen).toEqualTypeOf<typeof contextProvider3>()

  const merged2 = mergeContextProviders(MyContextProvider, MyContextProvider2)
  const contextProvider22 = ContextProvider(merged2)
  const contextProvider23 = MergedContextProvider(MyContextProvider, MyContextProvider2)
  expectTypeOf(contextProvider23).toEqualTypeOf<typeof contextProvider22>()

  const merged2Gen = mergeContextProviders(MyContextProviderGen, MyContextProvider2Gen)
  const contextProvider22Gen = ContextProvider(merged2Gen)
  const contextProvider23Gen = MergedContextProvider(MyContextProviderGen, MyContextProvider2Gen)
  expectTypeOf(contextProvider23Gen).toEqualTypeOf<typeof contextProvider22Gen>()

  expectTypeOf(contextProvider22Gen).toEqualTypeOf<typeof contextProvider22>()
  expectTypeOf(contextProvider23Gen).toEqualTypeOf<typeof contextProvider23>()
})

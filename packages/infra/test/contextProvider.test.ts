/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { expectTypeOf, it } from "@effect/vitest"
import { Context, Effect, Layer, Scope } from "effect-app"
import { ContextProvider, mergeContextProviders, MergedContextProvider } from "../src/api/ContextProvider.js"
import { CustomError1, Some, SomeElse, SomeService } from "./fixtures.js"

// @effect-diagnostics-next-line missingEffectServiceDependency:off
class MyContextProvider extends Context.Service<MyContextProvider>()(
  "MyContextProvider",
  {
    make: Effect.gen(function*() {
      yield* SomeService
      if (Math.random() > 0.5) return yield* new CustomError1()

      return Effect.gen(function*() {
        // the only requirements you can have are the one provided by HttpLayerRouter.Provided
        yield* Scope.Scope

        yield* Effect.logInfo("MyContextProviderGen", "this is a generator")
        yield* Effect.succeed("this is a generator")

        return Some.context({ a: 1 })
      })
    })
  }
) {
  static readonly Default = Layer.effect(this, this.make)
}

class MyContextProvider2 extends Context.Service<MyContextProvider2>()(
  "MyContextProvider2",
  {
    make: Effect.gen(function*() {
      if (Math.random() > 0.5) return yield* new CustomError1()

      return Effect.gen(function*() {
        // we test without dependencies, so that we end up with an R of never.

        return SomeElse.context({ b: 2 })
      })
    })
  }
) {
  static readonly Default = Layer.effect(this, this.make)
}

class MyContextProvider2Gen extends Context.Service<MyContextProvider2Gen>()(
  "MyContextProvider2Gen",
  {
    make: Effect.gen(function*() {
      if (Math.random() > 0.5) return yield* new CustomError1()

      return function*() {
        // we test without dependencies, so that we end up with an R of never

        return SomeElse.context({ b: 2 })
      }
    })
  }
) {
  static readonly Default = Layer.effect(this, this.make)
}

// @effect-diagnostics-next-line missingEffectServiceDependency:off
class MyContextProviderGen extends Context.Service<MyContextProviderGen>()(
  "MyContextProviderGen",
  {
    make: Effect.gen(function*() {
      yield* SomeService
      if (Math.random() > 0.5) return yield* new CustomError1()

      return function*() {
        // the only requirements you can have are the one provided by HttpLayerRouter.Provided
        yield* Scope.Scope

        yield* Effect.logInfo("MyContextProviderGen", "this is a generator")
        yield* Effect.succeed("this is a generator")

        return Some.context({ a: 1 })
      }
    })
  }
) {
  static readonly Default = Layer.effect(this, this.make)
}

export const someContextProvider = ContextProvider({
  effect: Effect.gen(function*() {
    yield* SomeService
    if (Math.random() > 0.5) return yield* new CustomError1()

    return Effect.gen(function*() {
      // the only requirements you can have are the one provided by HttpLayerRouter.Provided
      yield* Scope.Scope

      // not allowed
      // yield* SomeElse

      // currently the effectful context provider cannot trigger an error when building the per request context
      // if (Math.random() > 0.5) return yield* new CustomError2()

      return Some.context({ a: 1 })
    })
  })
})
export const someContextProviderGen = ContextProvider({
  effect: Effect.gen(function*() {
    yield* SomeService
    if (Math.random() > 0.5) return yield* new CustomError1()

    return function*() {
      // the only requirements you can have are the one provided by HttpLayerRouter.Provided
      yield* Scope.Scope

      // not allowed
      // yield* SomeElse

      // currently the effectful context provider cannot trigger an error when building the per request context
      // if (Math.random() > 0.5) return yield* new CustomError2()

      return Some.context({ a: 1 })
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

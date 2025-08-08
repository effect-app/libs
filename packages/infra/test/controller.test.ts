/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { type MakeContext, type MakeErrors, makeRouter, TypeTestId } from "@effect-app/infra/api/routing"
import { type RpcSerialization } from "@effect/rpc"
import { expect, expectTypeOf, it } from "@effect/vitest"
import { Context, Effect, Layer, S, Scope } from "effect-app"
import { InvalidStateError, makeRpcClient, NotLoggedInError, UnauthorizedError } from "effect-app/client"
import { DefaultGenericMiddlewares, makeMiddleware, Middleware, Tag } from "../src/api/routing/middleware.js"
import { sort } from "../src/api/routing/tsort.js"
import { AllowAnonymous, CustomError1, RequestContextMap, RequireRoles, Some, SomeElse, SomeService, Test } from "./fixtures.js"

// @effect-diagnostics-next-line missingEffectServiceDependency:off
class MyContextProvider extends Middleware.Tag<MyContextProvider>()("MyContextProvider", {
  provides: [Some],
  requires: [SomeElse]
})({
  effect: Effect.gen(function*() {
    yield* SomeService
    if (Math.random() > 0.5) return yield* new CustomError1()

    return Effect.fnUntraced(function*() {
      yield* SomeElse
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
class MyContextProvider3 extends Middleware.Tag<MyContextProvider3>()("MyContextProvider3", {
  provides: [Some],
  requires: [SomeElse]
})({
  dependencies: [Layer.effect(SomeService, SomeService.make)],
  effect: Effect.gen(function*() {
    yield* SomeService
    if (Math.random() > 0.5) return yield* new CustomError1()

    return Effect.fnUntraced(function*() {
      yield* SomeElse
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

expectTypeOf(MyContextProvider3.Default).toEqualTypeOf<Layer.Layer<MyContextProvider3, CustomError1, never>>()

// @effect-diagnostics-next-line missingEffectServiceDependency:off
class MyContextProvider2 extends Middleware.Tag<MyContextProvider2>()("MyContextProvider2", { provides: SomeElse })({
  effect: Effect.gen(function*() {
    if (Math.random() > 0.5) return yield* new CustomError1()

    return Effect.fnUntraced(function*() {
      // we test without dependencies, so that we end up with an R of never.

      return new SomeElse({ b: 2 })
    })
  })
}) {}

//

const Str = Context.GenericTag<"str", "str">("str")

export class BogusMiddleware extends Tag<BogusMiddleware>()("BogusMiddleware", {
  wrap: true
})({
  effect: Effect.gen(function*() {
    yield* Str
    // yield* Effect.context<"test-dep">()
    return ({ next }) =>
      Effect.gen(function*() {
        // yield* Effect.context<"test-dep2">()
        return yield* next
      })
  })
}) {
}

const genericMiddlewares = [
  ...DefaultGenericMiddlewares,
  BogusMiddleware,
  MyContextProvider2
] as const

const middleware = makeMiddleware<RequestContextMap>(RequestContextMap)
  .middleware(
    RequireRoles,
    Test
  )
  // AllowAnonymous provided after RequireRoles so that RequireRoles can access what AllowAnonymous provides
  .middleware(AllowAnonymous)
  .middleware(MyContextProvider)
  .middleware(...genericMiddlewares)

const middlewareBis = makeMiddleware<RequestContextMap>(RequestContextMap)
  .middleware(
    RequireRoles,
    Test
  )
  // testing sideways elimination
  .middleware(AllowAnonymous, MyContextProvider, ...genericMiddlewares)

expectTypeOf(middleware).toEqualTypeOf<typeof middlewareBis>()

const middlewareTrisWip = makeMiddleware<RequestContextMap>(RequestContextMap)
  .middleware(
    MyContextProvider,
    RequireRoles,
    Test
  )[TypeTestId]

expectTypeOf(middlewareTrisWip).toEqualTypeOf<{
  missingDynamicMiddlewares: "allowAnonymous"
  missingContext: SomeElse
}>()

// testing more sideways elimination]
const middlewareQuater = makeMiddleware<RequestContextMap>(RequestContextMap)
  .middleware(
    RequireRoles,
    Test,
    AllowAnonymous,
    MyContextProvider,
    ...genericMiddlewares
  )

expectTypeOf(middleware).toEqualTypeOf<typeof middlewareQuater>()

const middleware2 = makeMiddleware<RequestContextMap>(RequestContextMap)
  .middleware(MyContextProvider)
  .middleware(RequireRoles, Test)
  .middleware(AllowAnonymous)
  .middleware(...DefaultGenericMiddlewares, BogusMiddleware, MyContextProvider2)

export const middleware3 = makeMiddleware<RequestContextMap>(RequestContextMap)
  .middleware(...genericMiddlewares)
  .middleware(AllowAnonymous, RequireRoles)
  .middleware(Test)
  .middleware(BogusMiddleware)

export type RequestConfig = {
  /** Disable authentication requirement */
  allowAnonymous?: true
  /** Control the roles that are required to access the resource */
  allowRoles?: readonly string[]
}
export const { TaggedRequest: Req } = makeRpcClient<RequestConfig, RequestContextMap>({
  allowAnonymous: NotLoggedInError,
  requireRoles: UnauthorizedError,
  test: S.Never
})

export class Eff extends Req<Eff>()("Eff", {}, { success: S.Void }) {}
export class Gen extends Req<Gen>()("Gen", {}, { success: S.Void }) {}

export class DoSomething extends Req<DoSomething>()("DoSomething", {
  id: S.String
}, { success: S.Void }) {}

// const rpc = makeRpc(middleware).pipe(
//   Effect.map(({ effect }) =>
//     effect(
//       DoSomething,
//       Effect.fn(function*(req, headers) {
//         const user = yield* UserProfile // dynamic context
//         const some = yield* Some // context provided by ContextProvider
//         const someservice = yield* SomeService // extraneous service
//         yield* Console.log("DoSomething", req.id, some)
//       })
//     )
//   )
// )

export class GetSomething extends Req<GetSomething>()("GetSomething", {
  id: S.String
}, { success: S.String }) {}

export class GetSomething2 extends Req<GetSomething2>()("GetSomething2", {
  id: S.String
}, { success: S.NumberFromString }) {}

const Something = { Eff, Gen, DoSomething, GetSomething, GetSomething2, meta: { moduleName: "Something" as const } }

export class SomethingService extends Effect.Service<SomethingService>()("SomethingService", {
  dependencies: [],
  effect: Effect.gen(function*() {
    return {}
  })
}) {}

declare const a: {
  (opt: { a: 1 }): void
  (opt: { a: 2 }): void
  (opt: { b: 3 }): void
  (opt: { b: 3 }): void
}

export class SomethingRepo extends Effect.Service<SomethingRepo>()("SomethingRepo", {
  dependencies: [SomethingService.Default],
  effect: Effect.gen(function*() {
    const smth = yield* SomethingService
    console.log({ smth })
    return {}
  })
}) {}

export class SomethingService2 extends Effect.Service<SomethingService2>()("SomethingService2", {
  dependencies: [],
  effect: Effect.gen(function*() {
    return {}
  })
}) {}

export const { Router, matchAll } = makeRouter(middleware, true)

export const r2 = makeRouter(middleware2, true)

const router = Router(Something)({
  dependencies: [
    SomethingRepo.Default,
    SomethingService.Default,
    SomethingService2.Default
  ],
  *effect(match) {
    const repo = yield* SomethingRepo
    const smth = yield* SomethingService
    const smth2 = yield* SomethingService2

    // this gets catched in 'routes' type
    if (Math.random() > 0.5) {
      return yield* new InvalidStateError("ciao")
    }

    console.log({ repo, smth, smth2 })

    return match({
      Eff: () =>
        Effect
          .gen(function*() {
            const some = yield* Some
            return yield* Effect.logInfo("Some", some)
          }),

      *Gen() {
        const some = yield* Some
        return yield* Effect.logInfo("Some", some)
      },
      *GetSomething(req) {
        console.log(req.id)

        const _b = yield* Effect.succeed(false)
        if (_b) {
          //   expected errors here because RequestError is not a valid error for controllers
          // yield* new RequestError(1 as any)
          // return yield* new RequestError(1 as any)
        }
        if (Math.random() > 0.5) {
          return yield* Effect.succeed("12")
        }
        if (!_b) {
          return yield* new UnauthorizedError()
        } else {
          // expected an error here because a boolean is not a string
          // return _b
          return "12"
        }
      },
      DoSomething: {
        *raw() {
          return yield* Effect.succeed(undefined)
        }
      },
      GetSomething2: {
        raw: Some.use(() => Effect.succeed("12"))
      }
    })
  }
})

it("sorts based on requirements", () => {
  const input = [RequireRoles, AllowAnonymous, Test]
  const sorted = sort(input)
  console.dir({ input, sorted }, { depth: 10 })
  expect(sorted).toEqual([AllowAnonymous, RequireRoles, Test])
})

// eslint-disable-next-line unused-imports/no-unused-vars
const matched = matchAll({ router })
expectTypeOf({} as Layer.Context<typeof matched>).toEqualTypeOf<
  RpcSerialization.RpcSerialization | SomeService | "str"
>()

type makeContext = MakeContext<typeof router[TypeTestId]>
expectTypeOf({} as MakeErrors<typeof router[TypeTestId]>).toEqualTypeOf<InvalidStateError>()
expectTypeOf({} as makeContext).toEqualTypeOf<
  SomethingService | SomethingRepo | SomethingService2
>()

const router2 = r2.Router(Something)({
  *effect(match) {
    return match({
      Eff: () =>
        Effect
          .gen(function*() {
            const some = yield* Some
            return yield* Effect.logInfo("Some", some)
          }),

      *Gen() {
        const some = yield* Some
        return yield* Effect.logInfo("Some", some)
      },
      *GetSomething(req) {
        console.log(req.id)

        const _b = yield* Effect.succeed(false)
        if (_b) {
          //   expected errors here because RequestError is not a valid error for controllers
          // yield* new RequestError(1 as any)
          // return yield* new RequestError(1 as any)
        }
        if (Math.random() > 0.5) {
          return yield* Effect.succeed("12")
        }
        if (!_b) {
          return yield* new UnauthorizedError()
        } else {
          // expected an error here because a boolean is not a string
          // return _b
          return "12"
        }
      },
      DoSomething: {
        *raw() {
          return yield* Effect.succeed(undefined)
        }
      },
      GetSomething2: {
        raw: Some.use(() => Effect.succeed("12"))
      }
    })
  }
})

// eslint-disable-next-line unused-imports/no-unused-vars
const matched2 = matchAll({ router: router2 })
expectTypeOf({} as Layer.Context<typeof matched2>).toEqualTypeOf<
  RpcSerialization.RpcSerialization | SomeService | "str"
>()

type makeContext2 = MakeContext<typeof router2[TypeTestId]>
expectTypeOf({} as makeContext2).toEqualTypeOf<never>()

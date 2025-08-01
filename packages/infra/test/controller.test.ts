/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { type MakeContext, type MakeErrors, makeRouter } from "@effect-app/infra/api/routing"
import type { RequestContext } from "@effect-app/infra/RequestContext"
import { expect, expectTypeOf, it } from "@effect/vitest"
import { type Array, Context, Effect, Layer, Option, S } from "effect-app"
import { InvalidStateError, makeRpcClient, type RPCContextMap, UnauthorizedError } from "effect-app/client"
import { HttpServerRequest } from "effect-app/http"
import { Class, TaggedError } from "effect-app/Schema"
import { ContextProvider, DefaultGenericMiddlewares, genericMiddleware, implementMiddleware, makeMiddleware, mergeContextProviders, MergedContextProvider } from "../src/api/routing/middleware.js"
import { sort } from "../src/api/routing/tsort.js"
import { SomeService } from "./query.test.js"

class UserProfile extends Context.assignTag<UserProfile, UserProfile>("UserProfile")(
  Class<UserProfile>("UserProfile")({
    id: S.String,
    roles: S.Array(S.String)
  })
) {
}

class NotLoggedInError extends TaggedError<NotLoggedInError>()("NotLoggedInError", {
  message: S.String
}) {}

export class CustomError1 extends TaggedError<NotLoggedInError>()("CustomError1", {}) {}
export class CustomError2 extends TaggedError<NotLoggedInError>()("CustomError1", {}) {}

export interface CTX {
  context: RequestContext
}

export class Some extends Context.TagMakeId("Some", Effect.succeed({ a: 1 }))<Some>() {}
export class SomeElse extends Context.TagMakeId("SomeElse", Effect.succeed({ b: 2 }))<SomeElse>() {}

// @effect-diagnostics-next-line missingEffectServiceDependency:off
export const someContextProvider = ContextProvider({
  effect: Effect.gen(function*() {
    yield* SomeService
    if (Math.random() > 0.5) return yield* new CustomError1()

    return Effect.gen(function*() {
      // the only requirements you can have are the one provided by HttpRouter.HttpRouter.Provided
      yield* HttpServerRequest.HttpServerRequest

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
      yield* HttpServerRequest.HttpServerRequest

      // not allowed
      // yield* SomeElse

      // currently the effectful context provider cannot trigger an error when building the per request context
      // if (Math.random() > 0.5) return yield* new CustomError2()

      return Context.make(Some, new Some({ a: 1 }))
    }
  })
})
expectTypeOf(someContextProvider).toEqualTypeOf<typeof someContextProviderGen>()

// @effect-diagnostics-next-line missingEffectServiceDependency:off
class MyContextProvider extends Effect.Service<MyContextProvider>()("MyContextProvider", {
  effect: Effect.gen(function*() {
    yield* SomeService
    if (Math.random() > 0.5) return yield* new CustomError1()

    return Effect.gen(function*() {
      // the only requirements you can have are the one provided by HttpRouter.HttpRouter.Provided
      yield* HttpServerRequest.HttpServerRequest

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
class MyContextProviderGen extends Effect.Service<MyContextProviderGen>()("MyContextProviderGen", {
  effect: Effect.gen(function*() {
    yield* SomeService
    if (Math.random() > 0.5) return yield* new CustomError1()

    return function*() {
      // the only requirements you can have are the one provided by HttpRouter.HttpRouter.Provided
      yield* HttpServerRequest.HttpServerRequest

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

const merged = mergeContextProviders(MyContextProvider)
const mergedGen = mergeContextProviders(MyContextProviderGen)

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

export const contextProvider2 = ContextProvider(merged)
export const contextProvider3 = MergedContextProvider(MyContextProvider)
expectTypeOf(contextProvider2).toEqualTypeOf<typeof someContextProvider>()
expectTypeOf(contextProvider3).toEqualTypeOf<typeof contextProvider2>()

export const contextProvider2Gen = ContextProvider(mergedGen)
export const contextProvider3Gen = MergedContextProvider(MyContextProviderGen)
expectTypeOf(contextProvider2Gen).toEqualTypeOf<typeof someContextProvider>()
expectTypeOf(contextProvider3Gen).toEqualTypeOf<typeof contextProvider2Gen>()

expectTypeOf(contextProvider2Gen).toEqualTypeOf<typeof contextProvider2>()
expectTypeOf(contextProvider3Gen).toEqualTypeOf<typeof contextProvider3>()

//

const merged2 = mergeContextProviders(MyContextProvider, MyContextProvider2)
export const contextProvider22 = ContextProvider(merged2)
export const contextProvider23 = MergedContextProvider(MyContextProvider, MyContextProvider2)
expectTypeOf(contextProvider23).toEqualTypeOf<typeof contextProvider22>()

const merged2Gen = mergeContextProviders(MyContextProviderGen, MyContextProvider2Gen)
export const contextProvider22Gen = ContextProvider(merged2Gen)
export const contextProvider23Gen = MergedContextProvider(MyContextProviderGen, MyContextProvider2Gen)
expectTypeOf(contextProvider23Gen).toEqualTypeOf<typeof contextProvider22Gen>()

expectTypeOf(contextProvider22Gen).toEqualTypeOf<typeof contextProvider22>()
expectTypeOf(contextProvider23Gen).toEqualTypeOf<typeof contextProvider23>()

//

export type RequestContextMap = {
  allowAnonymous: RPCContextMap.Inverted<UserProfile, typeof NotLoggedInError>
  requireRoles: RPCContextMap.Custom<never, typeof UnauthorizedError, Array<string>>
  test: RPCContextMap<never, typeof S.Never>
}

const Str = Context.GenericTag<"str", "str">("str")
const Str2 = Context.GenericTag<"str2", "str">("str2")

class AllowAnonymous extends Effect.Service<AllowAnonymous>()("AllowAnonymous", {
  effect: Effect.gen(function*() {
    return {
      handle: Effect.fn(function*(opts: { allowAnonymous?: false }, headers: Record<string, string>) {
        yield* HttpServerRequest.HttpServerRequest // provided by HttpRouter.HttpRouter.Provided
        const isLoggedIn = !!headers["x-user"]
        if (!isLoggedIn) {
          if (!opts.allowAnonymous) {
            return yield* new NotLoggedInError({ message: "Not logged in" })
          }
          return Option.none()
        }
        return Option.some(Context.make(
          UserProfile,
          { id: "whatever", roles: ["user", "manager"] }
        ))
      })
    }
  })
}) {}

// @effect-diagnostics-next-line missingEffectServiceDependency:off
class RequireRoles extends Effect.Service<RequireRoles>()("RequireRoles", {
  effect: Effect.gen(function*() {
    yield* Some
    return {
      handle: Effect.fn(
        function*(cfg: { requireRoles?: readonly string[] }, _headers: Record<string, string>) {
          // we don't know if the service will be provided or not, so we use option..
          const userProfile = yield* Effect.serviceOption(UserProfile)
          const { requireRoles } = cfg
          if (requireRoles && !userProfile.value?.roles?.some((role) => requireRoles.includes(role))) {
            return yield* new UnauthorizedError({ message: "don't have the right roles" })
          }
          return Option.none<Context<never>>()
        }
      )
    }
  })
}) {
  static dependsOn = [AllowAnonymous]
}

class Test extends Effect.Service<Test>()("Test", {
  effect: Effect.gen(function*() {
    return {
      handle: Effect.fn(function*(_cfg, _headers) {
        return Option.none<Context<never>>()
      })
    }
  })
}) {}

export class BogusMiddleware extends Effect.Service<BogusMiddleware>()("BogusMiddleware", {
  effect: Effect.gen(function*() {
    return genericMiddleware(Effect.fnUntraced(function*(options) {
      return yield* options.next
    }))
  })
}) {}

const contextProvider = MergedContextProvider(MyContextProvider2, MyContextProvider)

// TODO: eventually it might be nice if we have total control over order somehow..
// [ AddRequestNameToSpanContext, RequestCacheContext, UninterruptibleMiddleware, Dynamic(or individual, AllowAnonymous, RequireRoles, Test - or whichever order) ]
const middleware = makeMiddleware<RequestContextMap>()({
  contextProvider,
  genericMiddlewares: [...DefaultGenericMiddlewares, BogusMiddleware],

  dynamicMiddlewares: {
    requireRoles: RequireRoles,
    allowAnonymous: AllowAnonymous,
    test: Test
  },

  dependencies: [Layer.effect(Str2, Str)],
  execute: (maker) =>
    Effect.gen(function*() {
      return maker(
        (_schema, handler) => (req, headers) =>
          // contextProvider and dynamicMiddlewares are already provided here.
          // aka this runs "last"
          Effect
            .gen(function*() {
              // you can use only HttpRouter.HttpRouter.Provided here as additional context
              // and what ContextProvider provides too
              // const someElse = yield* SomeElse
              yield* Some // provided by ContextProvider
              yield* HttpServerRequest.HttpServerRequest // provided by HttpRouter.HttpRouter.Provided

              return yield* handler(req, headers)
            })
      )
    })
})

const middleware2 = makeMiddleware<RequestContextMap>()({
  // TODO: I guess it makes sense to support just passing array of context providers too, like dynamicMiddlewares?
  contextProvider,
  genericMiddlewares: [...DefaultGenericMiddlewares, BogusMiddleware],
  // or is the better api to use constructors outside, like how contextProvider is used now?
  dynamicMiddlewares: {
    requireRoles: RequireRoles,
    allowAnonymous: AllowAnonymous,
    test: Test
  }
})

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

export const { Router, matchAll, matchFor } = makeRouter(middleware, true)

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
expectTypeOf({} as Layer.Context<typeof matched>).toEqualTypeOf<SomeService | "str">()

type makeContext = MakeContext<typeof router.make>
expectTypeOf({} as MakeErrors<typeof router.make>).toEqualTypeOf<InvalidStateError>()
expectTypeOf({} as makeContext).toEqualTypeOf<
  SomethingService | SomethingRepo | SomethingService2
>()

const router2 = r2.Router(Something)({
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

// eslint-disable-next-line unused-imports/no-unused-vars
const matched2 = matchAll({ router: router2 })
expectTypeOf({} as Layer.Context<typeof matched2>).toEqualTypeOf<SomeService>()

type makeContext2 = MakeContext<typeof router2.make>
expectTypeOf({} as MakeErrors<typeof router2.make>).toEqualTypeOf<InvalidStateError>()
expectTypeOf({} as makeContext2).toEqualTypeOf<
  SomethingService | SomethingRepo | SomethingService2
>()

export const dynamicMiddlewares = implementMiddleware<RequestContextMap>()({
  requireRoles: RequireRoles,
  allowAnonymous: AllowAnonymous,
  test: Test
})

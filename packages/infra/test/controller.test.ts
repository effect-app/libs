/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { type MakeContext, type MakeErrors, makeRouter, RequestCacheLayers } from "@effect-app/infra/api/routing"
import type { RequestContext } from "@effect-app/infra/RequestContext"
import { expect, expectTypeOf, it } from "@effect/vitest"
import { type Array, Context, Effect, Layer, Option, S } from "effect-app"
import { type GetEffectContext, InvalidStateError, makeRpcClient, type RPCContextMap, UnauthorizedError } from "effect-app/client"
import { HttpServerRequest } from "effect-app/http"
import { Class, TaggedError } from "effect-app/Schema"
import { ContextProvider, makeMiddleware, mergeContextProviders, MergedContextProvider } from "../src/api/routing/DynamicMiddleware.js"
import { implementMiddleware } from "./dynamic-middleware.js"
import { SomeService } from "./query.test.js"
import { sort } from "./tsort.js"

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
const contextProvider = ContextProvider({
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

// @effect-diagnostics-next-line missingEffectServiceDependency:off
class MyContextProvider extends Effect.Service<MyContextProvider>()("MyContextProvider", {
  effect: Effect.gen(function*() {
    yield* SomeService
    if (Math.random() > 0.5) return yield* new CustomError1()

    return Effect.gen(function*() {
      // the only requirements you can have are the one provided by HttpRouter.HttpRouter.Provided
      yield* HttpServerRequest.HttpServerRequest

      // this is allowed here but mergeContextProviders/MergedContextProvider will trigger an error
      // yield* SomeElse

      // currently the effectful context provider cannot trigger an error when building the per request context
      // this is allowed here but mergeContextProviders/MergedContextProvider will trigger an error
      // if (Math.random() > 0.5) return yield* new CustomError2()

      return Context.make(Some, new Some({ a: 1 }))
    })
  })
}) {}

const merged = mergeContextProviders(MyContextProvider)
export const contextProvider2 = ContextProvider(merged)
export const contextProvider3 = MergedContextProvider(MyContextProvider)

expectTypeOf(contextProvider2).toEqualTypeOf<typeof contextProvider>()
expectTypeOf(contextProvider3).toEqualTypeOf<typeof contextProvider2>()

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

class RequireRoles extends Effect.Service<RequireRoles>()("RequireRoles", {
  effect: Effect.gen(function*() {
    return {
      handle: Effect.fn(
        function*(cfg: { requireRoles?: readonly string[] }) {
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
      handle: Effect.fn(function*(opts: { test?: true }, headers: Record<string, string>) {
        return Option.none<Context<never>>()
      })
    }
  })
}) {}

const dynamicMiddlewares = implementMiddleware<RequestContextMap>()({
  requireRoles: RequireRoles,
  allowAnonymous: AllowAnonymous,
  test: Test
})

const middleware = makeMiddleware<RequestContextMap>()({
  dependencies: [Layer.effect(Str2, Str), ...dynamicMiddlewares.dependencies],
  contextProvider,
  execute: (maker) =>
    Effect.gen(function*() {
      const buildDynamicContext = yield* dynamicMiddlewares.effect
      return maker((schema, handler, moduleName) => (req, headers) => {
        return Effect
          .gen(function*() {
            yield* Effect.annotateCurrentSpan("request.name", moduleName ? `${moduleName}.${req._tag}` : req._tag)

            const ctx = yield* buildDynamicContext(schema.config ?? {}, headers)

            // you can use only HttpRouter.HttpRouter.Provided here as additional context
            // and what ContextMaker provides too
            // const someElse = yield* SomeElse
            yield* Some // provided by ContextMaker
            yield* HttpServerRequest.HttpServerRequest // provided by HttpRouter.HttpRouter.Provided

            return yield* handler(req, headers).pipe(
              Effect.provide(
                Layer
                  // todo: somehow make it work without having to cast, like buildDynamicContext remains generic
                  .succeedContext(ctx as Context.Context<GetEffectContext<RequestContextMap, typeof schema["config"]>>)
                  .pipe(
                    Layer.provideMerge(RequestCacheLayers)
                  )
              )
              // I do expect the ContextMaker to provide this
              // Effect.provideService(Some, new Some({ a: 1 }))
            )
          })
      })
    })
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
//         const some = yield* Some // context provided by ContextMaker
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

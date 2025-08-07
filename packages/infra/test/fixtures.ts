import { Context, Effect, Option, S, Scope } from "effect-app"
import { NotLoggedInError, RPCContextMap, UnauthorizedError } from "effect-app/client"
import { TaggedError } from "effect-app/Schema"
import { contextMap, getConfig, Middleware } from "../src/api/routing.js"

export class UserProfile extends Context.assignTag<UserProfile, UserProfile>("UserProfile")(
  S.Class<UserProfile>("UserProfile")({
    id: S.String,
    roles: S.Array(S.String)
  })
) {
}

export class Some extends Context.TagMakeId("Some", Effect.succeed({ a: 1 }))<Some>() {}
export class SomeElse extends Context.TagMakeId("SomeElse", Effect.succeed({ b: 2 }))<SomeElse>() {}
const MakeSomeService = Effect.succeed({ a: 1 })
export class SomeService extends Context.TagMakeId("SomeService", MakeSomeService)<SomeService>() {}

export class SomeMiddleware extends Middleware.TagService<SomeMiddleware>()("SomeMiddleware", {
  provides: Some
})({
  effect: Effect.gen(function*() {
    // yield* Effect.context<"test-dep">()
    return () =>
      Effect.gen(function*() {
        return new Some({ a: 1 })
      })
  })
}) {
}

// functionally equivalent to the one above
export class SomeMiddlewareWrap extends Middleware.TagService<SomeMiddlewareWrap>()("SomeMiddlewareWrap", {
  provides: Some,
  wrap: true
})({
  effect: Effect.gen(function*() {
    // yield* Effect.context<"test-dep">()
    return ({ next }) => next.pipe(Effect.provideService(Some, new Some({ a: 1 })))
  })
}) {
}

export class SomeElseMiddleware extends Middleware.TagService<SomeElseMiddleware>()("SomeElseMiddleware", {
  provides: SomeElse,
  wrap: true
})({
  effect: Effect.gen(function*() {
    // yield* Effect.context<"test-dep">()
    return ({ next }) =>
      Effect.gen(function*() {
        // yield* Effect.context<"test-dep2">()
        return yield* next.pipe(Effect.provideService(SomeElse, new SomeElse({ b: 2 })))
      })
  })
}) {
}

const requestConfig = getConfig<RequestContextMap>()

// TODO: null as never sucks
// why [UserProfile] is needed? AllowAnonymous triggers an error if just UserProfile without []
// [] requires return Context, non [] requires return the Service instance
//
// consider if we want to support Context of one Service
export const RequestContextMap = {
  allowAnonymous: RPCContextMap.makeInverted([UserProfile], NotLoggedInError),
  requireRoles: RPCContextMap.makeCustom(null as never, UnauthorizedError, Array<string>()),
  test: RPCContextMap.make(null as never, S.Never)
} as const

type _RequestContextMap = typeof RequestContextMap
export interface RequestContextMap extends _RequestContextMap {}

export class AllowAnonymous extends Middleware.TagService<AllowAnonymous>()("AllowAnonymous", {
  dynamic: contextMap(RequestContextMap, "allowAnonymous"),
  requires: SomeElse
})({
  effect: Effect.gen(function*() {
    return Effect.fnUntraced(
      function*({ headers, rpc }) {
        yield* SomeElse
        yield* Scope.Scope // provided by HttpLayerRouter.Provided
        const isLoggedIn = !!headers["x-user"]
        if (!isLoggedIn) {
          if (!requestConfig(rpc).allowAnonymous) {
            return yield* new NotLoggedInError({ message: "Not logged in" })
          }
          return Option.none()
        }
        return Option.some(
          Context.make(
            UserProfile,
            new UserProfile({
              id: "whatever",
              roles: ["user", ...headers["x-is-manager"] === "true" ? ["manager"] : []]
            })
          )
        )
      }
    )
  })
}) {
}

// TODO: don't expect service when it's wrap
// @effect-diagnostics-next-line missingEffectServiceDependency:off
export class RequireRoles extends Middleware.TagService<RequireRoles>()("RequireRoles", {
  dynamic: contextMap(RequestContextMap, "requireRoles"),
  wrap: true,
  // wrap: true,
  // had to move this in here, because once you put it manually as a readonly static property on the class,
  // there's a weird issue where the fluent api stops behaving properly after adding this middleware via `addDynamicMiddleware`
  dependsOn: [AllowAnonymous]
})({
  effect: Effect.gen(function*() {
    yield* SomeService
    return Effect.fnUntraced(
      function*({ next, rpc }) {
        // we don't know if the service will be provided or not, so we use option..
        const userProfile = yield* Effect.serviceOption(UserProfile)
        const { requireRoles } = requestConfig(rpc)
        console.dir(
          {
            userProfile,
            requireRoles
          },
          { depth: 5 }
        )
        if (requireRoles && !userProfile.value?.roles?.some((role) => requireRoles.includes(role))) {
          return yield* new UnauthorizedError({ message: "don't have the right roles" })
        }
        return yield* next
      }
    )
  })
}) {
}

// TODO: don't expect service when it's wrap
export class Test extends Middleware.TagService<Test>()("Test", {
  wrap: true,
  dynamic: contextMap(RequestContextMap, "test")
})({
  effect: Effect.gen(function*() {
    return Effect.fn(function*({ next }) {
      return yield* next
    })
  })
}) {}

export class CustomError1 extends TaggedError<NotLoggedInError>()("CustomError1", {}) {}
export class CustomError2 extends TaggedError<NotLoggedInError>()("CustomError1", {}) {}

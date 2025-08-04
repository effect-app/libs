import { Context, Effect, Option, S, Scope } from "effect-app"
import { NotLoggedInError, type RPCContextMap, UnauthorizedError } from "effect-app/client"
import { TaggedError } from "effect-app/Schema"
import { contextMap, Middleware } from "../src/api/routing.js"

export class UserProfile extends Context.assignTag<UserProfile, UserProfile>("UserProfile")(
  S.Class<UserProfile>("UserProfile")({
    id: S.String,
    roles: S.Array(S.String)
  })
) {
}

export class Some extends Context.TagMakeId("Some", Effect.succeed({ a: 1 }))<Some>() {}
export class SomeElse extends Context.TagMakeId("SomeElse", Effect.succeed({ b: 2 }))<SomeElse>() {}

export type RequestContextMap = {
  allowAnonymous: RPCContextMap.Inverted<[typeof UserProfile], typeof NotLoggedInError>
  requireRoles: RPCContextMap.Custom<never, typeof UnauthorizedError, Array<string>>
  test: RPCContextMap<never, typeof S.Never>
}

export class AllowAnonymous extends Middleware.Tag<AllowAnonymous>()("AllowAnonymous", {
  dynamic: contextMap<RequestContextMap>()("allowAnonymous", [UserProfile]),
  requires: SomeElse
})({
  effect: Effect.gen(function*() {
    return Effect.fnUntraced(
      function*({ config, headers }) {
        yield* SomeElse
        yield* Scope.Scope // provided by HttpRouter.HttpRouter.Provided
        const isLoggedIn = !!headers["x-user"]
        if (!isLoggedIn) {
          if (!config.allowAnonymous) {
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

// @effect-diagnostics-next-line missingEffectServiceDependency:off
export class RequireRoles extends Middleware.Tag<RequireRoles>()("RequireRoles", {
  dynamic: contextMap<RequestContextMap>()("requireRoles", null as never), // TODO
  wrap: true,
  // wrap: true,
  // had to move this in here, because once you put it manually as a readonly static property on the class,
  // there's a weird issue where the fluent api stops behaving properly after adding this middleware via `addDynamicMiddleware`
  dependsOn: [AllowAnonymous]
})({
  effect: Effect.gen(function*() {
    yield* Some
    return Effect.fnUntraced(
      function*({ config, next }) {
        // we don't know if the service will be provided or not, so we use option..
        const userProfile = yield* Effect.serviceOption(UserProfile)
        const { requireRoles } = config
        console.dir(
          {
            userProfile,
            requireRoles,
            moo: userProfile.value?.roles?.some((role) => requireRoles && requireRoles.includes(role))
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

export class Test extends Middleware.Tag<Test>()("Test", {
  wrap: true,
  dynamic: contextMap<RequestContextMap>()("test", null as never) // TODO
})({
  effect: Effect.gen(function*() {
    return Effect.fn(function*({ next }) {
      return yield* next
    })
  })
}) {}

export class CustomError1 extends TaggedError<NotLoggedInError>()("CustomError1", {}) {}
export class CustomError2 extends TaggedError<NotLoggedInError>()("CustomError1", {}) {}

const MakeSomeService = Effect.succeed({ a: 1 })
export class SomeService extends Context.TagMakeId("SomeService", MakeSomeService)<SomeService>() {}

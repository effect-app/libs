import { Context, Effect, Layer, S, Scope } from "effect-app"
import { NotLoggedInError, UnauthorizedError } from "effect-app/client"
import { RpcContextMap, RpcX } from "effect-app/rpc"
import { TaggedError } from "effect-app/Schema"

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

// functionally equivalent to the one above
export class SomeMiddleware extends RpcX.RpcMiddleware.Tag<SomeMiddleware, { provides: Some }>()("SomeMiddleware") {
}

export const SomeMiddlewareLive = Layer.effect(
  SomeMiddleware,
  Effect.gen(function*() {
    // yield* Effect.context<"test-dep">()
    return (effect) => effect.pipe(Effect.provideService(Some, new Some({ a: 1 })))
  })
)

export class SomeElseMiddleware
  extends RpcX.RpcMiddleware.Tag<SomeElseMiddleware, { provides: SomeElse }>()("SomeElseMiddleware")
{}

export const SomeElseMiddlewareLive = Layer.effect(
  SomeElseMiddleware,
  Effect.gen(function*() {
    // yield* Effect.context<"test-dep">()
    return (effect) =>
      Effect.gen(function*() {
        // yield* Effect.context<"test-dep2">()
        return yield* effect.pipe(Effect.provideService(SomeElse, new SomeElse({ b: 2 })))
      })
  })
)

export class RequestContextMap extends RpcContextMap.makeMap({
  allowAnonymous: RpcContextMap.makeInverted<UserProfile>()(NotLoggedInError),
  requireRoles: RpcContextMap.makeCustom()(UnauthorizedError, Array<string>()),
  test: RpcContextMap.make()(S.Never)
}) {}

export class AllowAnonymous extends RpcX.RpcMiddleware.Tag<AllowAnonymous, { requires: SomeElse }>()("AllowAnonymous", {
  dynamic: RequestContextMap.get("allowAnonymous")
}) {}

export const AllowAnonymousLive = Layer.effect(
  AllowAnonymous,
  Effect.gen(function*() {
    return Effect.fnUntraced(
      function*(effect, { headers, rpc }) {
        yield* SomeElse
        yield* Scope.Scope // provided by HttpLayerRouter.Provided
        const isLoggedIn = !!headers["x-user"]
        if (!isLoggedIn) {
          if (!RequestContextMap.getConfig(rpc).allowAnonymous) {
            return yield* new NotLoggedInError({ message: "Not logged in" })
          }
          return yield* effect
        }
        return yield* Effect.provideService(
          effect,
          UserProfile,
          new UserProfile({
            id: "whatever",
            roles: ["user", ...headers["x-is-manager"] === "true" ? ["manager"] : []]
          })
        )
      }
    )
  })
)

export class RequireRoles extends RpcX.RpcMiddleware.Tag<RequireRoles>()("RequireRoles", {
  dynamic: RequestContextMap.get("requireRoles"),
  // had to move this in here, because once you put it manually as a readonly static property on the class,
  // there's a weird issue where the fluent api stops behaving properly after adding this middleware via `addDynamicMiddleware`
  dependsOn: [AllowAnonymous]
}) {}

export const RequireRolesLive = Layer.effect(
  RequireRoles,
  Effect.gen(function*() {
    yield* SomeService
    return Effect.fnUntraced(
      function*(effect, { rpc }) {
        // we don't know if the service will be provided or not, so we use option..
        const userProfile = yield* Effect.serviceOption(UserProfile)
        const { requireRoles } = RequestContextMap.getConfig(rpc)
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
        return yield* effect
      }
    )
  })
)

export class Test extends RpcX.RpcMiddleware.Tag<Test>()("Test", {
  dynamic: RequestContextMap.get("test")
}) {}

export const TestLive = Layer.effect(
  Test,
  Effect.gen(function*() {
    return Effect.fn(function*(effect) {
      return yield* effect
    })
  })
)

export class CustomError1 extends TaggedError<CustomError1>()("CustomError1", {}) {}
export class CustomError2 extends TaggedError<CustomError2>()("CustomError2", {}) {}

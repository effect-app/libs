import { Context, Effect, Option, Scope } from "effect-app"
import { NotLoggedInError, type RPCContextMap, UnauthorizedError } from "effect-app/client"
import { contextMap, DefaultGenericMiddlewares, makeNewMiddleware, Middleware } from "../src/api/routing.js"
import { UserProfile } from "./controller.test.js"

export type RequestContextMap = {
  allowAnonymous: RPCContextMap.Inverted<UserProfile, typeof NotLoggedInError>
  requireRoles: RPCContextMap.Custom<never, typeof UnauthorizedError, Array<string>>
}

const RequestContextMap = {
  allowAnonymous: "allowAnonymous",
  requireRoles: "requireRoles"
}

export class AllowAnonymous extends Middleware.Tag<AllowAnonymous>()("AllowAnonymous", {
  dynamic: contextMap<RequestContextMap>()("allowAnonymous")
})({
  // dependencies
  effect: Effect.gen(function*() {
    return Effect.fn(function*({ config, headers }) {
      yield* Scope.Scope // provided by HttpRouter.HttpRouter.Provided
      const isLoggedIn = !!headers["x-user"]
      if (!isLoggedIn) {
        if (!config.allowAnonymous) {
          return yield* new NotLoggedInError({ message: "Not logged in" })
        }
        return Option.none()
      }
      return Option.some(Context.make(
        UserProfile,
        { id: "whatever", roles: ["user", "manager"] }
      ))
    })
  })
}) {}

class RequireRoles
  extends Middleware.Tag<RequireRoles>()("RequireRoles", { dynamic: contextMap<RequestContextMap>()("requireRoles") })(
    {
      effect: Effect.gen(function*() {
        // yield* Some
        return Effect.fn(
          function*({ config }) {
            // we don't know if the service will be provided or not, so we use option..
            const userProfile = yield* Effect.serviceOption(UserProfile)
            const { requireRoles } = config
            if (requireRoles && !userProfile.value?.roles?.some((role) => requireRoles.includes(role))) {
              return yield* new UnauthorizedError({ message: "don't have the right roles" })
            }
            return Option.none<Context<never>>()
          }
        )
      })
    }
  )
{
  static dependsOn = [AllowAnonymous]
}

export const middleware = makeNewMiddleware<RequestContextMap>()(
  ...DefaultGenericMiddlewares
  // CurrentSettingsMiddleware,
  // CurrentUserMiddleware,
  // CurrentTimeMiddleware,
)
  .addDynamicMiddleware(AllowAnonymous)
  .addDynamicMiddleware(RequireRoles)
  .make()

import { Context, Effect, Option, Scope } from "effect-app"
import { NotLoggedInError, type RPCContextMap, UnauthorizedError } from "effect-app/client"
import { DefaultGenericMiddlewares, type DynamicMiddlewareMaker, type GenericMiddlewareMaker, Middleware } from "../src/api/routing.js"
import { Some, UserProfile } from "./controller.test.js"

export type RequestContextMap = {
  allowAnonymous: RPCContextMap.Inverted<UserProfile, typeof NotLoggedInError>
  requireRoles: RPCContextMap.Custom<never, typeof UnauthorizedError, Array<string>>
}

const RequestContextMap = {
  allowAnonymous: "allowAnonymous",
  requireRoles: "requireRoles"
}

const contextMap = (a: keyof RequestContextMap) => ({ key: a, settings: null as any as RequestContextMap[typeof a] })

export class AllowAnonymous extends Middleware.Tag<AllowAnonymous>()("AllowAnonymous", {
  dynamic: contextMap("allowAnonymous")
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

class RequireRoles extends Middleware.Tag<AllowAnonymous>()("RequireRoles", { dynamic: contextMap("requireRoles") })({
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

type DynamicMiddlewareMakerrsss = {
  addDynamicMiddleware: (a: DynamicMiddlewareMaker) => DynamicMiddlewareMakerrsss // TODO: any of RequestContecxtMap, and track them, so remove the ones provided
}

declare const makeMiddleware: <
  RequestContextMap extends Record<string, RPCContextMap.Any>
>() => <Middlewares extends Array<GenericMiddlewareMaker>>(
  ...middlewares: Middlewares
) => DynamicMiddlewareMakerrsss

export const middleware = makeMiddleware<RequestContextMap>()(
  ...DefaultGenericMiddlewares
  // CurrentSettingsMiddleware,
  // CurrentUserMiddleware,
  // CurrentTimeMiddleware,
)
  .addDynamicMiddleware(AllowAnonymous)
  .addDynamicMiddleware(RequireRoles)

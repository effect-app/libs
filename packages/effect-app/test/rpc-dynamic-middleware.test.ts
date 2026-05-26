/**
 * Tests for dynamic RPC middleware via the MiddlewareMaker / AppMiddleware pattern,
 * using the standard Effect RPC API (RpcGroup, toLayerDynamic) — no controller pattern.
 */
import { expect, expectTypeOf, it } from "@effect/vitest"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Result from "effect/Result"
import { RpcGroup, RpcTest } from "effect/unstable/rpc"
import { NotLoggedInError, UnauthorizedError } from "../src/client.js"
import * as Context from "../src/Context.js"
import * as RpcX from "../src/rpc.js"
import { RpcContextMap } from "../src/rpc.js"
import * as S from "../src/Schema.js"

// ── Domain service ────────────────────────────────────────────────────────────

class UserProfile extends Context.assignTag<UserProfile, UserProfile>("UserProfile")(
  S.Class<UserProfile>("UserProfile")({
    id: S.String,
    roles: S.Array(S.String)
  })
) {}

// ── RequestContextMap — describes per-route dynamic middleware config ──────────
//
// `makeInverted` → middleware active by default (inverted: provides service unless
//                  route sets `allowAnonymous: true`).
// `makeCustom`   → middleware inactive by default; activated per-route with a value.

class AppRequestContextMap extends RpcContextMap.makeMap({
  allowAnonymous: RpcContextMap.makeInverted<UserProfile>()(NotLoggedInError),
  requireRoles: RpcContextMap.makeCustom()(UnauthorizedError, Array<string>())
}) {}

// ── Dynamic middleware tags ───────────────────────────────────────────────────

class AuthMiddleware extends RpcX.RpcMiddleware.Tag<AuthMiddleware>()("AuthMiddleware", {
  dynamic: AppRequestContextMap.get("allowAnonymous")
}) {}

// RolesMiddleware depends on AuthMiddleware so auth always runs first.
class RolesMiddleware extends RpcX.RpcMiddleware.Tag<RolesMiddleware>()("RolesMiddleware", {
  dynamic: AppRequestContextMap.get("requireRoles"),
  dependsOn: [AuthMiddleware]
}) {}

// ── AppMiddleware — composed MiddlewareMaker ───────────────────────────────────
//
// This is the "AppMiddleware" pattern: a single composed middleware tag that
// bundles all dynamic (and optionally generic) sub-middlewares.  The class
// extends the fluent builder result so it can be used wherever a middleware
// tag is expected.

class AppMiddleware extends RpcX
  .MiddlewareMaker
  .Tag<AppMiddleware>()("AppMiddleware", AppRequestContextMap)
  .middleware(RolesMiddleware)
  .middleware(AuthMiddleware)
{}

// ── RPC group using the standard Effect RPC API ───────────────────────────────
//
// `middlewareGroup` wraps an RpcGroup and attaches `AppMiddleware`, adding
// `toLayerDynamic` which infers the correct per-handler context requirements
// based on each route's `config`.

const UserRpcs = RpcX.MiddlewareMaker.middlewareGroup(AppMiddleware)(
  RpcGroup.make(
    // No config → `allowAnonymous` defaults to false (inverted default) → UserProfile required.
    AppMiddleware.rpc("getProfile", {
      success: S.String
    }),
    // `allowAnonymous: true` disables auth requirement → UserProfile NOT guaranteed.
    AppMiddleware.rpc("getPublic", {
      success: S.String,
      config: { allowAnonymous: true }
    }),
    // `requireRoles` activated → UnauthorizedError possible; auth still runs first.
    AppMiddleware.rpc("getAdminArea", {
      success: S.String,
      config: { requireRoles: ["admin"] }
    })
  )
)

// ── Implementation via standard toLayerDynamic ────────────────────────────────

const impl = UserRpcs.toLayerDynamic({
  // UserProfile is guaranteed by middleware (allowAnonymous defaults to false).
  getProfile: Effect.fn(function*(_payload, _headers) {
    const user = yield* UserProfile
    return user.id
  }),
  getPublic: Effect.fn(function*() {
    return "public" as const
  }),
  getAdminArea: Effect.fn(function*() {
    return "admin-data" as const
  })
})

// ── Type tests ────────────────────────────────────────────────────────────────

// All dynamic context resolved by middleware → Layer.Services must be never.
expectTypeOf<Layer.Services<typeof impl>>().toEqualTypeOf<never>()

// Accessing UserProfile on an allowAnonymous:true route → not guaranteed →
// leaks UserProfile into the layer's requirements (caught at compile time).
export const badImpl = UserRpcs.toLayerDynamic({
  getProfile: Effect.fn(function*() {
    return "ok" as const
  }),
  getPublic: Effect.fn(function*() {
    yield* UserProfile // wrong: allowAnonymous:true, UserProfile not guaranteed
    return "public" as const
  }),
  getAdminArea: Effect.fn(function*() {
    return "admin-data" as const
  })
})
expectTypeOf<Layer.Services<typeof badImpl>>().toEqualTypeOf<UserProfile>()

// ── Middleware live implementations ───────────────────────────────────────────

const AuthMiddlewareLive = Layer.effect(
  AuthMiddleware,
  Effect.gen(function*() {
    return Effect.fnUntraced(function*(effect, { headers, rpc }) {
      const userId = headers["x-user"]
      if (!userId) {
        if (!AppRequestContextMap.getConfig(rpc).allowAnonymous) {
          return yield* new NotLoggedInError("Not logged in")
        }
        return yield* effect
      }
      const roles = headers["x-roles"] ? headers["x-roles"].split(",") : []
      return yield* Effect.provideService(
        effect,
        UserProfile,
        new UserProfile({ id: userId, roles })
      )
    })
  })
)

const RolesMiddlewareLive = Layer.effect(
  RolesMiddleware,
  Effect.gen(function*() {
    return Effect.fnUntraced(function*(effect, { rpc }) {
      const { requireRoles } = AppRequestContextMap.getConfig(rpc)
      if (!requireRoles || requireRoles.length === 0) return yield* effect
      const profile = yield* Effect.serviceOption(UserProfile)
      const hasRole = profile.value?.roles.some((r) => requireRoles.includes(r)) ?? false
      if (!hasRole) return yield* new UnauthorizedError("Forbidden")
      return yield* effect
    })
  })
)

const middlewareLayer = AppMiddleware.layer.pipe(
  Layer.provide([AuthMiddlewareLive, RolesMiddlewareLive])
)

export const TestLayer = Layer.mergeAll(impl, middlewareLayer)

// ── Runtime tests ─────────────────────────────────────────────────────────────

it.live(
  "unauthenticated request to protected route → NotLoggedInError",
  Effect.fnUntraced(
    function*() {
      const client = yield* RpcTest.makeClient(UserRpcs)
      const result = yield* Effect.result(client.getProfile())
      expect(result).toStrictEqual(Result.fail(new NotLoggedInError("Not logged in")))
    },
    Effect.provide(TestLayer)
  )
)

it.live(
  "allowAnonymous route succeeds without auth",
  Effect.fnUntraced(
    function*() {
      const client = yield* RpcTest.makeClient(UserRpcs)
      const result = yield* client.getPublic()
      expect(result).toBe("public")
    },
    Effect.provide(TestLayer)
  )
)

it.live(
  "requireRoles without auth → NotLoggedInError (auth dependsOn runs first)",
  Effect.fnUntraced(
    function*() {
      const client = yield* RpcTest.makeClient(UserRpcs)
      const result = yield* Effect.result(client.getAdminArea())
      expect(result).toStrictEqual(Result.fail(new NotLoggedInError("Not logged in")))
    },
    Effect.provide(TestLayer)
  )
)

import { expectTypeOf, test } from "vitest"
import { makeRpcClient, NotLoggedInError, UnauthorizedError } from "../src/client.js"
import { RpcContextMap } from "../src/rpc.js"

// A stand-in for an app service (e.g. `UserProfile`) that the `allowAnonymous`
// inverted middleware provides into the handler context whenever auth is
// required (i.e. `allowAnonymous` is not `true`).
interface UserProfile {
  readonly _tag: "UserProfile"
}

// Mirrors a real app request-context map: one inverted key providing a service
// by default (unless opted out), and one custom (role) key.
class RequestContextMap extends RpcContextMap.makeMap({
  allowAnonymous: RpcContextMap.makeInverted<UserProfile>()(NotLoggedInError),
  allowRoles: RpcContextMap.makeCustom()(UnauthorizedError, Array<string>())
}) {}

type Map = typeof RequestContextMap.config

// The context a handler receives for a given rpc config — exactly the
// `GetEffectContext<_RC, rpc.config>` the router computes for the handler
// (see `RpcMiddleware.ts`). Testing it against config literals pins down the
// middleware semantics directly.
type CtxFor<Config> = RpcContextMap.GetEffectContext<Map, Config>

test("`GetEffectContext`: the inverted `UserProfile` provision is gated by `allowAnonymous`, not `allowRoles`", () => {
  // Empty config = nothing opted out → auth required → `UserProfile` provided.
  expectTypeOf<CtxFor<{}>>().toEqualTypeOf<UserProfile>()

  // `allowRoles` does not gate `UserProfile` — still provided.
  expectTypeOf<CtxFor<{ allowRoles: ["user"] }>>().toEqualTypeOf<UserProfile>()

  // Negative case: opting into anonymous removes the `UserProfile` provision.
  expectTypeOf<CtxFor<{ allowAnonymous: true }>>().toBeNever()

  // Anonymous wins over roles for the inverted provision.
  expectTypeOf<CtxFor<{ allowAnonymous: true; allowRoles: ["user"] }>>().toBeNever()

  // Regression documentation: a config that collapses to `Record<string, never>`
  // (what the no-config command overload used to produce) WRONGLY drops
  // `UserProfile` — `keyof Record<string, never>` is `string`, so `allowAnonymous`
  // satisfies `key extends keyof T`, and `T["allowAnonymous"]` (`never`) `extends
  // true`, taking the anonymous branch. This is exactly why the overload must
  // yield `{}` (see the command-builder test below).
  expectTypeOf<CtxFor<Record<string, never>>>().toBeNever()
})

// End-to-end guard for the actual fix: a command defined with NO config object
// must still provide `UserProfile` (auth required by default). This exercises the
// no-config `Command` overload, which now yields an empty `{}` config instead of
// `Record<string, never>`.
const { TaggedRequestFor } = makeRpcClient({
  requestContextMap: RequestContextMap.config,
  requestContext: undefined as never
})
const Command = TaggedRequestFor("Test").Command

class NoConfigCmd extends Command<NoConfigCmd>()("NoConfigCmd", {}) {}

test("a no-config command still provides the auth-required `UserProfile` service", () => {
  expectTypeOf<RpcContextMap.GetEffectContext<Map, typeof NoConfigCmd.config>>().toEqualTypeOf<UserProfile>()
})

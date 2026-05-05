import { type Effect, type Option } from "effect"
import { expect, test } from "vitest"
import { makeRpcClient, NotLoggedInError, UnauthorizedError } from "../src/client.js"
import { ForceVoid } from "../src/client/makeClient.js"
import { S } from "../src/index.js"
import { RpcContextMap } from "../src/rpc.js"

export class RequestContextMap extends RpcContextMap.makeMap({
  allowAnonymous: RpcContextMap.makeInverted()(NotLoggedInError),
  requireRoles: RpcContextMap.makeCustom()(UnauthorizedError, Array<string>()),
  test: RpcContextMap.make()(S.Never)
}) {}

const stubMiddleware = {
  requestContextMap: RequestContextMap.config,
  requestContext: undefined as never
}
const { TaggedRequestFor } = makeRpcClient(stubMiddleware)
const TaggedRequest = TaggedRequestFor("Test").Query

export class Stats extends TaggedRequest<Stats>()("Stats", {}, {
  allowedRoles: ["manager"],
  success: {
    usersActive24Hours: S.Finite,
    usersActiveLastWeek: S.Finite,
    newUsersLast24Hours: S.Finite,
    newUsersLastWeek: S.Finite
  }
}) {}

declare const _stats: typeof Stats.Type
declare const _statsSuccess: typeof Stats.success.Type
declare const _statsError: typeof Stats.error.Type
declare const _statsRequestType: typeof Stats.type

test("ForceVoid decodes and encodes as void", () => {
  const statsFromMake = Stats.make({})
  const statsFromMakeOption = Stats.makeOption({})
  const statsFromMakeEffect = Stats.makeEffect({})

  expect(S.decodeUnknownSync(ForceVoid)(undefined)).toBe(undefined)
  expect(S.is(ForceVoid)(undefined)).toBe(true)
  expect(S.decodeUnknownSync(ForceVoid)("test")).toBe(undefined)
  expect(S.is(ForceVoid)("test")).toBe(true)
  expect(S.encodeUnknownSync(ForceVoid)("test")).toBe(undefined)
  expect(S.encodeUnknownSync(S.toCodecJson(ForceVoid))("test")).toBe(null)
  expectTypeOf<typeof _stats>().toEqualTypeOf<Stats>()
  expectTypeOf<typeof _statsSuccess>().toEqualTypeOf<{
    readonly usersActive24Hours: number
    readonly usersActiveLastWeek: number
    readonly newUsersLast24Hours: number
    readonly newUsersLastWeek: number
  }>()
  // Resource error carries only `config.error` (and optional `generalErrors`); rcm-derived
  // middleware errors no longer leak into `resource.error` — they reach the wire via the
  // middleware tag attached to the rpc group (`rpc.middlewares[*].error` failure-union).
  expectTypeOf<typeof _statsError>().toEqualTypeOf<never>()
  expectTypeOf<typeof _statsRequestType>().toEqualTypeOf<"query">()
  expectTypeOf(statsFromMake).toEqualTypeOf<Stats>()
  expectTypeOf(statsFromMakeOption).toEqualTypeOf<Option.Option<Stats>>()
  expectTypeOf(statsFromMakeEffect).toEqualTypeOf<Effect.Effect<Stats, S.SchemaError>>()
})

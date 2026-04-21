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

const { TaggedRequestFor } = makeRpcClient(RequestContextMap)
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
  expectTypeOf<typeof _statsError>().toEqualTypeOf<NotLoggedInError | UnauthorizedError>()
  expectTypeOf<typeof _statsRequestType>().toEqualTypeOf<"query">()
})

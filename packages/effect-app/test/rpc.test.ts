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

const { TaggedRequest } = makeRpcClient(RequestContextMap)

export class Stats extends TaggedRequest<Stats>()("Stats", {}, {
  allowedRoles: ["manager"],
  success: {
    usersActive24Hours: S.Number,
    usersActiveLastWeek: S.Number,
    newUsersLast24Hours: S.Number,
    newUsersLastWeek: S.Number
  }
}) {}

declare const _stats: typeof Stats.success.Type

test("ForceVoid decodes and encodes as void", () => {
  expect(S.decodeUnknownSync(ForceVoid)(undefined)).toBe(undefined)
  expect(S.is(ForceVoid)(undefined)).toBe(true)
  expect(S.decodeUnknownSync(ForceVoid)("test")).toBe(undefined)
  expect(S.is(ForceVoid)("test")).toBe(true)
  expect(S.encodeUnknownSync(ForceVoid)("test")).toBe(undefined)
  expect(S.encodeUnknownSync(S.toCodecJson(ForceVoid))("test")).toBe(null)
})

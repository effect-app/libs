import { makeRpcClient, NotLoggedInError, UnauthorizedError } from "../src/client.js"
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

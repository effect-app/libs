import { makeRpcClient, NotLoggedInError, UnauthorizedError } from "../src/client.js"
import { S } from "../src/index.js"
import { RpcContextMap } from "../src/rpc.js"

export class RequestContextMap extends RpcContextMap.makeMap({
  allowAnonymous: RpcContextMap.makeInverted()(NotLoggedInError),
  requireRoles: RpcContextMap.makeCustom()(UnauthorizedError, Array<string>()),
  test: RpcContextMap.make()(S.Never)
}) {}

const { rpc } = makeRpcClient(RequestContextMap)

export const Stats = rpc("Stats", {}, {
  requireRoles: ["manager"],
  success: S.Struct({
    usersActive24Hours: S.Number,
    usersActiveLastWeek: S.Number,
    newUsersLast24Hours: S.Number,
    newUsersLastWeek: S.Number
  })
})

declare const _stats: S.Schema.Type<typeof Stats["success"]>

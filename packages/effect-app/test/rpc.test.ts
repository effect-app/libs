import { makeRpcClient } from "../src/client/req.js"
import { S } from "../src/index.js"

const { TaggedRequest } = makeRpcClient({})

export class Stats extends TaggedRequest<Stats>()("Stats", {}, {
  allowedRoles: ["manager"],
  success: {
    usersActive24Hours: S.Number,
    usersActiveLastWeek: S.Number,
    newUsersLast24Hours: S.Number,
    newUsersLastWeek: S.Number
  }
}) {}

declare const stats: typeof Stats.success.Type
console.log(stats.usersActiveLastWeek)

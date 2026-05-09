import { describe, expect, test } from "vitest"
import { isRpcRequest } from "../src/api/internal/RequestContextMiddleware.js"
import { isRpcServerRequestForModule, rpcServerSpanPrefix } from "../src/api/routing.js"

describe("rpc tracing server config", () => {
  test("uses non-duplicating RpcServer span prefix", () => {
    expect(`${rpcServerSpanPrefix}.Users.list`).toBe("RpcServer.Users.list")
  })

  test("matches rpc server requests by module path", () => {
    expect(isRpcServerRequestForModule("Users", "/rpc/Users?action=list")).toBe(true)
    expect(isRpcServerRequestForModule("Users", "/rpc/Other?action=list")).toBe(false)
  })

  test("identifies rpc request urls for request-context span suppression", () => {
    expect(isRpcRequest("/rpc/Users", "/rpc/Users?action=list")).toBe(true)
    expect(isRpcRequest("/api/Users", "/api/Users?action=list")).toBe(false)
  })
})

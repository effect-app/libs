import { describe, expect, test } from "vitest"
import { isRpcHttpClientRequest, rpcClientSpanPrefix } from "../src/client/apiClientFactory.js"
import { HttpClientRequest } from "../src/http.js"

describe("rpc tracing client config", () => {
  test("uses non-duplicating RpcClient span prefix", () => {
    expect(`${rpcClientSpanPrefix}.Users.list`).toBe("RpcClient.Users.list")
  })

  test("disables HTTP transport tracing only for rpc requests", () => {
    const rpcRequest = HttpClientRequest.post("/api/rpc/Users?action=list")
    const nonRpcRequest = HttpClientRequest.post("/api/health")

    expect(isRpcHttpClientRequest(rpcRequest)).toBe(true)
    expect(isRpcHttpClientRequest(nonRpcRequest)).toBe(false)
  })
})

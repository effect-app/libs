---
"effect-app": patch
"@effect-app/infra": patch
---

Compact RPC trace topology by removing duplicated module names from RPC span prefixes (`RpcClient.<module>.<method>`, `RpcServer.<module>.<method>`), suppressing RPC request-context URL spans, and disabling HTTP transport spans for RPC paths while promoting key HTTP request attributes onto RPC spans.

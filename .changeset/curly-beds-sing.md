---
"@effect-app/infra": patch
---

Use request-type RPC annotations to drive interruptibility and retry behavior, apply command uninterruptibility through the router wrapper path, and add an in-memory E2E test covering command vs query interruption behavior.

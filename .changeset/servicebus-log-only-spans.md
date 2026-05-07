---
"@effect-app/infra": patch
---

Drop OTel spans from ServiceBus client/sender/receiver/subscription lifecycle wrappers; keep `withLogSpan` + info logs only. Removes high-cardinality `sessionId` from log span names; promotes it to `messaging.session.id` log attribute via `Effect.annotateLogs`.

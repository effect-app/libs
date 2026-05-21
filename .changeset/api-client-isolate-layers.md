---
"effect-app": patch
---

Isolate per-call `Effect.provide(layers)` / `Stream.provide(layers)` in the
RPC api client factory via `{ local: true }`.

`layers` here is built per RPC invocation from a caller-supplied
`requestLevelLayers` plus a fresh `RequestName` layer. Today both pieces are
stateless, so no observable bug — but `Effect.provide(layer)` without
`local: true` resolves its `MemoMap` from the ambient fiber context, and on a
long-lived runtime (browser app, server fiber) any stateful layer slipped into
`requestLevelLayers` by a caller would be memoized and shared across every
subsequent RPC call. `{ local: true }` builds the layer fresh per call and
skips the ambient MemoMap entirely.

Also documents the rule in `AGENTS.md` ("Per-request `Effect.provide(layer)`
must isolate its MemoMap") so the pattern is enforceable in code review and
caught early. Companion to the `provideOnRequestScope` MemoMap fix in
`@effect-app/infra`.

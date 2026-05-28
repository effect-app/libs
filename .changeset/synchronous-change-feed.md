---
"effect-app": patch
---

Repository `changeFeed` now broadcasts synchronously: `publish` awaits every subscribed handler before resolving. Replaces `PubSub.PubSub` with a `ChangeFeed<T>` interface (`publish` + scoped `subscribe`). Handlers are auto-removed when the subscriber's scope closes, and the full handler set is cleared when the repository's scope closes. Repository construction now requires `Scope` — wire `makeRepo` through `Layer.scoped` / `Effect.scoped`.

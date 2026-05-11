---
"@effect-app/vue": minor
---

Add `mode: "optional"` overload for queries. When `mode: "optional"` is set, the `arg` must be a `WatchSource<Option<I>>`. The query is disabled (`enabled: false`) when the option is `None`, and enabled with the unwrapped value when `Some`.

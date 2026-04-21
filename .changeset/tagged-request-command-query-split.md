---
"effect-app": patch
"@effect-app/vue": patch
---

Split `TaggedRequestFor` into `Query` and `Command` factories, and mark generated request classes with `type: "query" | "command"`.

Vue client helpers now expose query-only helpers (`query`, `suspense`, `fetch`) for query requests and mutation-only helpers (`mutate`, `fetch`) for command requests.

---
"effect-app": patch
"@effect-app/vue": patch
---

Refactor command invalidation typing: declare resources via `Command<Self, Resources>()`, pass `invalidatesQueries` as the optional 4th argument, and enforce exact `clientFor` invalidation resources when required.

---
"@effect-app/vue": minor
---

Client entries are now plain objects; use `.fetch` to invoke the request.

`client.Xxx` no longer is callable or an `Effect` itself. Call `client.Xxx.fetch(input)` (or `client.Xxx.fetch` for input-less requests) instead. `.mutate`, `.query`, `.suspense`, `.wrap`, and `.fn` are unchanged.

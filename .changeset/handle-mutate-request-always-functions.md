---
"@effect-app/vue": patch
---

`handle`, `mutate`, and `request` are now always functions, never a raw Effect or Stream. For no-input handlers the first argument is omitted (`handle()`, `request()`, `mutate()`).

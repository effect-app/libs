---
"@effect-app/infra": patch
---

RequestContextMiddleware: set request name to `HTTP <method> <path>` (strip query string) for clearer span/trace names.

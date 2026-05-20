---
"@effect-app/infra": patch
---

Fix ContextMap finalizer running mid-stream on SSE responses. SSE handler now binds ContextMapContainer to the request scope via a shared `provideOnRequestScope` helper (also used by `RequestContextMiddleware`), so finalizers only run after the response body is fully drained. Adds `setupStreamingRequestContextFromCurrent` for use by streaming HTTP handlers.

---
"effect-app": minor
"@effect-app/infra": minor
"@effect-app/vue": minor
---

Integrate Effect's `ErrorReporter` module for structured error reporting.

- Add `[ErrorReporter.ignore] = true` to all domain error classes (`NotFoundError`, `InvalidStateError`, `ServiceUnavailableError`, `ValidationError`, `NotLoggedInError`, `LoginError`, `UnauthorizedError`, `OptimisticConcurrencyException`) — these expected errors are now automatically filtered from any registered `ErrorReporter`.
- Add `makeSentryReporter` factory (via `ErrorReporter.make`) to both `infra/errorReporter` and `vue/errorReporter`. Register it in your runtime layer with `ErrorReporter.layer([makeSentryReporter])`.
- `reportError` now delegates Sentry reporting to `ErrorReporter.report` (the registered reporter) instead of calling Sentry directly, removing the `CauseException` wrapping step and enabling deduplication/interrupt-filtering provided by the built-in framework.
- `infra/api/routing/middleware`: `LoggerMiddlewareLive` now uses `Effect.withErrorReporting({ defectsOnly: true })` at the RPC boundary instead of a manual `tapCauseIf`+`reportError` pair.

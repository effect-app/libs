# Replacing custom error reporters with Effect ErrorReporter

Effect v4 has a first-class `ErrorReporter` module. We can use it to replace the duplicated custom implementations in `packages/infra/src/errorReporter.ts` and `packages/vue/src/errorReporter.ts`.

The target shape is:

- register platform reporters once with `ErrorReporter.layer`
- report failed effects with `Effect.withErrorReporting`
- report already-captured causes with `ErrorReporter.report`
- move per-error filtering, severity, and metadata onto error classes with `ErrorReporter.ignore`, `ErrorReporter.severity`, and `ErrorReporter.attributes`

## Why replace the custom reporters

Our current reporters do several things that `ErrorReporter.make` already owns:

- skips interruption-only causes
- turns cause reasons into reportable `Error` values
- deduplicates repeated cause/error objects
- supports severity
- supports structured attributes

The custom code should keep only app-specific behavior:

- Sentry scope setup
- request context attached to Sentry
- log annotations we still want in addition to Sentry
- the old category/name field, currently `__error_name__`

## New reporter layer

Create one reporter per runtime environment. Keep the callback synchronous: `ErrorReporter.make` is invoked from the failing fiber and returns `void`.

```ts
import * as Sentry from "@sentry/node"
import * as Cause from "effect/Cause"
import * as ErrorReporter from "effect/ErrorReporter"
import { LocaleRef } from "effect-app/RequestContext"
import { storeId } from "effect-app/Store"
import { LogLevelToSentry } from "effect-app/utils"

export const SentryErrorReporter = ErrorReporter.make(({ attributes, cause, error, fiber, severity }) => {
  const scope = new Sentry.Scope()
  scope.setLevel(LogLevelToSentry(severity))
  scope.setContext("context", {
    locale: fiber.getRef(LocaleRef),
    namespace: fiber.getRef(storeId)
  })
  scope.setContext("attributes", attributes)
  scope.setContext("cause", { pretty: Cause.pretty(cause) })
  Sentry.captureException(error, scope)
})

export const ErrorReporterLive = ErrorReporter.layer([SentryErrorReporter])
```

For the browser package use the same shape with `@sentry/browser` and without server-only request context.

Provide the layer at runtime/bootstrap, not at every call site:

```ts
const RuntimeLive = AppLayer.pipe(
  Layer.provideMerge(ErrorReporterLive)
)
```

Use `{ mergeWithExisting: true }` only when adding a reporter without replacing already configured reporters.

## Replacing call sites

Current manual reporting:

```ts
self.pipe(Effect.tapCause(reportError("Request")))
```

Becomes:

```ts
self.pipe(Effect.withErrorReporting)
```

For streams, keep the stream boundary and swap only the reporter:

```ts
stream.pipe(Stream.tapCause(ErrorReporter.report))
```

Current "unexpected only" reporting:

```ts
self.pipe(reportUnknownRequestError)
```

Becomes:

```ts
self.pipe(Effect.withErrorReporting({ defectsOnly: true }))
```

Current places that already have a cause and should keep going:

```ts
yield* reportRuntimeError(cause, extra)
```

Become:

```ts
yield* ErrorReporter.report(cause)
```

If the extra data is important, attach it at the source error with `ErrorReporter.attributes`. If the data is call-site-only, keep a small helper that logs/sends a message separately; do not rebuild a parallel cause reporter.

## Replacing severity and filtering

Move severity decisions from helper functions into the error values.

```ts
import * as ErrorReporter from "effect/ErrorReporter"

class FetchAborted extends Error {
  readonly [ErrorReporter.severity] = "Info" as const
}

class ExpectedNotFound extends Error {
  readonly [ErrorReporter.ignore] = true
}
```

For existing tagged errors, add the same fields to the class.

```ts
class RateLimited extends Data.TaggedError("RateLimited")<{
  readonly retryAfter: number
}> {
  readonly [ErrorReporter.severity] = "Warn" as const
  readonly [ErrorReporter.attributes] = {
    retryAfter: this.retryAfter
  }
}
```

This replaces custom logic like `determineLevel(cause)` and ad hoc "silenced" symbols.

## What happens to `name`

The old API accepts `reportError("Request")`, `reportError("Runtime")`, and `reportError("Queue")`. Effect's reporter does not need a name parameter.

Preserve category only when it is still useful for dashboards:

- Prefer span/log context when the category is already the current operation.
- Add `ErrorReporter.attributes` to domain errors when category is intrinsic to the error.
- For legacy dashboard compatibility, temporarily wrap reporting boundaries with log annotations or add a small reporter-specific mapping from fiber span/request data to Sentry tags.

Avoid keeping `reportError(name)` as a compatibility layer. It preserves the old API and hides the intended migration.

## Migration order

1. Add `ErrorReporterLive` for infra and vue.
2. Provide it once at runtime/bootstrap.
3. Convert effect boundaries from `tapCause(reportError(...))` to `Effect.withErrorReporting`.
4. Convert stream boundaries from `Stream.tapCause(reportError(...))` to `Stream.tapCause(ErrorReporter.report)`.
5. Convert "unknown only" boundaries to `Effect.withErrorReporting({ defectsOnly: true })`.
6. Move call-site extras/severity onto error classes with `ErrorReporter.attributes` and `ErrorReporter.severity`.
7. Delete `packages/infra/src/reportError.ts` after its call sites are gone.
8. Delete `packages/infra/src/errorReporter.ts` and `packages/vue/src/errorReporter.ts` once only `reportMessage` / non-cause helpers remain, or split those helpers into a separate Sentry utility.

## Things to watch

- `ErrorReporter.make` callbacks are synchronous. Read request data from `fiber.getRef(...)`, not by yielding effects like `getRC`.
- `ErrorReporter.report` reports to reporters registered on the current fiber. Missing `ErrorReporter.layer` means no reports.
- Default severity is `"Info"` unless an object error has `ErrorReporter.severity`.
- The Effect reporter already skips interruption-only causes; do not duplicate that check at call sites.
- For streaming boundaries, keep the existing request-scope layer rules. The reporter layer is a `Layer`, so provide it at runtime or with the same per-request scope discipline used elsewhere.

---
"@effect-app/vue-components": patch
---

Add `FixedNuxtErrorBoundary`, extracted from duplicated per-project copies. Wraps Nuxt's error boundary with injectable `captureException`/`toastError`/`debug` props, distinguishes supported errors (setup/template) from unsupported ones (native event handlers, reported but not rendered), ignores interrupts-only Effect `CauseException` failures, and clears itself on route change.

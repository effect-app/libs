---
"@effect-app/infra": patch
---

Declare `@sentry/node` as a runtime dependency of `@effect-app/infra`. `errorReporter.ts` imports it statically, so `pnpm install --prod` of linked source (Docker) must install it next to the package, not only as a peer of the app.

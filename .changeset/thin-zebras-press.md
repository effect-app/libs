---
"@effect-app/vue-components": patch
---

Fix `FixedNuxtErrorBoundary` losing the app's router: `vue-router` was missing from `vite.config.mts`'s Rollup `external` list, so it got bundled into the library output with its own `Symbol("router")` injection key a different instance from the host app's real `routerKey`. `useRouter()` inside the component therefore always returned `undefined`, crashing on `.afterEach` (500 in SSR). `vue-router` is now external like `vue`, so the component resolves the host app's actual router instance.

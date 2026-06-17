---
"@effect-app/vue-components": patch
---

Point the package `exports` at `src` (`.vue`/`.ts`) for workspace/source consumption, matching `effect-app` and `@effect-app/vue`. The published package is unchanged — `publishConfig.exports` still ships the built `dist` artifacts, so registry consumers keep getting compiled output. This lets linked/source consumers (e.g. via embedded-source mode) load the components from `src` without a build step; runtime `.vue` is compiled by the consumer's bundler and types resolve via `vue-tsc`.

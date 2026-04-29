---
"effect-app": patch
"@effect-app/infra": patch
"@effect-app/vue": patch
"@effect-app/vue-components": patch
"@effect-app/cli": patch
---

Add concurrent decode helper APIs and migrate decode callsites to use them.

- Add `withDefaultParseOptions` and keep `DefaultParseOptions` centralized.
- Export `decodeEffectConcurrently` and `decodeUnknownEffectConcurrently` from Schema and SchemaParser modules.
- Update repository, queue, client, form, and CLI decode paths to use concurrent decode helpers.
- Keep schema constructors free of hardcoded parse concurrency overrides.

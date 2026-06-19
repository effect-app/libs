---
"@effect-app/vue-components": patch
---

OmegaForm/Vuetify: fix `@update:model-value` handler type mismatches on `v-text-field`, `v-textarea` and `v-radio-group` (wrap `field.handleChange` so Vuetify's concrete event value is accepted), and type the `v-radio` `:key`. Drop the stale `@vue-skip` on `Dialog` slot pass-through.

Tooling: bind Vuetify component types during type-checking via a typecheck-only `types/vuetify-shims.d.ts` so `<v-text-field>` etc. resolve in the editor and `pnpm check`, with declaration emit isolated in `tsconfig.build.json` (no Vuetify global augmentation leaks into published types, no runtime bundle). Enable `noUnusedLocals`/`noUnusedParameters` in the check config.

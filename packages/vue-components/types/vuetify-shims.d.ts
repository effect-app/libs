// Typecheck-only: pull in Vuetify's `declare module "vue"` GlobalComponents
// augmentation so `<v-text-field>` etc. resolve to their real Vuetify types
// during `pnpm check`. NOT part of the build emit (see tsconfig.check.json) —
// the published d.ts must not force this global augmentation onto consumers,
// and the runtime bundle must not pull Vuetify in.
import "vuetify"

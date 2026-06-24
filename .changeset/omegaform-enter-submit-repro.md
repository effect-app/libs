---
"@effect-app/vue-components": patch
---

Fix OmegaForm default inputs leaking the internal form object as a native `form="[object Object]"` attribute, restoring browser implicit Enter-key submission. Adds a Storybook repro for the default Vuetify input renderer.

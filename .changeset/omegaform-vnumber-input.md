---
"@effect-app/vue-components": minor
---

OmegaForm number fields now render Vuetify 4's `v-number-input` instead of `v-text-field type="number"` (`range` keeps its `v-slider`). Precision is schema-driven (`S.Int` → 0, plain numbers → free decimals), controls default to the stacked variant, and any `VNumberInput` prop (`precision`, `step`, `control-variant`, `decimal-separator`, ...) can be overridden per field via attrs. Schema `min`/`max` are exposed to assistive tech as spinbutton ARIA bounds but are deliberately not passed as component props, so out-of-range values keep reaching schema validation and show its localized error instead of being silently clamped.

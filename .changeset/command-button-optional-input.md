---
"@effect-app/vue-components": minor
---

`CommandButton`: add `optionalInput` prop accepting `Option<I>`. `Some` enables button and fires click with value; `None` disables. Use when input is gated by a `computed` rather than a `v-if` on the button. Also bind `:disabled` on the `<v-btn>` (previously only `aria-disabled`).

---
"@effect-app/vue-components": patch
---

OmegaForm: expose native input types `tel`, `url`, `color`, `time`, `search` (already supported by `getInputType`), and render an editable text input with a dev `console.warn` for any input type no renderer branch handles (e.g. an unrecognized `"unknown"` schema type or a custom `type`) instead of rendering nothing.

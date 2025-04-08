---
"@effect-app/vue-components": minor
---

Enhance OmegaForm components with new input types and improved structure

- Added support to CSS inside JS bundle both for modules than for custom elements
- OmegaFormInput now fully support children as input, so vuetify it's only a default for environments that globally import that library
- Updated OmegaInput.vue to support autocomplete and autocompletemultiple types.
- Refactored OmegaInternalInput.vue to streamline input handling and improve slot usage.
- Modified OmegaErrors.vue to utilize slots for better flexibility in error display.
- Added new types to OmegaFormStuff.ts for enhanced type safety.
- Adjusted Vite configuration to support custom elements in Vue components.

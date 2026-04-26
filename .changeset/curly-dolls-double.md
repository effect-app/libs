---
"@effect-app/vue-components": patch
---

OmegaForm now runs field validation in ordered composition: OmegaForm-generated field rules first, then original schema checks. This makes custom schema filters (for example `S.makeFilter` checks) show during `onChange`/`onBlur` while preserving existing OmegaForm validation behavior and messages.

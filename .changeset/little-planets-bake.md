---
"@effect-app/vue-components": minor
---

Restore OmegaForm input reactivity broken by the @tanstack/vue-form 1.32 bump — the Field slot's state prop became a stale snapshot, so bind inputs to the reactive field.state instead.

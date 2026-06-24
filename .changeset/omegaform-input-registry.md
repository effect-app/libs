---
"@effect-app/vue-components": patch
---

OmegaForm: register custom input components per `type` via `omegaConfig.inputs`. Registered components receive the `OmegaRendererProps` contract (`{ inputProps, field, state }`) and a registered key makes `<form.Input type="...">` type-valid. Resolution order: per-instance `#default` slot → `inputs[type]` → built-in renderer. Also drops the redundant `validators` forwarding to the internal input.

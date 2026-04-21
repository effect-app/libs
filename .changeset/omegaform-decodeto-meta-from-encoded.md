---
"@effect-app/vue-components": patch
---

OmegaForm: meta extraction now walks the encoded (source) side of struct-level `decodeTo` transformations, so the outer schema drives field-level validation. Example: `S.Struct({ amount: S.NonNegativeInt }).pipe(S.decodeTo(S.Struct({ amount: S.PositiveInt }), ...))` now lets users enter `0` without a field error and the decode fallback can rewrite it before submit.

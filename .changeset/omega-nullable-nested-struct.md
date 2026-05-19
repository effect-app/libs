---
"@effect-app/vue-components": patch
---

OmegaForm: deep-fill defaults for nullable nested structs. When a `S.NullOr(S.Struct(...))` field materialises because one child was filled, its untouched nullable siblings are now normalized to `null` (or their schema default) — in the live form state, and during validation and decoding — instead of being rejected as "field must not be empty".

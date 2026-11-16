---
"effect-app": minor
---

Add bounded 32-bit numeric schemas: `Int32`, `NonNegativeInt32`, `PositiveInt32` (signed Java `Integer` range, `format: "int32"`) and `NonNegativeNumber32`, `PositiveNumber32` (finite IEEE 754 binary32 range, `format: "float"`). Limits are enforced on decode and encode and emitted as JSON Schema / OpenAPI `minimum`/`maximum`. Float bounds are Java's `Float.MAX_VALUE` / `Float.MIN_VALUE` literals (`3.4028235E38`, `1.4E-45`), so every accepted value stays finite in binary32 and `PositiveNumber32` values stay non-zero (no overflow / underflow). Values are not rounded. Brands extend the existing `Int`/`NonNegativeInt`/`PositiveInt`/`NonNegativeNumber`/`PositiveNumber` brands. Bound constants `INT32_MIN`, `INT32_MAX`, `FLOAT32_MIN_POSITIVE`, `FLOAT32_MAX` are exported.

`flattenSimpleAllOf` now intersects repeated bounds (tighter `minimum`/`maximum`/length bounds win) and keeps the `allOf` when other non-annotation keywords conflict, instead of letting the last `allOf` member overwrite parent constraints.

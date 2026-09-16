---
"effect-app": patch
"@effect-app/infra": patch
---

Restore native Arbitrary for the schemas that lost custom fast-check `toArbitrary`: `StringId` is 21-char nanoid-shaped, `Url` is `https://…` (not strings `isURL({ require_tld: false })` happens to accept), `RequestId` samples unique nanoid-shaped ids, and `Finite` generation is capped at ±1e6 so products stay finite. `generateFromSchema` jumps its master seed per call so successive `count: 1` draws do not collide on attempt-0 edge strings.

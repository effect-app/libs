---
"effect-app": patch
"@effect-app/infra": patch
---

Restore native Arbitrary for the schemas that lost custom fast-check `toArbitrary`. `StringId` uses `toCodecArbitrary` (the native replacement): generate a 210-byte `Uint8Array` and run `customRandom(urlAlphabet, 21, …)` — same as the old `StringIdArb`. JSON stays a branded string via `toCodec`. `Url` is `https://…`. `RequestId` samples unique nanoid-shaped ids. `Finite` generation is capped at ±1e6. `generateFromSchema` jumps its master seed per call so successive `count: 1` draws do not collide on attempt-0 edge strings.

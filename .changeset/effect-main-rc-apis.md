---
"effect-app": patch
"@effect-app/cli": patch
---

Upgrade Effect packages to `4.0.0-rc.113`.

Breaking API updates from this RC:

- PascalCase Config/CLI constructors (`Config.String`, `Flag.File`, `Config.NonEmptyString`, `Config.Redacted`, `Config.Literal`)
- `Config.Record` now returns a Config
- Schema `toArbitrary` (fast-check) replaced by native `effect/unstable/arbitrary`
- `SchemaTransformation.transformOrFail` renamed to `transformEffect`
- `Fiber.currentSpan` moved to `fiber.cache.span`
- HTTP server addresses are `InetAddressV4`/`InetAddressV6` instead of `TcpAddress`
- Object JSON Schema now emits `additionalProperties: true`

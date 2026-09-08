---
"effect-app": patch
"@effect-app/cli": patch
---

Adapt to unpublished Effect main (pkg.pr.new `addeaea`, still versioned `4.0.0-rc.112`).

npm `rc` remains `4.0.0-rc.112`; this pin consumes Effect main until the next RC publishes. Breaking API updates:

- PascalCase Config/CLI constructors (`Config.String`, `Flag.File`, `Config.NonEmptyString`, `Config.Redacted`, `Config.Literal`)
- `Config.Record` now returns a Config
- Schema `toArbitrary` (fast-check) replaced by native `effect/unstable/arbitrary`
- `Fiber.currentSpan` moved to `fiber.cache.span`
- HTTP server addresses are `InetAddressV4`/`InetAddressV6` instead of `TcpAddress`

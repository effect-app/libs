// `Config.nested` previously needed a local override because effect v3's `nested`
// did not run the provider's `mapInput`/`constantCase` over the nested namespace
// segment (see commit "fix Config.nested mapping"). As of effect 4.0.0-beta.84 the
// upstream `nested` threads the prefix through the lookup path, so the provider
// transform covers it — the override is obsolete and the old internals it used are
// gone. Re-export the native module directly.
export * from "effect/Config"

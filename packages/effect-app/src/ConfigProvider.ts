// Local `nested` override removed: it existed to make the nested namespace honour the
// provider's `mapInput`/`constantCase` (see commit "fix Config.nested mapping"), which
// effect 4.0.0-beta.84 now does natively. The old override also relied on internals
// (`provider.get`/`mapInput`/`prefix`) that no longer exist. Re-export native directly.
export * from "effect/ConfigProvider"

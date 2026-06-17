---
"effect-app": patch
---

Remove the local `Config.nested` / `ConfigProvider.nested` overrides. They worked around an effect v3 bug where the nested namespace segment bypassed the provider's `mapInput`/`constantCase` transform. effect `4.0.0-beta.84` fixes this upstream (its transformation-compose refactor threads the nested prefix through the provider's lookup transform), and the old overrides relied on internals (`Config.make`, `provider.get`/`mapInput`/`prefix`) that no longer exist. Both modules now re-export effect directly; behaviour for consumers (e.g. `Config.nested("cups")` against a `constantCase` env provider) is unchanged and correct.

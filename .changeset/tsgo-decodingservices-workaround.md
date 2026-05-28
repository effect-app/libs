---
"effect-app": patch
"@effect-app/vue": patch
---

Work around tsgo failing to reduce `S.Codec.DecodingServices<X>` (`X extends Top ? X["DecodingServices"] : never`) in generic positions, which left `unknown` and polluted the `R` channel of client handlers and RPC middleware failure context. Since the schemas involved are already constrained to `S.Top`, read `["DecodingServices"]` directly in `RequestHandlerFor`, `TagClass.FailureContext`, and the Vue `MutationExt` / `QueryProjection` types.

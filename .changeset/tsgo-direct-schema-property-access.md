---
"effect-app": patch
"@effect-app/infra": patch
"@effect-app/vue": patch
---

improve tsgo compat: avoid deferred `Schema.Type`/`Codec.Encoded`/`Codec.DecodingServices`/`Codec.EncodingServices` conditional helpers in generic positions where the type parameter is already constrained to `Schema.Top`. Index the property directly (`X["Type"]`, `X["Encoded"]`, `X["DecodingServices"]`, …) so tsgo doesn't leak `unknown` into `Effect` channels (notably `R`).

Sites: `client/clientFor.ts` (`RequestHandlerFor`, `FinalTypeOf`, `ExtractResponse`, `ExtractEResponse`), `client/makeClient.ts` (`InputFromPayload`, `OutputFromSuccess`, `InvalidationConfigForCommand`, `TaggedRequestWithMeta` overloads), `rpc/MiddlewareMaker.ts` (`Errors`), `rpc/RpcMiddleware.ts` (`Failure`, `FailureContext`), `Schema/ext.ts` (`ReadonlySetFromArray`, `ReadonlyMapFromArray`), `infra/api/routing.ts` (`GetSuccessShape`, handlers, route matcher), `vue/makeClient.ts` (`MutationExt.project`, `MutationWithExtensions`, `QueryProjection`), `vue/routeParams.ts` (`parseRouteParams*`).

# Step 2: `effect-app` core Migration to Effect v4

## Status: In Progress

## Files to Change (ordered by dependency)

1. `src/Unify.ts` — DELETE
2. `src/Schema/schema.ts` — Arbitrary, ParseResult imports
3. `src/_ext/Array.ts` — Chunk.unsafeGet
4. `src/Chunk.ts` — Chunk.unsafeGet
5. `src/_ext/misc.ts` — Either → Result
6. `src/utils.ts` — Either, RuntimeFiber
7. `src/utils/effectify.ts` — Effect.async
8. `src/Config/internal/configSecretURL.ts` — SecretTypeId
9. `src/Config/SecretURL.ts` — SecretTypeId, Either
10. `src/Schema/ext.ts` — ParseResult, optionalWith, transformOrFail
11. `src/Schema.ts` — ParseResult re-export, LazyArbitrary
12. `src/Layer.ts` — Layer.scoped, Effect.Service types
13. `src/Context.ts` — GenericTag, TagClassShape, Layer.scoped (major)
14. `src/Effect.ts` — verify re-exports
15. `src/http/internal/lib.ts` — @effect/platform
16. `src/http/Request.ts` — @effect/platform
17. `src/rpc/RpcContextMap.ts` — @effect/rpc, GenericTag
18. `src/rpc/RpcMiddleware.ts` — @effect/rpc, RpcMiddleware.Tag, Unify
19. `src/rpc/MiddlewareMaker.ts` — @effect/rpc, Layer.scoped, GenericTag
20. `src/client/apiClientFactory.ts` — @effect/rpc, Config.hashMap, fromTaggedRequest
21. `src/client/clientFor.ts` — check imports
22. `src/client/errors.ts` — check imports
23. `src/client/makeClient.ts` — check imports
24. `src/index.ts` — verify

## Progress

### Phase 1: Delete obsolete file + foundation fixes
- [ ] Delete Unify.ts
- [ ] Fix Schema/schema.ts
- [ ] Fix _ext/Array.ts and Chunk.ts

### Phase 2: Either → Result + utils
- [ ] _ext/misc.ts
- [ ] utils.ts
- [ ] utils/effectify.ts

### Phase 3: Config (Secret → Redacted)
- [ ] Config/internal/configSecretURL.ts
- [ ] Config/SecretURL.ts

### Phase 4: Schema modules
- [ ] Schema/ext.ts
- [ ] Schema.ts

### Phase 5: Context and Layer
- [ ] Layer.ts
- [ ] Context.ts
- [ ] Effect.ts

### Phase 6: HTTP module
- [ ] http/internal/lib.ts
- [ ] http/Request.ts

### Phase 7: RPC modules
- [ ] rpc/RpcContextMap.ts
- [ ] rpc/RpcMiddleware.ts
- [ ] rpc/MiddlewareMaker.ts

### Phase 8: Client modules
- [ ] client/apiClientFactory.ts
- [ ] client/clientFor.ts
- [ ] client/errors.ts
- [ ] client/makeClient.ts

### Phase 9: Entry points
- [ ] index.ts
- [ ] Schema.ts aggregator

### Phase 10: Validation
- [ ] eslint fix
- [ ] pnpm check
- [ ] Update findings.md

## Findings

(New findings will be recorded here and in task/findings.md)

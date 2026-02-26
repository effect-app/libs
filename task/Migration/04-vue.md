# Step 4: Vue Package Migration

## Status: In Progress

## Files to migrate (dependency order):
1. [x] `experimental/intl.ts`
2. [x] `experimental/toast.ts`
3. [x] `experimental/confirm.ts`
4. [x] `experimental/withToast.ts`
5. [x] `errorReporter.ts`
6. [x] `form.ts`
7. [x] `lib.ts`
8. [x] `mutate.ts`
9. [x] `query.ts`
10. [x] `routeParams.ts`
11. [x] `runtime.ts`
12. [ ] `experimental/commander.ts`
13. [ ] `experimental/makeUseCommand.ts`
14. [ ] `makeClient.ts`
15. [ ] test files

## Key changes needed:
- `Effect.Service` → `ServiceMap.Service`
- `Effect.Tag` → `ServiceMap.Service`
- `Context.GenericTag` → ServiceMap equivalent
- `Cause.isInterruptedOnly` → `Cause.hasInterruptsOnly`
- `Cause.failureOption` → `Cause.findErrorOption`
- `Effect.catchAllCause` → `Effect.catchCause`
- `Effect.tapErrorCause` → `Effect.tapCause`
- `Effect.zipRight` → `Effect.andThen`
- `LogLevel.Error` → `"Error"` (string literal)
- `LogLevel.Info` → `"Info"` (string literal)
- `Either` → `Result`
- `RuntimeFiber` → `Fiber.Fiber`
- `Runtime.Runtime<R>` → `ServiceMap.ServiceMap<R>`
- `Runtime.runPromise(rt)` → `Effect.runPromiseWith(rt)`
- `Runtime.runSync(rt)` → `Effect.runSyncWith(rt)`
- `Runtime.runFork(rt)` → `Effect.runForkWith(rt)`
- `Effect.runtime<R>()` → removed
- `S.decodeUnknownEither` → `S.decodeUnknownExit`
- `S.decodeUnknown` → `S.decodeUnknownEffect`
- `S.ParseResult.ParseError` → `S.SchemaError`
- `S.AST.TypeLiteral` → `S.AST.Objects`
- `S.AST.getIdentifierAnnotation` → `SchemaAST.resolveIdentifier`
- `Exit.matchEffect` → manual pattern matching
- `Option.fromNullable` → `Option.fromNullishOr`
- `Utils.structuralRegion` → check if still exists
- `isHttpClientError` import from `effect/unstable/http/HttpClientError`
- `effect/JSONSchema` → `effect/JsonSchema`
- `effect/ParseResult` → removed
- `Effect.withSpan(name, { captureStackTrace })` → `Effect.withSpan(name, opts, { captureStackTrace })`

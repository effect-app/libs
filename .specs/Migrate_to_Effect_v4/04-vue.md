# Step 4: Vue Package Migration

## Status: Complete

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
12. [x] `experimental/commander.ts`
13. [x] `experimental/makeUseCommand.ts`
14. [x] `makeClient.ts`
15. [x] test files

## Key fixes for type checking:
- `makeRpcClient` in `effect-app/src/client/makeClient.ts`: replaced `any` return types with `TaggedRequestResult<...>` type that properly satisfies the `Req` constraint
- Added `~decodingServices` phantom property to `TaggedRequestResult` and `Req` to pre-compute `S.Codec.DecodingServices` at class-definition time
- Changed `RequestHandlers` in `clientFor.ts` to use `ReqDecodingServices<M[K]>` (property access) instead of `S.Codec.DecodingServices<M[K]["success"]> | S.Codec.DecodingServices<M[K]["error"]>` (generic computation that resolves to `unknown` due to `S.Top["DecodingServices"]` = `unknown`)
- Changed `S.Schema<void>` to `S.Void` in error type defaults — `Schema<void>` inherits `DecodingServices: unknown` from `Top`, while `Void` extends `Bottom<void, void, never, never, ...>` with `DecodingServices: never`
- Removed `@ts-expect-error` directives from test for `GetSomething2WithDependencies` — v4 schemas don't carry service requirements the same way

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

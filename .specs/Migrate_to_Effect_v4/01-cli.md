# Step 1: `@effect-app/cli` Migration to Effect v4

## Status: Complete

## Files Changed

- `packages/cli/package.json` — updated dependencies
- `packages/cli/src/extract.ts` — minor API fix
- `packages/cli/src/gist.ts` — major API changes
- `packages/cli/src/index.ts` — CLI and platform API changes
- `packages/cli/src/os-command.ts` — service class + process API migration

## Changes Made

### package.json
- Removed `@effect/cli`, `@effect/platform`, `@effect/platform-node`
- Added `effect: ^4.0.0-beta.5`
- Updated `@effect/platform-node` to `^4.0.0-beta.5`

### os-command.ts
- `Effect.Service` → `ServiceMap.Service` (now in `effect` directly, not `@effect/platform`)
- `Command` / `CommandExecutor` → `ChildProcess` from `effect/unstable/process`
- `ChildProcessSpawner` from `effect/unstable/process/ChildProcessSpawner`
- Removed stale `@effect-diagnostics-next-line missingEffectServiceDependency:off` comment (rule renamed in v4)

### extract.ts
- `Order.string` → `Order.String` (capitalized in v4)

### gist.ts
- `ParseResult` removed from imports; added `SchemaIssue`, `SchemaTransformation`
- `GistEntryDecoded` class using `GistEntry.transformOrFail<>()` (v3 Schema.Class API, removed in v4) →
  replaced with `const GistEntryDecoded = GistEntry.pipe(Schema.decodeTo(targetStruct, SchemaTransformation.transformOrFail({decode, encode})))`
  and `export interface GistEntryDecoded extends Schema.Schema.Type<typeof GistEntryDecoded> {}`
- Inside decode function: `ParseResult.Composite` / `ParseResult.Type` → `SchemaIssue.InvalidValue(Option.some(value), { message })`
- `Array.isNonEmptyArray` → `Array.isArrayNonEmpty`
- `Schema.optionalWith({ default: () => ({}), nullable: true, exact: true })` →
  `Schema.optional(Schema.NullOr(schema))` + `?? {}` at usage site
- `Schema.Record({ key: K, value: V })` → `Schema.Record(K, V)` (args changed in v4)
- `Effect.catchAll((e) => Effect.dieMessage(...))` →
  `Effect.mapError((e) => new Error(...)).pipe(Effect.orDie)`
- `Effect.dieMessage("msg")` → `Effect.die(new Error("msg"))`
- `Effect.orElse(() => fallback)` → removed (was dead code after using suppressed helpers)
- `Schema.parseJson(S)` → `Schema.fromJsonString(S)`
- `Schema.decodeUnknown(S)` → `Schema.decodeUnknownEffect(S)`
- `Schema.encodeUnknown(S)` → `Schema.encodeUnknownEffect(S)`
- `Effect.all({ company: Config.string(...), env: Config.string(...).pipe(Config.withDefault("local-dev")) })` →
  separate `yield* Config.string(...)` calls + `Config.withDefault(() => "local-dev")` (now takes `LazyArg`)
- `Array.filterMap(arr, fn)` → native `arr.flatMap(fn)`
- `Object.entries(configFromYaml.gists)` → `Object.entries(configFromYaml.gists ?? {})`
- Removed stale `@effect-diagnostics-next-line missingEffectServiceDependency:off` comment

### index.ts
- `Args` → `Argument` (renamed in v4 CLI)
- `Options` → `Flag` (renamed in v4 CLI)
- `fs.watch(path, { recursive: true })` → `fs.watch(path)` (no options in v4)
- `Command.Config` namespace not exported → changed `makeCommandWithWrap` to use unconstrained `Config` generic and `any` handler param
- `NodeRuntime.runMain` no longer pipeable → wrap entire effect in `NodeRuntime.runMain(...)` call

## Findings

See `task/findings.md` for all v3→v4 API mapping findings.

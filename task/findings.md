# Effect v3 → v4 Migration Findings

## Package Changes

| v3 | v4 |
|---|---|
| `@effect/cli` (separate package) | `effect/unstable/cli` (built into `effect`) |
| `@effect/platform` (separate package) | Built into `effect` |
| `@effect/platform-node` (peer deps) | `@effect/platform-node ^4.0.0-beta.5` |

## Service Classes

| v3 | v4 |
|---|---|
| `Effect.Service<Self>()("Tag", { dependencies: [...], effect: Effect.gen(...) })` | `ServiceMap.Service<Self>()("Tag", { make: Effect.gen(...) })` with static `Default` and `DefaultWithoutDependencies` |
| `Effect.Service` imported from `effect` | `ServiceMap` imported from `effect` |

Example migration:
```ts
// v3
class MyService extends Effect.Service<MyService>()("MyService", {
  dependencies: [Dep.Default],
  effect: Effect.gen(function*() { ... })
}) {}

// v4
class MyService extends ServiceMap.Service<MyService>()("MyService", {
  make: Effect.gen(function*() { ... })
}) {
  static DefaultWithoutDependencies = Layer.effect(this, this.make)
  static Default = this.DefaultWithoutDependencies.pipe(
    Layer.provide(Dep.Default)
  )
}
```

## Schema API

| v3 | v4 |
|---|---|
| `Schema.parseJson(schema)` | `Schema.fromJsonString(schema)` |
| `Schema.decodeUnknown(schema)` | `Schema.decodeUnknownEffect(schema)` |
| `Schema.encodeUnknown(schema)` | `Schema.encodeUnknownEffect(schema)` |
| `Schema.optionalWith({ default: () => x, nullable: true, exact: true })` | `Schema.optional(Schema.NullOr(schema))` + `?? default` at usage |
| `Schema.Record({ key: K, value: V })` | `Schema.Record(K, V)` (positional args) |
| `Schema.Class.transformOrFail<T>("T")({fields}, {decode, encode})` | `sourceSchema.pipe(Schema.decodeTo(targetStruct, SchemaTransformation.transformOrFail({decode, encode})))` — keep as class with `Schema.Opaque<Self>()(schema)` |
| Schema class → `const + interface` pattern | **Do not do this.** Use `class Foo extends Schema.Opaque<Foo>()(schema) {}` to preserve class semantics |
| `Array.filterMap(arr, fn)` (using `Option`) | `Array.filter(arr, fn)` where `fn` returns `Result.succeed(mapped)` or `Result.fail(item)` — import `Result` from `"effect"` |
| `ParseResult.Type(ast, value, msg)` | `SchemaIssue.InvalidValue(Option.some(value), { message: msg })` |
| `ParseResult.Composite(ast, value, issues)` | `SchemaIssue.Composite(ast, Option.some(value), issues)` (ast still needed) |
| `ParseResult.succeed(x)` | `Effect.succeed(x)` |
| `Array.isNonEmptyArray` | `Array.isArrayNonEmpty` |

## Effect API

| v3 | v4 |
|---|---|
| `Effect.dieMessage("msg")` | `Effect.die("msg")` (accepts `unknown`, prefer plain string over `new Error`) |
| `Effect.catchAll((e) => Effect.dieMessage(...))` | `Effect.mapError((e) => \`...\`).pipe(Effect.orDie)` (mapError returns string, not `new Error`) |
| `Effect.orElse(() => fallback)` | `Effect.catchCause(() => fallback)` |
| `Effect.all({ a: Config.string(...) })` | `Config.all({ a: Config.string(...) })` — use module's own `.all()` for Config/Either/Option |
| `Config.withDefault("value")` | `Config.withDefault(() => "value")` (now takes `LazyArg`) |

## Order Module

| v3 | v4 |
|---|---|
| `Order.string` | `Order.String` (capitalized) |
| `Order.number` | `Order.Number` (capitalized) |

## Platform APIs

| v3 | v4 |
|---|---|
| `Command` from `@effect/platform` | `ChildProcess` from `effect/unstable/process` |
| `CommandExecutor` | `ChildProcessSpawner` from `effect/unstable/process/ChildProcessSpawner` |
| `command.string()` | `ChildProcess.string(ChildProcess.make(...))` |
| `command.exitCode()` | `ChildProcess.exitCode(ChildProcess.make(...))` |
| `FileSystem.FileSystem.watch(path, { recursive: true })` | `FileSystem.FileSystem.watch(path)` (no options object) |

## CLI (from `@effect/cli` → `effect/unstable/cli`)

| v3 | v4 |
|---|---|
| `Args` | `Argument` |
| `Options` | `Flag` |
| `Command.Config` namespace (type) | Not exported — use unconstrained generics or `any` |

## Runtime

| v3 | v4 |
|---|---|
| `NodeRuntime.runMain` used as last `.pipe()` argument | Must call `NodeRuntime.runMain(effect)` directly |

## TypeScript Plugin Directives

- `@effect-diagnostics-next-line missingEffectServiceDependency:off` — rule renamed or removed in v4, remove stale comments

## Imports

Most `@effect/*` sub-packages are now consolidated into `effect`:
- `import { ServiceMap } from "effect"`
- `import { SchemaTransformation, SchemaIssue } from "effect"`
- `import { Result } from "effect"` (for filter/map operations replacing `Array.filterMap`)
- `import { ChildProcess } from "effect/unstable/process"`
- `import { ChildProcessSpawner } from "effect/unstable/process/ChildProcessSpawner"`
- CLI: `import { Argument, Command, Flag, Prompt } from "effect/unstable/cli"`

# Effect v3 → v4 Migration Findings

## Package Changes

| v3 | v4 |
|---|---|
| `@effect/cli` (separate package) | `effect/unstable/cli` (built into `effect`) |
| `@effect/platform` (separate package) | Built into `effect` |
| `@effect/platform-node` (peer deps) | `@effect/platform-node ^4.0.0-beta.5` |
| `@effect/platform-browser` | `@effect/platform-browser ^4.0.0-beta.x` (no major changes, mainly import paths) |
| `@effect/vitest` | `@effect/vitest ^4.0.0-beta.x` (no major changes) |
| `@effect-atom/atom` | `@effect/atom` (check package version) |
| `@effect-atom/atom-vue` | `@effect/atom-vue` (rename only, no import changes) |
| `@effect-atom/atom-react` | `@effect/atom-react` (rename only) |
| `@effect-atom/atom-solid` | `@effect/atom-solid` (rename only) |

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
| `S.encode(schema)` | `S.encodeEffect(schema)` — returns curried `(value) => Effect<Encoded, SchemaError, Services>` |
| `S.decode(schema)` | `S.decodeEffect(schema)` — returns curried `(encoded) => Effect<Type, SchemaError, Services>` |
| `Schema.optionalWith({ default: () => x, nullable: true, exact: true })` | `Schema.optional(Schema.NullOr(schema))` + `?? default` at usage |
| `Schema.Record({ key: K, value: V })` | `Schema.Record(K, V)` (positional args) |
| `Schema.decodeUnknownEither(schema)` | `Schema.decodeUnknownExit(schema)` for `Exit` results or `Schema.decodeUnknownOption(schema)` for `Option` |
| `Schema.Class.transformOrFail<T>("T")({fields}, {decode, encode})` | `sourceSchema.pipe(Schema.decodeTo(targetStruct, SchemaTransformation.transformOrFail({decode, encode})))` — keep as class with `Schema.Opaque<Self>()(schema)` |
| Schema class → `const + interface` pattern | **Do not do this.** Use `class Foo extends Schema.Opaque<Foo>()(schema) {}` to preserve class semantics |
| `Array.filterMap(arr, fn)` (using `Option`) | `Array.filterMap(arr, fn)` where `fn` returns `Result.succeed(mapped)` or `Result.fail(item)` — import `Result` from `"effect"` |
| `ParseResult.Type(ast, value, msg)` | `SchemaIssue.InvalidValue(Option.some(value), { message: msg })` |
| `ParseResult.Composite(ast, value, issues)` | `SchemaIssue.Composite(ast, Option.some(value), issues)` (ast still needed) |
| `ParseResult.succeed(x)` | `Effect.succeed(x)` |
| `Array.isNonEmptyArray` | `Array.isArrayNonEmpty` |
| `S.Schema<T, E, R>` (3 type params — schema with requirements) | `S.Codec<T, E, R>` — **IMPORTANT**: in v4, a schema with context/service requirements is `Codec<T, E, R>`, not `Schema<T, E, R>`. `Schema<T, E>` is always 2-param. **Never remove the R param — change `Schema` to `Codec` instead.** |
| `S.ParseResult.ParseError` | `S.SchemaError` |
| `schema.pipe(S.pick("field1", "field2"))` | `S.pick` removed. For Struct schemas: `(schema as Struct<F>).mapFields(({ field1, field2 }) => ({ field1, field2 }))`. Or access `schema.fields` to create a new struct: `S.Struct({ field: schema.fields.field })` |
| `S.propertySignature(schema)` | In v4 class definitions, just use the schema directly without `propertySignature` wrapper |
| `schema.pipe(S.compose(targetSchema))` | `schema.pipe(S.decodeTo(targetSchema))` — `compose` renamed to `decodeTo` |
| `S.Union(schema1, schema2, schema3)` | `S.Union([schema1, schema2, schema3])` — now takes array parameter instead of rest parameters |
| `import { FetchHttpClient } from "@effect/platform"` | `import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient"` — FetchHttpClient moved to effect core unstable |
| `ServiceClass.toLayer(effect)` | `Layer.effect(ServiceClass, effect)` — toLayer method removed, use Layer.effect function |
| `Layer.effect(ServiceMap.Opaque service, effect)` | May require `as any` cast on service parameter due to type system limitations with opaque branded services |
| `ast._tag === "Transformation"` | `"Transformation"` tag removed from AST. v4 AST tags are: `"Declaration"`, `"Objects"`, `"Arrays"`, `"Union"`, `"Filter"`, `"FilterGroup"`, plus primitive tags. |
| `AST.TypeLiteral` | `AST.Objects` (TypeLiteral renamed; use `SchemaAST.isObjects`) |
| `AST.getIdentifierAnnotation(ast)` | `SchemaAST.resolveIdentifier(ast)` (returns `string | undefined`) |
| `new AST.PropertySignature(name, type, ...flags)` | `new AST.PropertySignature(name, type)` (flags moved to type context) |

## Effect API

| v3 | v4 |
|---|---|
| `Effect.dieMessage("msg")` | `Effect.die("msg")` (accepts `unknown`, prefer plain string over `new Error`) |
| `Effect.catchAll((e) => Effect.dieMessage(...))` |  `Effect.mapError((e) => \`...\`).pipe(Effect.orDie)` (mapError returns string, not `new Error`) |
| `Effect.catchAll(() => Effect.succeed(value))` | `Effect.orElseSucceed(() => value)` — catch all errors and succeed with a value |
| `Effect.orElse(() => fallback)` | `Effect.catchCause(() => fallback)` |
| `Effect.all({ a: Config.string(...) })` | `Config.all({ a: Config.string(...) })` — use module's own `.all()` for Config/Either/Option |
| `Effect.either(effect)` | `Effect.result(effect)` — returns `Result` not `Either` |
| `Effect.catchAllCause(handler)` | `Effect.catchCause(handler)` |
| `Effect.zipRight(next)` | `Effect.andThen(next)` |
| `Effect.async<A, E>(cb => ...)` | `Effect.callback<A, E>(resume => ...)` — rename param `cb` → `resume` |
| `Effect.andThen(eff, _ => plainValue)` | `Effect.map(eff, _ => plainValue)` — `Effect.andThen` in v4 only accepts Effect-returning functions, not plain values |
| `Effect.mapError(option, () => error)` | `Effect.flatMap(effect, Option.match({ onNone: () => Effect.fail(error), onSome: Effect.succeed }))` — `Effect.mapError` no longer has polymorphic overloads for Option |
| `Effect.tap(() => sideEffect)` where `sideEffect` is not an Effect | `Effect.tap(() => Effect.sync(() => sideEffect))` — in v4, `Effect.tap` requires the callback to return an Effect, not a plain value or void |

## Either → Result

`effect/Either` is removed. Use `effect/Result`.

| v3 (`Either`) | v4 (`Result`) |
|---|---|
| `Either.Either<A, E>` | `Result.Result<A, E>` |
| `Either.left(e)` | `Result.fail(e)` |
| `Either.right(a)` | `Result.succeed(a)` |
| `Either.isLeft(r)` | `Result.isFailure(r)` |
| `Either.isRight(r)` | `Result.isSuccess(r)` |
| `r._tag === "Left"` | `r._tag === "Failure"` |
| `r._tag === "Right"` | `r._tag === "Success"` |
| `r.left` | `r.failure` |
| `r.right` | `r.success` |

## Layer API

| v3 | v4 |
|---|---|
| `Layer.scoped(tag, scopedEffect)` | `Layer.effect(tag, effect)` — `Layer.scoped` renamed to `Layer.effect`. Scope is automatically excluded from R. |

## Config API

| v3 | v4 |
|---|---|
| `Config.hashMap(Config.string(), "name")` | `Config.schema(Config.Record(Schema.String, Schema.String), "name")` — reads sub-keys (e.g. `NAME__key=val`) |


## Removed Modules

| v3 module | v4 replacement |
|---|---|
| `effect/Either` | `effect/Result` (see Either → Result section) |
| `effect/Arbitrary` (`LazyArbitrary`) | `LazyArbitrary` moved to `effect/Schema` |
| `effect/ParseResult` | `effect/SchemaParser` |
| `effect/Secret` (`SecretTypeId`) | `effect/Redacted` |

## Renamed Functions

| v3 | v4 |
|---|---|
| `ServiceMap.unsafeGet(map, tag)` | `ServiceMap.getUnsafe(map, tag)` |
| `Chunk.unsafeGet(chunk, i)` | `Chunk.getUnsafe(chunk, i)` |
| `FiberSet.unsafeAdd(set, fiber)` | `FiberSet.addUnsafe(set, fiber)` |
| `RequestResolver.makeBatched(fn)` | `RequestResolver.make(fn)` (same API, just renamed) |
| `Array.isNonEmptyReadonlyArray(arr)` | `Array.isReadonlyArrayNonEmpty(arr)` |
| `Array.chunk_(arr, n)` | `Array.chunksOf(arr, n)` |
| `Equivalence.string` | `Equivalence.String` (capitalized, like `Order.String`) |
| `Predicate.isNotNullable` | `Predicate.isNotNullish` |

## Fiber API

| v3 | v4 |
|---|---|
| `Fiber.RuntimeFiber<A, E>` | `Fiber.Fiber<A, E>` — `RuntimeFiber` namespace removed, use plain `Fiber` |

## Exit API

| v3 | v4 |
|---|---|
| `Exit.isInterrupted(exit)` | `Exit.hasInterrupts(exit)` — check if exit has interrupts |
| `Exit.isFailure(exit)` | Still exists in v4 |

## Cause API

| v3 | v4 |
|---|---|
| `Cause.isFailure(cause)` | `Cause.hasFails(cause)` — check if cause contains typed errors |
| `Cause.isDie(cause)` | `Cause.hasDies(cause)` — check if cause contains defects |

## Context / ServiceMap

| v3 | v4 |
|---|---|
| `Context.Context<R>` (as type for service context) | `ServiceMap.ServiceMap<R>` |
| `Context.empty()` | `ServiceMap.empty()` |
| `Context.TagMakeId("Tag", makeEffect)<Self>()` — creates class with `use()`, `pipe()` | `ServiceMap.Service<Self>()("Tag", { make: makeEffect })` — auto-generates `Default` layer, `Layer.scoped(this, make)` in place of `this.toLayerScoped()` |
| `Effect.gen(function*() { return yield* MyReference })` — unwrapping a Reference/Service into an Effect | `MyReference.asEffect()` — use `.asEffect()` for turning a Reference or Service tag into an Effect |
| `class MyRef extends Context.Reference<MyRef>()("key", { defaultValue })` — class-based Reference with `static readonly layer` | **Keep the class pattern** — `effect-app` exports a custom `Context.Reference` that re-adds the curried `<Self>()("key", { defaultValue })` overload. `ServiceMap.Reference` in vanilla v4 is not curried, but `effect-app/Context.Reference` supports both the direct form `Context.Reference<ValueType>("key", { defaultValue })` and the class form `class X extends Context.Reference<X>()("key", { defaultValue }) { static readonly layer = Layer.effect(this, make) }`. Use `.asEffect()` to get an Effect from the reference. |

Example migration for `Context.TagMakeId`:
```ts
// v3
class MainFiberSet extends Context.TagMakeId("MainFiberSet", make)<MainFiberSet>() {
  static readonly Live = this.toLayerScoped()
  static readonly run = <A>(self: Effect.Effect<A>) => this.use((_) => _.run(self))
}

// v4
class MainFiberSet extends ServiceMap.Service<MainFiberSet>()("MainFiberSet", { make }) {
  static readonly Live = Layer.scoped(this, make)
  static readonly run = <A>(self: Effect.Effect<A>) => Effect.andThen(this, (_) => _.run(self))
}
```

## PubSub

| v3 | v4 |
|---|---|
| `pubsub.publish(msg)` (method call) | `PubSub.publish(pubsub, msg)` (module function — no instance method) |

## RPC (from `@effect/rpc` → `effect/unstable/rpc`)

| v3 | v4 |
|---|---|
| `Rpc.fromTaggedRequest(MyTaggedRequestClass)` | `Rpc.make(resource._tag, { payload: resource, success: resource.success, error: resource.failure })` |
| `Rpc.make(tag).pipe(Rpc.annotateContext(...))` | `.annotate(tag, value)` method still exists on Rpc |

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
| `@effect/platform/HttpClientError` | `effect/unstable/http/HttpClientError` |

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

## RpcMiddleware

| v3 | v4 |
|---|---|
| Custom `RpcMiddlewareV4<Provides, E, Requires>` | Use native `RpcMiddleware.RpcMiddleware<Provides, E, Requires>` from `effect/unstable/rpc/RpcMiddleware` |
| Custom `RpcMiddlewareDynamic<E, R, _Config>` | `extends RpcMiddleware.RpcMiddleware<never, E, R>` for structural compatibility |
| `TagClassAny extends AnyServiceWithProps` | `TagClassAny extends AnyService` — `AnyServiceWithProps` uses `ServiceMap.Service<any, RpcMiddleware<any, any, any>>` which fails with `exactOptionalPropertyTypes: true` due to invariant Shape + function parameter contravariance. `AnyService` uses `ServiceMap.Service<any, any>` which avoids this. |
| `TagClass.Base` missing `error` and `~ClientError` | V4's `AnyService` requires `error: Schema.Top` and `"~ClientError": any` — add them to `TagClass.Base` |

## Imports

Most `@effect/*` sub-packages are now consolidated into `effect`:
- `import { ServiceMap } from "effect"`
- `import { SchemaTransformation, SchemaIssue } from "effect"`
- `import { Result } from "effect"` (for filter/map operations replacing `Array.filterMap`)
- `import { ChildProcess } from "effect/unstable/process"`
- `import { ChildProcessSpawner } from "effect/unstable/process/ChildProcessSpawner"`
- CLI: `import { Argument, Command, Flag, Prompt } from "effect/unstable/cli"`

## Schema DecodingServices gotcha

- `S.Schema<T>` extends `Top` but does **NOT** override `DecodingServices`. So `Schema<T>["DecodingServices"]` = `Top["DecodingServices"]` = `unknown`.
- `S.Void` extends `Bottom<void, void, never, never, ...>` — has `DecodingServices: never`.
- `S.Optic<T, Iso>` extends `Schema<T>` with explicit `DecodingServices: never`.
- `S.Struct<Fields>` extends `Bottom<..., Struct.DecodingServices<Fields>, ...>` — computed from fields.
- When using `S.Codec.DecodingServices<S>` in generic contexts where `S extends S.Top`, TypeScript falls back to `Top["DecodingServices"]` = `unknown`. Pre-compute these at definition time and store as a property.
- Use `S.Void` instead of `S.Schema<void>` when a concrete "no services" schema type is needed.

## Vue-components migration notes

- `packages/vue-components` currently uses `tsconfig` with `moduleResolution: "node"`, which can fail to resolve v4-style package export maps (`effect/*`).
- `OmegaFormStuff.ts` is not a pure rename migration: it depends on old AST tag names / shapes (`TypeLiteral`, `TupleType`, `StringKeyword`, `UndefinedKeyword`, transformation wrappers).
  - In v4, AST node names are changed (`Objects`, `Arrays`, `String`, `Undefined`, etc.) and metadata extraction must be rewritten accordingly.

## TaggedRequest (v3) → TaggedRequestResult (v4)

- v3's `S.TaggedRequestClass` and `S.TaggedRequest` are removed in v4.
- Custom `TaggedRequestResult` type: intersection of `S.TaggedStruct<Tag, Payload>` with `{ new(...): any; _tag; fields; success; error; config; ~decodingServices }`.
- `~decodingServices` phantom property pre-computes `S.Codec.DecodingServices<Success> | S.Codec.DecodingServices<Error>` to avoid generic-context resolution issues.
- `RequestHandlers` uses `ReqDecodingServices<M[K]>` (property access) instead of re-computing `S.Codec.DecodingServices` in generic mapped types.

# Step 2: Migrate `packages/effect-app` to Effect v4

## Status: In Progress

## Findings

### Package Changes
- Remove `@effect/rpc` (dependency) → replaced by `effect/unstable/rpc`
- Remove `@effect/platform` (peerDep) → replaced by `effect/unstable/http/*`
- Update `effect` peerDep `^3.19.14` → `^4.0.0-beta.5`

### Breaking Changes

**Context → ServiceMap (mechanical)**
All `Context.*` replaced by `ServiceMap.*`. `effect/Context` module gone.
- `Context.TagClassShape<N, S>` → `ServiceMap.ServiceClass.Shape<N, S>`
- `Context.GenericTag<T>(id)` → `ServiceMap.Service<T>(id)` or `ServiceMap.Key<T>(id)`
- `Context.Tag<I, S>` type → `ServiceMap.ServiceTag<I, S>` or similar
- `Context.get`, `Context.getOrElse`, `Context.unsafeGet`, `Context.add`, `Context.mergeAll`, `Context.make` → `ServiceMap.*`

**FiberRef removed**
- `import * as FiberRef from "effect/FiberRef"` → use `References` from `effect`
- `FiberRef.currentLogAnnotations` → `References.CurrentLogAnnotations`
- `FiberRef.get(FiberRef.currentLogAnnotations)` → `Effect.serviceOption(References.CurrentLogAnnotations)` or `References.CurrentLogAnnotations` directly

**@effect/rpc → effect/unstable/rpc**
All import paths update, `RpcMiddleware.Tag` → `RpcMiddleware.Service`

**@effect/platform → effect/unstable/http**
All HTTP utility imports move to `effect/unstable/http/*`

**Blocker: Client subsystem**
- `Schema.TaggedRequest` REMOVED in v4
- `Rpc.fromTaggedRequest` REMOVED in v4
- `client/makeClient.ts` and `client/apiClientFactory.ts` need full rewrite

**Effect.Service.MakeDepsE/Out/In removed**
- Used in `Context.ts`'s `ServiceDef` and `DefineService` helpers
- Replace with manual type computation or remove deprecated helpers

## Progress

- [ ] Create task file (this file)
- [ ] Update package.json
- [ ] Run pnpm i
- [ ] Migrate Context → ServiceMap
- [ ] Migrate FiberRef → References
- [ ] Migrate HTTP imports
- [ ] Migrate RPC imports
- [ ] Rewrite client/makeClient.ts
- [ ] Rewrite client/apiClientFactory.ts
- [ ] Fix Context.ts type utilities
- [ ] pnpm lint-fix
- [ ] pnpm build (fix errors iteratively)
- [ ] Update findings.md

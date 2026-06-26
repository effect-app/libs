# Repository-derived query invalidation

Historically, resource clients relied on manual invalidation lists:

```ts
const options = {
  queryInvalidation: (queryKey) => [
    { filters: { queryKey } },
    SomeOtherQuery
  ]
}
```

That works, but it is easy to forget a query when a command starts touching
another repository. The derived invalidation path records what data a query
read and what data a command wrote, then invalidates cached queries whose
recorded reads intersect the command writes.

Manual invalidation still exists. Derived invalidation is an additional safety
net for data dependencies that can be observed at runtime.

## Mental model

The unit of dependency is a `DataDependency`:

```ts
type DataDependency =
  | { readonly type: "repo"; readonly name: string }
  | { readonly type: "signal"; readonly name: string }
```

- `repo(name)` represents a repository namespace, usually the name passed to
  `makeRepo(name, ...)`.
- `signal(name)` is available for non-repository data that still needs a stable
  invalidation topic.

Each request has a `DataDependencyRecorder` in context. Code can record:

```ts
yield* DataDependencies.read(DataDependencies.repo("PickList"))
yield* DataDependencies.write(DataDependencies.repo("PickList"))
```

Repository operations do this automatically, so most resource handlers do not
need to call `DataDependencies.read` or `DataDependencies.write` directly.

## End-to-end flow

1. A query runs through the Vue query helper or RPC client.
2. The request receives a fresh `DataDependencyRecorder`.
3. Repository reads record `repo(<repository name>)` as a read dependency.
4. The query result is returned with dependency metadata.
5. The client stores the query's read dependencies next to the TanStack Query
   cache entry.
6. A command runs through the mutation helper or RPC client.
7. Repository writes record `repo(<repository name>)` as a write dependency.
8. The command response metadata carries the write dependencies back to the
   client.
9. Vue mutation invalidation scans the query cache and invalidates every query
   whose recorded reads intersect the command writes.

In short:

```txt
query reads RepoA       -> query cache remembers RepoA
command writes RepoA    -> cached RepoA readers are invalidated
command writes RepoB    -> cached RepoA readers are left alone
```

## What repositories record automatically

`makeRepo` records dependencies at the repository boundary:

| Repository operation | Dependency recorded |
| -------------------- | ------------------- |
| `all`                | read                |
| `find`               | read                |
| `query`              | read                |
| `queryRaw`           | read                |
| mapped `all`         | read                |
| mapped `find`        | read                |
| `saveAndPublish`     | write               |
| `removeAndPublish`   | write               |
| `removeById`         | write               |
| mapped `save`        | write               |

The dependency name is the repository name:

```ts
const Products = makeRepo("Product", Product, {})
```

Any query that reads `Products` records:

```ts
{ type: "repo", name: "Product" }
```

Any command that writes `Products` records the same dependency as a write.

## RPC wire format

The RPC layer wraps payloads internally so dependency metadata can cross the
network without changing handler APIs.

Commands still return their plain success value to callers, but the transport
envelope includes:

```ts
{
  invalidateQueries: InvalidationKey[],
  dataDependencies: {
    reads: DataDependency[],
    writes: DataDependency[]
  }
}
```

Queries similarly return their plain payload to callers, while the RPC success
schema carries:

```ts
{
  payload: A,
  metadata: {
    dataDependencies: {
      reads: DataDependency[],
      writes: DataDependency[]
    }
  }
}
```

The client unwraps these envelopes and forwards the dependency metadata into
the local `DataDependencyRecorder`. This makes dependency propagation work for
both direct RPC clients and the Vue query/mutation helpers.

Stream commands emit dependency metadata in the same metadata chunks already
used for server-driven invalidation keys. Writes can therefore invalidate
queries mid-stream or when the stream completes.

## Vue cache integration

`makeQuery` runs each query under a fresh dependency recorder. After the handler
returns, it stores the query's read dependencies next to matching TanStack Query
cache entries.

The implementation uses a `WeakMap<Query, DataDependencies>` rather than
`query.meta`. TanStack Vue Query clones and reapplies observer options during
fetching, so runtime-learned metadata written into `query.meta` can be
overwritten by the observer's original options. The `WeakMap` is keyed by the
actual cache entry, disappears when the query is garbage-collected, and does
not affect TanStack's public options.

`makeMutation` records command writes and combines three invalidation sources:

1. client-side `queryInvalidation` options,
2. server-provided invalidation keys,
3. derived dependency invalidation.

All targets are grouped into predicate-based `invalidateQueries` calls so the
cache is not invalidated once per target when the options are equivalent.

## Manual invalidation still matters

Derived invalidation only sees what is recorded. Keep manual invalidation when:

- a command changes data outside a repository,
- a command affects an external service,
- a query reads data that is not represented by a repository operation,
- the relationship is semantic rather than data-access based,
- a command should invalidate a broader UI namespace than the actual writes.

Example:

```ts
const save = useMutation(SaveProduct, {
  queryInvalidation: (queryKey) => [
    { filters: { queryKey } },
    DashboardSummary
  ]
})
```

The command will still derive repository-based invalidation. The manual
`DashboardSummary` entry is added on top.

## Recording non-repository dependencies

Use `signal(name)` for data that has no repository boundary:

```ts
const ExchangeRates = DataDependencies.signal("ExchangeRates")

const getPrices = Effect.fnUntraced(function*() {
  yield* DataDependencies.read(ExchangeRates)
  return yield* fetchPrices
})

const refreshRates = Effect.fnUntraced(function*() {
  yield* updateRates
  yield* DataDependencies.write(ExchangeRates)
})
```

Any cached query that read `ExchangeRates` will be invalidated after a command
writes `ExchangeRates`.

Prefer repository dependencies when data is stored in a repository. Use signals
for external APIs, computed projections, caches, feature flags, or other shared
state that does not naturally pass through `makeRepo`.

## Resource and operation subscriptions

The important subscription is between a query cache entry and the dependencies
it read at runtime. In practice, resources do not need a separate static
"subscribe to repository" configuration if they actually access repositories
through `makeRepo`.

Static configuration can still be useful for virtual resources:

- A query composes several external sources.
- A command writes via a service that cannot record dependencies internally.
- A resource's dependency is known but not visible from its implementation.

In those cases, call `DataDependencies.read(signalOrRepo)` or
`DataDependencies.write(signalOrRepo)` in the handler or service method. That
keeps the dependency close to the real boundary instead of maintaining a
separate invalidation list beside the resource declaration.

## Precision and trade-offs

Repository dependencies are intentionally repository-level, not row-level.

If a query reads one `Product`, and a command writes a different `Product`, the
query is invalidated because both depend on `repo("Product")`. This is less
precise than row-level invalidation, but it is:

- easy to derive reliably,
- stable across query shapes,
- hard to forget,
- compatible with existing manual invalidation for broader or special cases.

Row-level dependencies can be introduced later by adding another dependency
shape, for example `{ type: "repo-item", name, id }`, but repository-level
tracking gives most of the maintainability win without making every query key
encode storage details.

## Where the pieces live

- `packages/effect-app/src/DataDependencies.ts`
  - dependency schemas,
  - recorder service,
  - helpers for `repo`, `signal`, `read`, `write`, and `intersects`.
- `packages/effect-app/src/Model/Repository/internal/internal.ts`
  - automatic repository read/write recording.
- `packages/effect-app/src/rpc/Invalidation.ts`
  - metadata schemas for command/query/stream envelopes.
- `packages/infra/src/routing.ts`
  - per-request recorder wiring on the server.
- `packages/effect-app/src/client/apiClientFactory.ts`
  - client unwrapping and metadata forwarding.
- `packages/vue/src/query.ts`
  - query read dependency capture.
- `packages/vue/src/dependencyMetadata.ts`
  - WeakMap storage for TanStack Query cache entries.
- `packages/vue/src/mutate.ts`
  - derived invalidation from command writes.

## Test coverage

The main coverage is:

- `packages/infra/test/repository-ext.test.ts`
  - repository operations record expected reads and writes.
- `packages/infra/test/rpc-e2e-invalidation.test.ts`
  - dependency metadata survives the real HTTP/RPC client and server path.
- `packages/vue/test/dependencyInvalidation.test.ts`
  - Vue queries that recorded reads are invalidated when a mutation writes an
    intersecting dependency.

Useful focused commands:

```sh
pnpm --filter @effect-app/infra test -- rpc-e2e-invalidation.test.ts repository-ext.test.ts --runInBand
pnpm --filter @effect-app/vue test -- dependencyInvalidation.test.ts --runInBand
pnpm check
```

# Atom query API redesign

This branch can stop treating Effect atoms as an implementation detail hidden behind a TanStack-shaped API. The useful durable primitive is the atom; Vue refs, suspense promises, refetch helpers, and future hydration should all be adapters around it.

## Source findings

Relevant upstream Effect v4 atom APIs checked locally:

- `repos/effect/packages/effect/src/unstable/reactivity/Atom.ts`
  - `AtomRuntime.atom` turns an `Effect` into `Atom<AsyncResult<A, E>>`.
  - `Atom.family` gives structural cache identity by input.
  - `Atom.swr`, `Atom.withRefresh`, `Atom.setIdleTTL`, and `Atom.keepAlive` already model stale reads, polling, idle lifetime, and keep-alive.
  - `Atom.mapResult` and `Atom.transform` are the right composition layer for `select` and derived queries.
  - `Atom.optimistic` / `Atom.optimisticFn` can replace our current no-op optimistic `useUpdateQuery` facade.
  - `Atom.toStreamResult`, `Atom.getResult`, `Atom.refresh`, and `Atom.mount` provide Effect-native conversion points.
- `repos/effect/packages/effect/src/unstable/reactivity/AtomRegistry.ts`
  - `getResult(registry, atom, { suspendOnWaiting: true })` is the precise operation we need for awaitable refetch and Vue suspense.
  - Registries are independent; relying on the module-global `defaultRegistry` leaks a policy decision into the query engine.
- `repos/effect/packages/effect/src/unstable/reactivity/AtomRpc.ts`
  - Upstream RPC integration exposes `query(tag, payload)` as an atom and `mutation(tag)` as an atom result function. This is the shape we should mirror for effect-app clients.
- `repos/effect/packages/effect/src/unstable/reactivity/Hydration.ts`
  - Serializable atoms support `dehydrate` / `hydrate`; Nuxt SSR can use that later without inventing query-specific prefetch state.
- `repos/effect/packages/atom/vue/src/index.ts`
  - Vue integration is intentionally thin: `useAtomValue`, `useAtom`, `injectRegistry`, `registryKey`.
  - There is no special query abstraction upstream; the app layer should own the ergonomic client API.

## Current problems

- `query.ts` still exposes TanStack vocabulary and types: `UseQueryReturnType`, `QueryObserverResult`, `RefetchOptions`, `initialData`, `placeholderData`, `gcTime`, `refetchInterval`, and tuple returns.
- The raw query atom is hidden in the fourth tuple slot. That makes composition awkward and encourages helper APIs to tunnel through private handles.
- Query family identity must be stable by query key plus projection hash, while observer options stay outside the family. Otherwise projected and unprojected clients can accidentally share a base atom.
- `useUpdateQuery` accepts an updater but cannot apply it because query atoms are read-only derived atoms there; it currently refreshes and ignores the updater.
- Legacy stream query `.query()` is still collapsed into `Stream.runCollect`, so the compatibility API behaves like a slow normal query. Stream query clients now also expose atom-native `.atom()`, `.family()`, and `.queryNew()` helpers backed by `Atom.pull`, so new call sites can observe incremental pull state without waiting for stream completion.
- The default atom registry is used in invalidation-await logic. That works for today but blocks scoped registries, SSR hydration, and tests that provide a custom registry.

## Compatibility boundary

Keep the existing public APIs intact while the internals move to atom-native composition:

- `client.X.query(...)` keeps its current tuple return shape.
- `client.X.suspense(...)` keeps returning a Promise of that tuple shape.
- Existing options remain accepted on old APIs, but their behavior should be fixed internally. In particular, handler-global base atoms should be shared, while observer-specific behavior such as `select`, polling, SWR/focus policy, and structural sharing is layered on top.

Only expose breaking or meaningfully different APIs under new names:

- `client.X.atom(input, options?)`
- `client.X.queryNew(input, options?)`
- `client.X.suspenseNew(input, options?)`

This lets the app test the new shape in real call sites without forcing a broad migration, and lets old API users benefit from the internal option-sharing fix.

## Target client shape

Keep query helpers on the typed clients, like mutations:

```ts
const atom = client.Carts.List.atom(input, options)
const query = client.Carts.List.queryNew(input, options)
const suspense = await client.Carts.List.suspenseNew(input, options)
```

`suspenseNew` stays a `Promise`, because Vue setup / Suspense wants a Promise boundary.

The proposed breaking return shape is an object:

```ts
interface QueryView<A, E> {
  readonly result: ComputedRef<AsyncResult.AsyncResult<A, E>>
  readonly data: ComputedRef<A | undefined>
  readonly atom: ComputedRef<Atom.Atom<AsyncResult.AsyncResult<A, E>>>
  readonly awaitResult: () => Effect.Effect<A, E, never>
  readonly refetch: () => Effect.Effect<A, E, never>
  readonly refresh: () => void
}

interface SuspenseQueryView<A, E> extends Omit<QueryView<A, E>, "data"> {
  readonly data: ComputedRef<A>
}
```

`queryNew()` returns `QueryView<A, E>`. `suspenseNew()` returns `Promise<SuspenseQueryView<A, E>>`.

This removes tuple slot meaning, makes `refetch` obviously awaitable, and exposes the atom for composition.

## Atom-first internals

Split the implementation into two layers:

- `atomQuery.ts`: build and compose atoms.
  - `queryAtom(handler, input, options)` returns `Atom<AsyncResult<A, E>>`.
  - `queryFamily(handler)` is stable by query key plus projection hash and does not capture observer options.
  - `awaitQueryAtom(registry, atom)` delegates to `AtomRegistry.getResult`.
  - `refreshQueryAtom(registry, atom)` delegates to `registry.refresh`.
- `query.ts`: Vue adapter only.
  - Resolve refs/getters/options.
  - Call `useAtomValue`.
  - Return `QueryView` / `SuspenseQueryView`.
  - Convert to Promise only inside `useSuspenseQuery`.

Options that affect a single observer should wrap the shared raw atom rather than mutate handler-family identity:

```ts
const raw = family(input)
const selected = select ? Atom.mapResult(raw, select) : raw
const refreshed = refreshEvery
  ? Atom.withRefresh(refreshEvery)(selected)
  : selected
const viewed = Atom.swr({ staleTime, revalidateOnFocus, focusSignal })(
  refreshed
)
```

TTL is the awkward option. If TTL is part of the base atom, it should be a client/default policy, not the first observer's option. For old APIs, keep accepting `gcTime`, but normalize it into a base-atom policy that cannot be captured accidentally by the first observer. For new APIs, prefer an atom-native `idleTTL` or `timeToLive` name.

## TanStack parity: observers, TTL, and cancellation

Observer cleanup and cache lifetime are separate concerns:

- Vue observers are registered through `@effect/atom-vue`'s `useAtomValue`, which uses a Vue `watchEffect` cleanup around `registry.subscribe`. Non-suspense component unmounts therefore remove observer subscriptions through normal Vue scope disposal.
- Suspense helpers still load through native query atoms. The `Promise` returned by `.suspense()` / `.suspenseNew()` is only the Vue Suspense boundary that waits for `AtomRegistry.getResult`. Suspense setup runs in an explicit child `effectScope`; unmount stops that scope, removes the observer subscription, and aborts the waiting Effect so the Suspense Promise does not remain pending after the component is gone.
- Observer-specific wrappers (`select`, SWR, focus revalidation, polling, structural sharing) must not get their own idle TTL. Otherwise a wrapper can keep source atoms observed after the component unmounts. TTL belongs to the canonical handler+input query atom.
- The canonical query atom keeps its configured idle TTL after the last observer is gone. This preserves cached data and lets invalidation still reach cached-but-unmounted queries during the idle window.

Current difference from TanStack Query:

- TanStack creates an `AbortSignal` for each fetch. When the last observer is removed, it cancels the active retryer only if the query function consumed the signal; otherwise it cancels retries and lets the in-flight request finish so the result can populate cache.
- Atom query currently does not cancel the canonical query atom's in-flight Effect merely because the last observer unmounted, because the canonical atom node can remain alive for `idleTTL`.
- If canonical fetch cancellation is added later, it must match TanStack's observable state semantics: cancellation is control flow, not query data. Interrupting an in-flight fetch must not store an interrupt cause as the final `AsyncResult`; it should revert to the previous settled state, or to initial/idle when there is no previous result.
- The desired parity target is: last observer gone -> remove observer subscriptions immediately; if no observers remain, interrupt the active fetch without recording an interrupt failure; keep the previous cached result until `idleTTL` expires.

## Option names

Use atom-native names on the new APIs. Keep old option names on old APIs:

- `gcTime` -> `idleTTL` or `timeToLive`
- `refetchInterval` -> `refreshEvery`
- `refetchOnWindowFocus` -> `revalidateOnFocus`
- `select` can stay; it is a familiar projection name and maps cleanly to `Atom.mapResult`.
- Drop `initialData` and `placeholderData` from the new core API. Keep them accepted by old APIs if compatibility requires it, but implement them as wrappers/fallbacks over atoms rather than query-engine state.

## Composition API

Expose enough atoms that app code can compose before Vue refs:

```ts
const cartsAtom = client.Carts.List.atom(undefined)
const spotsAtom = client.Spots.List.atom(undefined)

const pageAtom = Atom.make((get) => ({
  carts: get.result(cartsAtom, { suspendOnWaiting: true }),
  spots: get.result(spotsAtom, { suspendOnWaiting: true })
}))
```

For plain result composition, add an atom-native replacement for `composeQueries`:

```ts
const combined = composeQueryAtoms({
  carts: client.Carts.List.atom(undefined),
  spots: client.Spots.List.atom(undefined)
})
```

The existing `composeQueries` can remain as a Vue-ref convenience wrapper during migration.

## Optimistic updates

Replace `useUpdateQuery(query, input, updater)` with atom-level helpers:

```ts
const carts = client.Carts.List.optimistic(input)
const updateCart = client.Carts.Update.optimistic(carts, reducer)
```

Internally this should use `Atom.optimistic` / `Atom.optimisticFn`, not a manual cache patch. The mutation can still invalidate reactivity keys after success; optimistic atoms handle temporary UI state and rollback.

## Registry and full-stack notes

- The frontend plugin should provide an app-level `AtomRegistry` via `registryKey` instead of relying on `@effect/atom-vue`'s fallback `defaultRegistry`.
- `invalidateAndAwait` should await against the active registry, not a module global. A registry-aware mutation layer is cleaner than hidden global state.
- Serializable query atoms can unlock Nuxt SSR hydration later:
  - mark query atoms with `Atom.serializable` using request schema + stable input key,
  - dehydrate after server setup,
  - hydrate the client registry before mounting.
- Stream query clients expose pull atoms for real progress:
  - `client.Progress.Stream.atom(input)` returns `Atom.Writable<Atom.PullResult<A, E>, void>`,
  - `client.Progress.Stream.family()` returns the reusable atom family,
  - `client.Progress.Stream.queryNew(input)` returns a Vue view with `result`, `items`, `latest`, `done`, `pull`, and `pullAndAwait`.
  - Legacy `.query()` remains collect-to-array compatibility until call sites migrate.

## Migration plan

1. Refactor internals so a base query atom is shared per handler+input, then old and new APIs layer observer options on top. This fixes old API behavior without changing old API shape.
2. Add `client.X.atom(input, options?)`, `client.X.queryNew(input, options?)`, and `client.X.suspenseNew(input, options?)`. Update type tests to assert atom exposure and object-return typing.
3. Keep `.query()` and `.suspense()` as compatibility APIs. They can delegate to the new internal engine and adapt the result back to tuple shape.
4. Add one or two real frontend example conversions to `queryNew` / `suspenseNew`, preferably places that exercise:
   - a suspense read with `data` and `result`,
   - an awaitable `refetch`,
   - optionally `atom` composition if a small call site exists.
5. Keep most frontend call sites on the old tuple APIs so both surfaces are exercised during the transition.
6. Replace `useUpdateQuery` call sites with atom refresh or optimistic helpers after the new query surface proves out.
7. Convert legacy stream query call sites from collect-to-array `.query()` to pull/accumulating `.queryNew()` / `.atom()` APIs.
8. Add registry provider + hydration experiments after the client API is stable.

## Recommendation

Do direct atom exposure and the breaking object API together, but under additive names first. Keep `suspense()` as the compatibility Promise tuple and add `suspenseNew()` as the Promise object API. The Promise should remain a framework boundary over `AtomRegistry.getResult`, not the internal shape. The API should make the atom visible, because that is where Effect v4 gives us composition, refresh, hydration, streams, and optimistic state.

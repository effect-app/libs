# Mutation and command atoms

Keep query and cache state atom-native. Keep ordinary mutations Effect-based and wrap them in `Command` when they need UI state. Use an atom-backed mutation only when its state is itself shared application state.

## Why

Query state is durable, keyed by handler and input, shared across components, and refreshed by invalidation. Command state usually belongs to one invocation: `waiting`, `blocked`, progress, errors, toasts, and follow-up Effects.

`makeMutation` already records invalidation keys and data-dependency writes, then awaits affected atom queries. A mutation does not need to be an atom for cache coherence.

`Command.fn` and mutation `.wrap()` add action identity, local reactive state, error handling, confirmation, toasts, and stream progress around an Effect.

## Prefer `Command`

Use the existing Effect-based mutation path when:

- The mutation returns `void` or a small value.
- Its shared effect is query invalidation.
- Only the initiating surface needs `waiting`, `blocked`, progress, or errors.
- The result is immediately composed with validation, navigation, emitted events, or other Effects.
- Nothing must observe the invocation after that surface unmounts.

## Prefer an atom

Use atom-backed mutation state when:

- Distant components observe the same invocation.
- State is keyed per entity and instances must be tracked independently.
- Other atoms derive from the mutation state.
- Long-running progress must survive component remounts.
- Optimistic state belongs in the same graph as the canonical entity state.

Effect provides `Atom.fn`, `AtomRuntime.fn`, and mutation helpers in `AtomRpc` and `AtomHttpApi`. These expose one `AsyncResult` state cell. Before using one as an application command, define its keying, lifetime, reset behavior, concurrency, and how individual callers receive results.

## Recommended split

1. Queries, entities, caches, and live projections: atoms.
2. Cache invalidation: the existing atom-query invalidation path.
3. Ordinary user actions: Effect-based mutations wrapped with `Command` as needed.
4. Shared, keyed, or long-lived action state: an atom-backed command abstraction with explicit concurrency semantics.

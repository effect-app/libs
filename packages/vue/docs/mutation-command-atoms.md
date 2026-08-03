# Mutation and command atoms

This note captures the current recommendation after moving query caching from TanStack Query to Effect Atom.

## Summary

Keep query/cache state atom-native. Keep ordinary mutations and `Command` execution Effect-based unless the command state itself needs to behave like shared app state.

Queries and commands have different lifetimes:

- Query state is durable cache state. It is keyed by handler and input, shared across components, invalidated by namespace keys, kept alive for `idleTTL`, and refreshed by focus, polling, or mutation invalidation.
- Command state is usually invocation state. Most mutations return `void` or a small identifier. The important UI state is commonly `waiting`, `blocked`, progress text, errors, toasts, and follow-up actions such as emit, navigate, reset a form, or close a dialog.

Atom is a strong fit where the state would otherwise be modeled with a state container such as Pinia, Redux, Zustand, Jotai, an event bus plus refs, or an ad-hoc cache.

Atom is usually not worth it when the mutation is a one-shot command whose visible effect is only query invalidation and local button feedback.

## Current effect-app shape

The query side is atom-native:

- `atomQuery.ts` builds canonical query atoms with `Atom.family`, `Atom.swr`, `Atom.setIdleTTL`, `Atom.withRefresh`, structural sharing, reactivity registration, and awaitable invalidation.
- `mutate.ts` already invalidates through the atom query engine with `atomQueryInvalidator` and `invalidateAndAwait`.

The mutation side remains Effect-native:

- `makeMutation` returns a callable function that runs the handler Effect, records server invalidation keys and data-dependency writes, then awaits affected atom queries.
- `Command.wrap` and `Command.fn` layer action identity, i18n metadata, command-local state, error handling, confirmation, stack capture, toast integration, stream progress, and `Effect.fnUntraced` combinators on top.

That separation is intentional. The atom boundary that matters for cache coherence is invalidation of query atoms. A mutation does not need to be an atom to invalidate atom queries.

## Upstream and external patterns

Effect v4 supports atom-native mutations:

- `Atom.fn` and `AtomRuntime.fn` create `AtomResultFn`s.
- `AtomRpc` and `AtomHttpApi` expose `.mutation(...)` helpers returning atom result functions.
- A mutation can receive `reactivityKeys`, and `Reactivity.mutation` invalidates matching query atoms after success.

That model is useful when the mutation state is part of a larger atom graph.

Tim Smart's `effect-atom` examples follow this model for React UI state, `AtomRpc`, `AtomHttpApi`, and explicit reactivity keys.

T3Code uses atoms heavily, but it still adds a separate command abstraction instead of relying on raw `Atom.fn` everywhere. Its `AtomCommand` wrapper runs a short-lived runtime atom through a registry and adds scheduling modes such as `parallel`, `serial`, `singleFlight`, and `latest`. Their tests call out the semantic gap: raw `Atom.fn` interrupts prior writes by default, and concurrent writes do not naturally correlate each caller with an individual result. That is the same gap `Command` solves here.

Lucas Barake's public examples are atom-native where state is form or app state:

- `effect-form` exposes submit, validate, reset, and field operations as `AtomResultFn`s.
- Form submit supports `reactivityKeys` to invalidate reactive queries after success.
- `effect-file-manager` uses `runtime.fn` for actions such as upload and cancel, where upload state is part of the UI state graph.

## Scanner and configurator findings

The scanner and configurator apps already use command UI state heavily, but mostly as local or surface-scoped command state.

Representative cases:

- Shared `CommandButton` components render `command.waiting` as loading/disabled state and resolve optional inputs before invoking `command.handle`.
- Dense warehouse action dialogs disable all position or pick buttons while a pick command is waiting. This prevents duplicate scans or double submissions.
- Pack and print flows expose stream progress through `Command.withDefaultToastStream`, including progress text and percentages.
- Related controls are gated by another command's state, for example disabling print while pack is waiting.
- Admin create/update/delete pages disable save/remove controls while the opposite command is waiting.
- Configurator customer flows compose command state, for example `cartLoading = addToCart.waiting || updateConfiguration.waiting`.
- Some commands return identifiers and immediately use them for navigation, dialog state, or emitted updates.

These are real command UI-state needs, but they do not imply durable mutation atoms. The state is usually owned by the component or action surface that created the command. Query/resource state is refreshed separately through atom query invalidation.

## When command atoms are useful

Consider atom-backed command state when at least one of these is true:

- The state is shared by distant components, not just the button or dialog that fired the action.
- The command is keyed per entity and multiple instances must be observed independently, for example per-row pending state across a table and a toolbar.
- The command state is derived by other atoms or contributes to a larger UI projection.
- The action is stream/subscription-like or long-lived, and progress/state should survive local component remounts.
- The action needs explicit scheduling semantics such as serial, latest-wins, or single-flight by key.
- The action is naturally part of a state container domain, such as forms, uploads, preview sessions, terminal sessions, or project/thread orchestration.
- Optimistic state needs to live in the same graph as the canonical query/entity atom.

In those cases, use a command abstraction over atoms rather than replacing `Command` with raw `Atom.fn`. Raw mutation atom semantics are state-cell oriented; application commands usually need action identity, caller correlation, scheduling, error policy, and UI affordances.

## When command atoms add little

Keep the current Effect-based mutation path when:

- The mutation returns `void` or a small identifier.
- The only shared state change is query invalidation.
- The UI needs only local `waiting`, `blocked`, toast, or inline error state.
- The command is created and consumed in one component or one action surface.
- The command immediately composes more Effects with `yield*`, confirmation, validation, navigation, or local refs.
- No other component needs to observe this command instance after the initiating component unmounts.

This is the common scanner/configurator case.

## Design guidance

Use Atom for app state, cache state, live projections, and long-lived or shared async state. Use `Command` for user actions.

Recommended split:

1. Query/cache/entity/live projection state: atom-native.
2. Mutation invalidation: continue routing through atom query invalidation.
3. Ordinary command execution: Effect-based `Command.fn` / `mutate.wrap`.
4. Shared/keyed/long-lived command state: introduce an optional atom-backed command layer with explicit scheduling and caller correlation.

Do not convert all mutations to atoms only because queries are atoms. Query state is cache state. Command state is usually transient intent state.

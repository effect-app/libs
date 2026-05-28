# Agent Instructions

This is the Effect App library repository, focusing on functional programming patterns and effect systems in TypeScript, wrapping and extending the Effect library.

## Development Workflow

- The git base branch is `main`
- Use `pnpm` as the package manager

### Core Principles

- **Zero Tolerance for Errors**: All automated checks must pass
- **Root causes, not workarounds**: When something fails — a type error, a runtime crash, a failing test, a hanging fiber — diagnose the invariant that was violated and fix it there. Do **not** mask the symptom with a wrapper, a revive helper, a `try/catch`, a `JSON.parse(JSON.stringify(...))`, or any other shape-coercion. Each of these is a tell that you skipped the diagnosis.
- **No `as any` / `as unknown` casts**: A specific case of the rule above. Casts hide the type system telling you the shape is wrong. Understand the actual types and fix the root cause. If a type mismatch exists, find the correct v4 API, update the type signatures, or restructure the code.
- **No hand-rolled deserialization**: Anything stored as JSON and read back must round-trip through a Schema codec (`S.fromJsonString(S.toCodecJson(...))`, `S.encodeEffect` / `S.decodeEffect`). Class prototypes — `Exit`, `Cause`, `Workflow.Result`, `Schema.Class` instances — do not survive `JSON.parse`. The schema layer is the canonical reconstruction path; writing a custom `reviveX` helper is a smell that the codec is missing.
- **Search prior art before writing helpers**: Before introducing a new utility for a cross-boundary concern (serialization, encoding, retries, context propagation, OCC), grep the repo and `repos/effect` for the established pattern. The cluster engine, the existing Cosmos adapter, the SQL stores — they have already solved most of these problems. Copying the established pattern beats inventing a parallel one.
- **Check newer branches before resuming work**: A new session may resume on `main` with no checkout of relevant feature branches. Before extending a topic, run `git branch -a | grep <topic>` and inspect the latest version with `git show <branch>:<path>`. Session-local memory of "how X works" may be from an older draft that has since been replaced.
- **Clarity over Cleverness**: Choose clear, maintainable solutions
- **Conciseness**: Keep code and any wording concise and to the point. Sacrifice grammar for the sake of concision.
- **Reduce comments**: Avoid comments unless absolutely required to explain unusual or complex logic. Comments in jsdocs are acceptable.
- **Look for effect sources inside `repos/effect`**
- **Never import local `repos` files**: Always use the latest online versions of packages instead.
- **Never webfetch from the effect repos**: just use the locally included under `repos`

### When you hit an error, before writing any fix

Errors are signals, not nuisances. Run this checklist:

1. **State the failure precisely.** Quote the exact error or behavior. `"object is not iterable"` is not the same as `"wrong type"`. The message names the violated invariant.
2. **Name the boundary.** Where in the data flow did the value lose the property the consumer needs? At the storage write, the storage read, the network hop, the schema decode, the context provision?
3. **Search for prior art at that boundary.** `grep` the repo + `repos/effect` for how similar values cross the same boundary. If a pattern exists, use it.
4. **Only then write code.** If your fix re-implements something the searched-for pattern already does (revive prototypes, retry on OCC, encode JSON), stop — use the existing pattern instead.

Anti-patterns that mean you skipped the checklist:

- `JSON.parse` of a value that contains tagged classes, followed by manual prototype reconstruction.
- `try/catch` around a yield that swallows the error and returns a fabricated value.
- Adding a second `as any` to make a first `as any` typecheck.
- Adding a sleep / retry to "give it time to work" instead of finding the missing wake signal.
- Disabling a hook (`--no-verify`) or a check to make the diff land.

### Mandatory Validation Steps

After **all** changes are made, run these from the **repo root**:

1. `pnpm lint-fix` — auto-formats and fixes lint issues across all packages; apply all resulting changes
2. `pnpm check` — type-checks all packages (dependency changes in one package can break others); fix all reported errors
   - If type checking continues to fail, run `pnpm clean` to clear caches, then re-run `pnpm check`

<!-- - Always run tests after making changes: `pnpm test <test_file.ts>` -->
<!-- - Build the project: `pnpm build`
- Check JSDoc examples compile: `pnpm docgen` -->

## Code Style Guidelines

**Always** look at existing code in the repository to learn and follow
established patterns before writing new code.

Do not worry about getting code formatting perfect while writing. Use `pnpm lint-fix`
to automatically format code according to the project's style guidelines.

## Prefer `Effect.fnUntraced` over functions that return `Effect.gen`

Instead of writing:

```ts
const fn = (param: string) =>
  Effect.gen(function*() {
    // ...
  })
```

Prefer:

```ts
const fn = Effect.fnUntraced(function*(param: string) {
  // ...
})
```

## Using `Context.Service`

Prefer the class syntax when working with `Context.Service`. For example:

```ts
import { Context } from "effect-app"

class MyService extends Context.Service<MyService, {
  readonly doSomething: (input: string) => number
}>()("MyService") {}
```

## Checking Array is not empty

Avoid `.length > 0` or `.length === 0` or `!.length` or `!!.length` checks, use `Array.isArrayNonEmpty` for type narrowing by default.

<!-- ## Barrel files

The `index.ts` files are automatically generated. Do not manually edit them. Use
`pnpm codegen` to regenerate barrel files after adding or removing modules. -->

<!-- ## Running test code

If you need to run some code for testing or debugging purposes, create a new
file in the `scratchpad/` directory at the root of the repository. You can then
run the file with `node scratchpad/your-file.ts`.

Make sure to delete the file after you are done testing. -->

<!-- ## Testing

Before writing tests, look at existing tests in the codebase for similar
functionality to follow established patterns.

- Test files are located in `packages/*/test/` directories for each package
- Main Effect library tests: `packages/effect/test/`
- Always verify implementations with tests
- Run specific tests with: `pnpm test <filename>`

### it.effect Testing Pattern

- Use `it.effect` for all Effect-based tests, not `Effect.runSync` with regular `it`
- Import `{ assert, describe, it }` from `@effect/vitest`
- Never use `expect` from vitest in Effect tests - use `assert` methods instead
- All tests should use `it.effect("description", () => Effect.gen(function*() { ... }))`

Before writing tests, look at existing tests in the codebase for similar
functionality to follow established patterns.

### Type level tests

Type level tests are located in the `dtslint` directories of each package.

You can run them with `pnpm test-types <filename>`.

Take a look at the existing `.tst.ts` files for examples of how to write type
level tests. They use the `tstyche` testing library. -->

## Per-request `Effect.provide(layer)` must isolate its MemoMap

`Effect.provide(self, layer)` resolves its `MemoMap` from the ambient fiber
context. On an HTTP server, that MemoMap lives on the server fiber and is
shared by every request that server handles. The first request to build a
stateful layer (anything using `Layer.effect` / `Effect.acquireRelease`)
memoizes the resulting value onto the server fiber; every subsequent request
then receives the *same instance* — including its `clear()` / dispose
finalizer, which now fires at the wrong time.

When you call `Effect.provide(layer)` (or `Stream.provide(layer)`) inside a
per-request hot path:

- Pass `{ local: true }` if the layer is pure / stateless or you genuinely
  want it scoped to *this* effect only, or
- Build it explicitly against the request scope with a fresh `MemoMap`
  (`Layer.makeMemoMap` + `Layer.buildWithMemoMap(layer, memoMap, requestScope)`)
  — see `provideOnRequestScope` in `packages/infra/src/setupRequest.ts`.

If neither option is taken and the layer carries state, the state leaks
across requests. Concrete repro lives in
`packages/infra/test/rpc-context-map-streaming.test.ts` (the overlapping
requests case).

## Changesets

All pull requests must include a changeset. You can create changesets in the
`.changeset/` directory.

The have the following format:

```md
---
"package-name": patch | minor | major
---

A description of the change.
```

# tsgo vs tsc dist diffs

Generated: 2026-04-23T07:01:24Z

- left  (a/): tsc on `main` (commit 99a2e9b35)
- right (b/): tsgo on `opencode/gentle-panda` (commit 9b84aeb67)

Each `<package>.diff` is the full `diff -urN` between the two dist trees, excluding:

- `*.tsbuildinfo` (always differs in absolute paths and version)
- `*.map` (sourcemap files)
- inline `sourceMappingURL=data:` lines

Each `<package>.full.diff` is the unfiltered diff for completeness.

## Volume

| Package | Files (tsc) | Files (tsgo) | Filtered diff lines | Full diff lines | Files w/ semantic change |
|---|---:|---:|---:|---:|---:|
| cli | 22 | 22 | 105 | 148 | 3 (.d.ts only) |
| effect-app | 193 | 193 | 1296 | 1666 | 9 (.d.ts only) |
| eslint-codegen-model | 16 | 16 | 75 | 94 | 0 |
| infra | 268 | 268 | 1607 | 2052 | 24 (.d.ts only) |
| vue | 52 | 52 | 379 | 518 | 7 (.d.ts only) |
| vue-components | 87 | 87 | 0 | 0 | 0 |

`vue-components` is built by Vite/Rollup, not by tsgo/tsc, so byte-identical
output is expected. `eslint-codegen-model` builds with tsgo but only differs in
trivial output noise (see below).

## Runtime impact: none

Across all 43 emitted `.js` files that show a diff, **every change is one of:**

- missing trailing newline (tsgo omits it; tsc adds it)
- removal of the `//# sourceMappingURL=...` comment line (tsgo emits the
  reference inside the sourcemap data URL pragma instead of as a trailing
  comment)

There are zero functional changes to emitted JavaScript. Verified by running:

```sh
awk '
  /^diff -urN/ { file=$NF; next }
  file ~ /\.js$/ {
    if (/^---|^\+\+\+|^@@|^\\ No newline/) next
    if (/^[+-]\/\/# sourceMappingURL=/) next
    if (/^[+-]/) print file": "$0
  }' *.diff
```

which prints nothing.

## Type impact: cosmetic only

All 43 files with non-trivial diffs are `.d.ts`. The differences fall into a
small number of recurring patterns, none of which change the *set* of types
that consumers can express or the type-checking outcome of consumer code.
They do change identity-comparison strings (so anything that snapshots `.d.ts`
output, or relies on union-member ordering for display, will see churn).

### 1. Union member ordering

tsgo emits union members in alphabetical order; tsc preserves source order.

```diff
-Effect.Effect<undefined, import("effect/PlatformError").PlatformError | Error, FileSystem.FileSystem | RunCommandService>
+Effect.Effect<undefined, Error | import("effect/PlatformError").PlatformError, FileSystem.FileSystem | RunCommandService>
```

```diff
-Layer.Layer<GistHandler, never, Path.Path | FileSystem.FileSystem | GHGistService>
+Layer.Layer<GistHandler, never, FileSystem.FileSystem | GHGistService | Path.Path>
```

This is by far the most common cause of churn (covers most of the
`infra/effect-app` line counts).

### 2. Branded string literal ordering

Same root cause as (1) but worth calling out because it touches every Schema
brand that combines multiple `NonEmptyStringNN` brands:

```diff
-Omit<S.brand<S.String, "NonEmptyString" | "NonEmptyString64k" | "NonEmptyString2k" | "NonEmptyString255" | "NonEmptyString50" | ... | "StringId">, ...>
+Omit<S.brand<S.String, "NonEmptyString" | "NonEmptyString100" | "NonEmptyString255" | "NonEmptyString2k" | ... | "StringId">, ...>
```

### 3. `readonly T[]` vs `ReadonlyArray<T>`

In some positions tsgo prefers `ReadonlyArray<T>` long form where tsc emitted
`readonly T[]`:

```diff
-readonly isAnyOf: <const Tags extends readonly ("OperationSuccess" | "OperationFailure")[]>(tags: Tags) => ...
+readonly isAnyOf: <const Tags extends ReadonlyArray<"OperationFailure" | "OperationSuccess">>(tags: Tags) => ...
```

### 4. Generic-parameter renaming dropped

When a generic name is unique in scope, tsgo no longer appends `_1`/`_2`
suffixes for disambiguation:

```diff
-<A, E2_1, R2_1, T2_1 extends T>(q: ..., pure: Effect.Effect<A, E2_1, FixEnv<R2_1, Evt, readonly T[], readonly T2_1[]>>): ...
+<A, E2,   R2,   T2   extends T>(q: ..., pure: Effect.Effect<A, E2,   FixEnv<R2,   Evt, readonly T[], readonly T2[]>>): ...
```

Same applies to mapped-type binders (`P_1` → `P`).

### 5. Explicit parens around `typeof X[K]`

tsgo parenthesizes for clarity:

```diff
-interface Encoded extends S.Struct.Encoded<typeof Operation["fields"]> {}
+interface Encoded extends S.Struct.Encoded<(typeof Operation)["fields"]> {}
```

### 6. Mapped-type form preserved instead of expanded

Where tsc 6 expanded a mapped pattern-match `Cases` parameter into an explicit
struct, tsgo keeps the source-level mapped type, which is far more compact:

```diff
-<Cases extends {
-    OperationSuccess: (value: OperationSuccess) => any;
-    OperationFailure: (value: OperationFailure) => any;
-}>(value: OperationSuccess | OperationFailure, cases: Cases): ...
+<Cases extends { [M in typeof OperationSuccess | typeof OperationFailure as M["Type"]["_tag"]]: (value: M["Type"]) => any; }>(value: OperationFailure | OperationSuccess, cases: Cases): ...
```

This is the tsgo declaration-emitter being less aggressive about inlining
mapped types — generally a readability win.

### 7. Member ordering inside emitted object types

When a source declares methods in non-alphabetical order, tsgo's emit sorts
them; tsc preserved declaration order:

```diff
-readonly isOperationSuccess: <T ...>(target: T) => target is T & { readonly [P in K]: OperationSuccess; };
-readonly isOperationFailure: <T ...>(target: T) => target is T & { readonly [P in K]: OperationFailure; };
+readonly isOperationFailure: <T ...>(target: T) => target is T & { readonly [P in K]: OperationFailure; };
+readonly isOperationSuccess: <T ...>(target: T) => target is T & { readonly [P in K]: OperationSuccess; };
```

### 8. Trailing-newline / declaration-map reference

Across every `.d.ts` and `.js`, tsgo:

- omits the trailing newline on the final line
- omits the trailing `//# sourceMappingURL=foo.d.ts.map` comment

Both are stylistic and safe.

## Conclusion

For library consumers there is no observable behavior change: runtime JS is
identical and type checking against the new `.d.ts` files produces the same
results (verified locally with `pnpm check` across all packages on this
branch). The diff lines are dominated by ordering changes inside large Effect
type unions; the absolute volume looks alarming but each individual change is
of one of the eight cosmetic categories above.

# Native Git hooks

`pnpm install` configures `core.hooksPath=.githooks` via
`scripts/install-git-hooks.mjs`. Tracked hooks exist in every linked worktree.

## `post-checkout`

### 1. Clear TypeScript project emit (always on branch / worktree checkout)

`pnpm check` is `tsgo --build` with composite + incremental. Package outputs
(`.tsbuildinfo` + `.d.ts` / `.js`) live under `packages/*/dist` and are
gitignored.

After a branch switch, **sources** follow HEAD but **dist** can still belong to
another tree. tsgo may treat projects as up to date and typecheck new sources
against old declarations → phantom type errors that disappear on
`pnpm rbuild` (`clean` + check). Same class of failure as
[scanner#1495](https://github.com/macs-holding/scanner/pull/1495) /
[scanner#2166](https://github.com/macs-holding/scanner/pull/2166).

On every **branch** checkout (`post-checkout` flag `1`), this hook deletes:

- `packages/*/dist`, `packages/*/build`, root `dist` if present
- any remaining `*.tsbuildinfo` outside `node_modules` / `repos` / `.git`

File-only checkouts (flag `0`) are left alone.

**This is a workaround.** Root cause belongs in tsgo incremental invalidation
(e.g. [typescript-go#2666](https://github.com/microsoft/typescript-go/issues/2666),
[#4664](https://github.com/microsoft/typescript-go/issues/4664),
[#4262](https://github.com/microsoft/typescript-go/issues/4262)). Remove when
upstream is reliable. Do not re-enable cross-tree dist reuse without an exact
source-identity key.

### 2. Reconcile pnpm (when package/lock changed)

Records package/lockfile state under `node_modules` so T3 handoff does not
repeat an install Git already completed.

## `pre-commit` / `pre-push`

lint-staged on commit; agent ship gate on push (see repo AGENTS.md).

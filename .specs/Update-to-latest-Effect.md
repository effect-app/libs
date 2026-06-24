# Update to latest effect packages

## Rules

- only include root `package.json` and packages under the `packages` folders

## Steps

1. run `pnpm test` and `pnpm lint-fix` to compare later
2. update package.json files
3. run `pnpm i`
4. commit the dep bump (package.json files + `pnpm-lock.yaml`) — `pnpm subtree:effect` runs `git subtree pull` which **requires a clean working tree** (`fatal: working tree has modifications. Cannot add.` otherwise). Commit before syncing.
5. run `pnpm subtree:effect` to sync the `repos/effect` subtree to the same version (creates its own squash-merge commit), then run `pnpm i` inside it.
6. run test and lint again, compare to from before the update.
7. create a changeset describing the changes
8. prepare commit (changeset + any test/lint fallout)

If new errors occur, first describe the problem, propose solutions and wait for answers.

## Notes

- subtree url: `https://github.com/Effect-TS/effect-smol.git`, prefix `repos/effect`, tag `effect@<version>`.
- v4 betas live under the npm `beta` dist-tag (npm `latest` is still v3). Find target with `npm view effect dist-tags`.

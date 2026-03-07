# Update to latest effect packages

## Rules

- only include root `package.json` and packages under the `packages` folders

## Steps

1. run test and lint to compare later
2. update package.json files
3. run `pnpm i`
4. update `repos/effect-v4` pointer to the same version we just updated the packages to.
5. run test and lint again, compare to from before the update.

If new errors occur, first describe the problem, propose solutions and wait for answers.

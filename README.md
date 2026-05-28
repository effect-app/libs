# Practical use of Effect-TS

This is an opinionated library for full-stack [Effect-TS](https://github.com/Effect-TS/core).
(See repositories for more info and discord link, articles, youtube videos, etc).

WIP [docs](https://github.com/effect-ts-app/docs)

See https://github.com/effect-ts-app/boilerplate for a sample app use.

## Package boundaries

- `effect-app`: service contracts and runtime-agnostic base logic.
- `@effect-app/infra`: backend / Node adapters.
- `@effect-app/vue`: Vue / browser adapters.

Migration targets introduced in this repo include:

- `@effect-app/infra/Emailer/service` -> `effect-app/Emailer`
- `@effect-app/infra/QueueMaker/service` -> `effect-app/QueueMaker`
- `@effect-app/infra/Store/service` -> `effect-app/Store`
- `@effect-app/infra/Model/*` -> `effect-app/Model/*`
- `@effect-app/vue/runtime` -> `effect-app/runtime`
- `@effect-app/vue/toast` -> `effect-app/toast`
- `@effect-app/vue/withToast` -> `effect-app/withToast`

## Update Effect Subtree

`repos/effect` is a git subtree of `https://github.com/Effect-TS/effect-smol.git`.

Recommended (uses the currently pinned `effect` / `@effect/*` version from package.json):

```sh
pnpm subtree:effect
```

Or directly via the CLI:

```sh
effa sync-effect
```

One-time remote setup (handled automatically by the command, or manually):

```sh
git remote add effect-smol https://github.com/Effect-TS/effect-smol.git
```

Manual update to a specific ref:

```sh
git fetch effect-smol --tags
git subtree pull --prefix=repos/effect effect-smol <ref> --squash
```

Example:

```sh
git subtree pull --prefix=repos/effect effect-smol @effect/ai-anthropic@4.0.0-beta.47 --squash
```

## Deployment

Uses [Changesets](https://github.com/changesets/changesets/blob/main/README.md)

1. make changes
2. generate and include changeset `pnpm changeset`
3. wait for build which creates a PR
4. inspect the PR, merge when alright
5. await new build and new package deployments

## Thanks

- All contributors
- Michael Arnaldi, Max Brown and the Effect-TS contributors for Effect
  - ZIO Contributors for the excellent ZIO
- Anyone else we're forgetting..

## How to view OmegaForm docs

On Mac:

1. `Shift + Command + P`
2. Select `Run Task`
3. Select `Run Storybook OmegaForm`
4. Will automatically open browser to http://localhost:6006/ Enjoy!

On Windows:

1. Select "Run Task"

```bash
cd packages/vue-components
```

2. run storybook

```bash
pnpm storybook
```

3. Will automatically open browser to http://localhost:6006/ Enjoy!

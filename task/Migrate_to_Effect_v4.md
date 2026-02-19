# Migration

Right now we are using Effect v3 (/repos/effect)
The task is about migrating to Effect v4 (/repos/effect-smol)

There are migration guides: 
- Announcement: https://effect.website/blog/releases/effect/40-beta/
- [v3 to v4 general](/repos/effect-smol/MIGRATION.md)
- [Schema v3 to v4](/repos/effect-smol/packages/effect/SCHEMA.md#migration-from-v3)

## Approach

1. Convert `cli` - as it's a standalone utility using minimal effect libraries.
2. Convert `effect-app` core
3. Convert `infra`
4. Convert `vue`
5. Convert `vue-components`

Each step will be completed individually, and only move on to the next step when the current is done succesfully.
For each step we should find out if we can convert 1:1 or certain things are missing preventing that.
Create task files for each, and track progress and findings in each.

## Conversion

We start with an as close as possible 1:1 conversion. In future tasks we can worry about refactoring.

1. replace `effect` and `@effect/*` package.json references, with their respective v4 counter parts (most @effect/* have moved into `effect/unstable/*`), rerun `pnpm i`
2. replace `effect` and `@effect/*` typescript references, with their respective v4 counter parts (most @effect/* have moved into `effect/unstable/*`)
3. use new names of v4 functions and modules accordingly

## Out of scope

- detect naming patterns we adopted from effect v3 in our libraries, and change them to match v4 naming patterns.

## Concerns

- `Effect.Service` has been removed, to ease migration, we may at first copy (and adjust to effect-smol) the original implementation, export it from `effect-app/core/Effect` and replace it at a later stage.

## Context

- The effect repo is located inside `/repos/effect`
- The effect-smol repo is located inside `/repos/effect-smol`

All repos can be kept uptodate with `git submodule foreach git pull origin main` and `git submodule foreach pnpm i`.

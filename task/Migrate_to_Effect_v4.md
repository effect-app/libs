# Migration

Right now we are using Effect v3 (/repos/effect)
The task is about migrating to Effect v4 (/repos/effect-smol)

There are migration guides: 
- Announcement: https://effect.website/blog/releases/effect/40-beta/
- [v3 to v4 general](/repos/effect-smol/MIGRATION.md)
- [Schema v3 to v4](/repos/effect-smol/packages/effect/SCHEMA.md#migration-from-v3)

## Steps

1. Convert `cli` - as it's a standalone utility using minimal effect libraries.
2. Convert `effect-app` core
3. Convert `infra`
4. Convert `vue`
5. Convert `vue-components`

Each step will be completed individually, and only move on to the next step when the current is done succesfully.
For each step we should find out if we can convert 1:1 or certain things are missing preventing that.

## Rules

- Always check `AGENTS.md` in the root of each repository to understand rules.
- You're allowed to use different versions of workspace packages within a project for the duration of the migration.
- Create task files for each Step in markdown files under `task/Migration` directory, and track progress and findings in each.
- Save all conversion findings in a `task/findings.md` file to speed up future migrations. 

## Conversion

We start with an as close as possible 1:1 conversion.

1. replace `effect` and `@effect/*` package.json references, with their respective v4 counter parts (most @effect/* have moved into `effect/unstable/*`), rerun `pnpm i`
2. replace `effect` and `@effect/*` typescript references, with their respective v4 counter parts (most @effect/* have moved into `effect/unstable/*`)
3. use new names of v4 functions and modules accordingly

## Conversion hints

- `Effect.all()` with `Config`, `Either`, `Option`, etc, should be replaced with `Config.all()` and so forth.
- `Effect.dieMessage("a message")` is now `Effect.die("a message")`
- Do not convert Schema classes to non classes (const+interface), instead use the `Schema.Opaque` helper if needed.
- `Array.filterMap` is replacable by effect's `Array.filter` with a `Filter.Filter` that filters and maps at the same time, using `Result` instead of `Option` it seems. 

## Out of scope

- detect naming patterns we adopted from effect v3 in our libraries, and change them to match v4 naming patterns.
- general refactorings and improvementsks

## Concerns

### `Effect.Service` migration to `ServiceMap.Service`

Before:
```ts
class GHGistService extends Effect.Service<GHGistService>()("GHGistService", {
  dependencies: [RunCommandService.Default],
  effect: Effect.gen(function*() {
    // ...
  })
} {}
```

After:
```ts
class GHGistService extends ServiceMap.Service<GHGistService>()("GHGistService", {
  make: Effect.gen(function*() {
    // ...
  })
}) {
  static DefaultWithoutDependencies = Layer.effect(this, this.make)
  static Default = this.DefaultWithoutDependencies.pipe(
    Layer.provide(RunCommandService.Default)
  )
}
```

## Context

- The effect repo is located inside `/repos/effect`
- The effect-smol repo is located inside `/repos/effect-smol`

All repos can be kept uptodate with `git submodule foreach git pull origin main` and `git submodule foreach pnpm i`.

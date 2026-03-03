# Migration

Right now we are using Effect v3 - effect (repos/effect-v3)
The task is about migrating to Effect v4 - effect-smol (repos/effect-v4)

There are migration guides:
- Announcement: https://effect.website/blog/releases/effect/40-beta/
- [v3 to v4 general](/repos/effect-v4/MIGRATION.md)
- [Schema v3 to v4](/repos/effect-v4/packages/effect/SCHEMA.md#migration-from-v3)

## Steps

0. First upgrade/replace all effect v3 packages with v4 counterparts in the repository. Make sure no references to v3 packages remain. Remove v3 patches.
1. Convert `cli` - as it's a standalone utility using minimal effect libraries.
2. Convert `effect-app` core
   - remove `Unify.ts`, it's obsolete
3. Convert `infra`
   - remove `api/internal/middlewares.ts` and all it's reexports from `api/middlewares.ts` 
4. Convert `vue`
5. Convert `vue-components`

Each step will be completed individually, and only move on to the next step when the current is done succesfully.
For each step we should find out if we can convert 1:1 or certain things are missing preventing that.
Commit every task you complete for every step.

## Rules

- Always check `AGENTS.md` in the root of each repository to understand rules.
  - Ignore the `#### New Features` section, instead follow `#### Migrations` for `### Mandatory Validation Steps`
- Consult the earlier mentioned Migration Guides for hints
- Create task files for each Step in markdown files under `task/Migration` directory, and track progress and findings in each.
- Save all conversion findings in a `task/findings.md` file to speed up future migrations. Read this file for every step!
- Never replace any function argument type with `any`
- Never cast to `any` as a "fix" (`(s as any)`)! nor recasting via `any` e.g `as any as S.Schema<any>`. or `unknown`: e.g `as unknown as S.Schema<any>`. Maybe you first need to fix other files.
<!-- - Never replace function bodies with placeholders. Real fixes only. Ask if you can't find a real solution. -->
- Consult the migration guides instead of making up assumptions. e.g `Schema<A, I, R>` is now `Codec<A, I, R>`
- Prioritise first fixing files that are dependencies of others (via direct or indirect imports).
  - Migrate and fix files in dependency order

## Process

- Always consult `findings.md` to help with migration or to fix build errors.
- When not finding the solution there, inspect the migration guides (this file, and the migration guides listed at the top), and source code in the `repos` folder
- Once finding a new solution, or fix mistakes, update `findings.md`

## Conversion

We start with an as close as possible 1:1 conversion.

1. replace `effect`, `@effect/*`, `@effect-*/*` package.json references, with their respective v4 counter parts (most `@effect/*` and `@effect-*/*` have moved into `effect/unstable/*`), rerun `pnpm i`
2. replace `effect`, `@effect/*` and `@effect-*/*`  typescript references, with their respective v4 counter parts (most @effect/* have moved into `effect/unstable/*`)
3. use new names of v4 functions and modules accordingly

## Conversion hints

- Use `.asEffect()` when trying to use `Option`, `Either` (`Result`), `Reference`, `Service` etc with `Effect` combinators
- `Effect.all()` with homogenous `Config`, `Either` (`Result`) or `Option` values, should be replaced with `Config.all()` and so forth. When heterogenous involved, use `.asEffect()`
- `Effect.dieMessage("a message")` is now `Effect.die("a message")`
- Do not convert Schema classes to non classes (const+interface), instead use the `Schema.Opaque` helper if needed.
- `Array.filterMap` is replacable by effect's `Array.filter` with a `Filter.Filter` that filters and maps at the same time, using `Result` instead of `Option` it seems. 
- If `pipe()` has been defined on a parent class, don't fix it by using `override pipe()` in a child class, just remove the method and rely on the inherited method.


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

## Out of scope

- detect naming patterns we adopted from effect v3 in our libraries, and change them to match v4 naming patterns.
- general refactorings and improvements

You can document these for follow-ups, in a task/followups.md file.

## Context

- The effect source code repository is located inside `repos/effect`
- The effect-smol source code repository is located inside `repos/effect-smol`

All repos can be kept uptodate with `git submodule foreach git pull origin main` and `git submodule foreach pnpm i`.

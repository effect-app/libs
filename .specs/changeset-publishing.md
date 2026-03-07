# Changesets Publishing

## Summary

Publish `effect-app`, `infra`, `vue` and `vue-components` under unified
versions using changesets' `fixed` groups.

## Background

All public packages must move in lockstep under a single version number (`4.0.0-beta.0`, `4.0.0-beta.1`, ...)
so consumers can install a coherent set of packages at any beta iteration.
Changesets supports this via **fixed version groups** (all packages in a group share the same
version).

## Goals

- All 4 public library packages publish the same version on every release.
- Developers continue using the standard `pnpm changeset` workflow.

## Non-goals

- No changes to the build system, CI pipeline scripts, or package contents.
- No independent versioning — all packages move together.
- No canary/nightly publishing strategy.

## How it works

### Fixed groups

The `fixed` field in `.changeset/config.json` takes an array of package-name
arrays. All packages in a group are bumped to the **same version** whenever any
one of them is included in a changeset. By placing all 24 public packages in one
group, a single changeset touching any package triggers a version bump for every
package.

### Version stability during pre-release

A common concern: won't a `minor` or `patch` changeset during the beta change
the base version (e.g., `4.0.0-beta.1` → `4.1.0-beta.0`)? No — changesets
prevents this via `pre.json`.

`pre.json` stores two critical fields:

- **`initialVersions`**: the version of each package when pre-release mode was
  entered (e.g., `3.0.0`).
- **`changesets`**: the IDs of every changeset applied since entering
  pre-release mode.

When `changeset version` runs, it computes the target version relative to
`initialVersions` using the **cumulative** bump of all tracked changesets (both
already-applied ones in `pre.json.changesets` and new pending ones). Because the
initial major changeset is always in the tracked set, the highest bump type is
always `major`, and the base version stays at `4.0.0` regardless of subsequent
patch or minor changesets. Only the beta counter increments.

Example:

1. Enter pre-release, `initialVersions` = `3.0.0`
2. Major changeset → `changeset version` → `4.0.0-beta.0` (major from `3.0.0`)
3. Developer adds a patch changeset → `changeset version` → `4.0.0-beta.1`
   (major still highest → base unchanged, counter increments)
4. Developer adds a minor changeset → `changeset version` → `4.0.0-beta.2`
   (major still highest → base unchanged, counter increments)

The base semver never drifts during the beta period.

### Combined behavior

With both features active, every `changeset version` + `changeset publish` cycle
produces a release where all 24 packages share `4.0.0-beta.<n>`.

## Setup steps

### 1. Update `.changeset/config.json`

Add the `fixed` group and change `access` to `"public"`:


## Ongoing workflow

### Adding changesets

Developers continue using `pnpm changeset` as usual. Because of the `fixed`
group, the bump type (patch/minor/major) of any individual changeset is
effectively irrelevant to the version number — all packages are already on a
major bump track. However, the changeset message still serves as the changelog
entry, so meaningful descriptions are important.

### Publishing a new version

```bash
npx changeset version   # bumps to 4.0.0-beta.(n+1)
npx changeset publish   # publishes all packages under "beta" tag
```

The counter auto-increments. No manual version editing is needed.

### CI integration

The existing CI publish workflow (typically `changeset version` +
`changeset publish` in a GitHub Action) works without modification. The
pre-release mode and fixed group are configuration-only — no script changes
required.

## Graduating to stable

When ready to release `4.0.0`:

```bash
npx changeset pre exit   # removes pre-release mode
npx changeset version    # sets all packages to 4.0.0
npx changeset publish    # publishes to "latest" dist-tag
```

After exiting, the `fixed` group can remain to keep packages in lockstep for
future `4.x` releases, or be removed if independent versioning is desired.

## Edge cases

### Workspace dependency ranges

`updateInternalDependencies: "patch"` ensures workspace `dependencies` and
`peerDependencies` are updated whenever a dependency's version changes. Because
all packages share the same version, cross-references will always point to the
current beta. Verify that dependency ranges use `workspace:^` (pnpm protocol) so
they resolve correctly during development and are rewritten to concrete ranges on
publish.

### npm version collision safety

Changesets' pre-release counter prevents collisions — `4.0.0-beta.0`,
`4.0.0-beta.1`, etc. are distinct versions. npm's immutability guarantees that a
published version can never be overwritten.


## Files to modify

| File                                            | Change                                        |
| ----------------------------------------------- | --------------------------------------------- |
| `.changeset/config.json`                        | Add `fixed` array, set `access` to `"public"` |

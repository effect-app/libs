const dprint = "dprint fmt --config dprint.jsonc"

/**
 * Staged files are linted as well as formatted, so a lint error is caught at the
 * commit that introduced it rather than at the push gate or in CI.
 *
 * Lint and format share one array rather than two glob entries: lint-staged runs
 * separate entries concurrently, and both of these rewrite the file. The globs
 * below are disjoint for the same reason.
 *
 * `oxlint` here is the fast, non-type-aware pass — what can run per file in the
 * time a commit should take. The full `--type-aware` lint and the format check
 * still run in the ship gate and in CI, so this narrows the feedback loop rather
 * than replacing them.
 *
 * `--no-error-on-unmatched-pattern` is required, not cosmetic: `.oxlintrc.json`
 * ignores whole categories of file — `.js`, `.jsx`, `.d.ts` and `repos/**` among
 * them — and without it oxlint exits non-zero on "No files found to lint", so
 * staging only an ignored file would block the commit for no reason.
 *
 * @type {import('lint-staged').Configuration}
 */
export default {
  "*.{ts,tsx,mts,cts}": [
    "oxlint --quiet --fix --no-error-on-unmatched-pattern",
    dprint
  ],
  "*.{js,jsx,mjs,cjs,json,jsonc,md,toml,css,scss,sass,less,html,yml,yaml}": dprint
}

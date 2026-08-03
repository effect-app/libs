# npm Trusted Publishing (OIDC)

Publish from GitHub Actions without a long-lived `NPM_TOKEN`.
npm mints a short-lived credential per workflow run via OIDC.

Official docs: https://docs.npmjs.com/trusted-publishers/

## Prerequisites

- You must be an **owner** (or have settings access) on each package below.
- Workflow that publishes: `.github/workflows/release.yaml` (filename is `release.yaml`).
- GitHub repo: `effect-app/libs` (public, GitHub-hosted runners).

## Packages to configure

Configure **each** publishable package (one trusted publisher per package):

| Package | npm settings URL |
| --- | --- |
| `effect-app` | https://www.npmjs.com/package/effect-app/access |
| `@effect-app/infra` | https://www.npmjs.com/package/@effect-app/infra/access |
| `@effect-app/vue` | https://www.npmjs.com/package/@effect-app/vue/access |
| `@effect-app/vue-components` | https://www.npmjs.com/package/@effect-app/vue-components/access |
| `@effect-app/cli` | https://www.npmjs.com/package/@effect-app/cli/access |
| `@effect-app/eslint-codegen-model` | https://www.npmjs.com/package/@effect-app/eslint-codegen-model/access |
| `@effect-app/eslint-shared-config` | https://www.npmjs.com/package/@effect-app/eslint-shared-config/access |

If the UI shows **Settings** / **Trusted Publisher** instead of `/access`, use that page for the same package.

## Exact steps on npmjs.com (per package)

Repeat for every package in the table:

1. Open the package page → **Settings** (or the access URL above).
2. Find **Trusted Publisher**.
3. Under **Select your publisher**, choose **GitHub Actions**.
4. Fill in exactly:
   - **Organization or user:** `effect-app`
   - **Repository:** `libs`
   - **Workflow filename:** `release.yaml`  
     (filename only, including `.yaml` — not `.yml`, not a path)
   - **Environment name:** leave **empty** (unless you later add a GitHub Environment to the job)
   - **Allowed actions:** select **`npm publish`** (required)
5. Save.

npm does **not** validate the config on save — mismatches only show up at publish time (often as `E404`).

## Order of operations (important)

1. **Configure trusted publishers** for all packages above (npm side).
2. **Merge** the PR with package `repository` fields + this doc + `.github/release.oidc.yaml`.
3. **Apply the workflow** (maintainer, local credentials with `workflows` permission):

   ```bash
   cp .github/release.oidc.yaml .github/workflows/release.yaml
   git add .github/workflows/release.yaml && git commit -m "ci: enable npm OIDC trusted publishing" && git push
   ```

4. On push to `main`, the Changesets workflow publishes any unpublished versions (e.g. `4.0.0-beta.299`).
5. Confirm success in the Actions log: look for  
   `No NPM_TOKEN found, but OIDC is available - using npm trusted publishing`.
6. After a successful OIDC publish, optionally harden each package:
   - **Publishing access** → **Require two-factor authentication and disallow tokens**
   - Revoke the old GitHub secret `NPM_TOKEN` and any automation tokens on npm.

Do **not** set `NPM_TOKEN` on the publish step once OIDC is intended — `changesets/action` will use the long-lived token instead of OIDC when that env var is present.

## GitHub workflow (apply once)

The intended Changesets workflow lives at **`.github/release.oidc.yaml`**.

A GitHub App without the `workflows` permission cannot update files under
`.github/workflows/`. A maintainer must apply it once:

```bash
cp .github/release.oidc.yaml .github/workflows/release.yaml
git add .github/workflows/release.yaml
git commit -m "ci: enable npm OIDC trusted publishing in Changesets workflow"
git push
```

That workflow includes:

- `permissions.id-token: write`
- Node `24` (latest 24.x; npm 12 needs Node ≥ `24.15` — pin the major, not a stale patch like `24.14`)
- Workflow upgrades to `npm@latest` after setup-node (OIDC needs npm ≥ `11.5.1`)
- **No** `NPM_TOKEN` on the publish step
- Package `repository.url` points at `https://github.com/effect-app/libs.git` (set in package.json)

## Troubleshooting

| Symptom | Likely cause |
| --- | --- |
| `E404` / “could not be found or you do not have permission” | Trusted publisher mismatch (org/repo/workflow filename), or OIDC not used because `NPM_TOKEN` is still set |
| `ENEEDAUTH` / unable to authenticate | Missing `id-token: write`, old npm CLI, or self-hosted runner (not supported) |
| Only some packages publish | Trusted publisher missing on those packages |

## Optional hardening

- GitHub **Environment** (e.g. `npm`) on the `version` job with required reviewers; if used, put the same environment name in every package’s trusted publisher config.
- Keep a **read-only** granular npm token only if install needs private packages (not required for this public monorepo today).

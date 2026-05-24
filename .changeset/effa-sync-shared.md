---
"@effect-app/cli": minor
---

Add `effa sync` / `effa sync-diff` / `effa sync-push` subcommands for syncing content (architecture docs, e2e helpers, ts-plugins) from `effect-app/shared` into consuming projects per a project-side `.shared.json` lockfile.

- `effa sync` — clone/checkout the shared repo at the pinned ref into `~/.cache/effa/shared/<slug>`, then copy the artifact map's files into the project (honoring `exclude`).
- `effa sync-diff` — sha256 compare each tracked file against the cache copy; reports `M` (modified locally), `D` (missing from project), `E` (excluded).
- `effa sync-push [--pr] [-m msg] [--branch name]` — branch in the cache off the pinned ref, copy modified project files in, commit, push. Optional `--pr` opens a PR via `gh pr create`.

Lockfile shape:

```json
{
  "repo": "github.com/effect-app/shared",
  "ref": "<sha>",
  "artifacts": { "<src-in-shared>": "<dest-in-project>" },
  "exclude": ["<src-path>"]
}
```

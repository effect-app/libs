---
"@effect-app/cli": patch
---

Add `effa sync --update [--ref <branch|tag|sha>]` to bump the pinned `ref` in `.shared.json` to the latest sha before syncing. Without `--ref` it resolves the shared repo's default branch HEAD; with `--ref` it resolves that ref (branches resolved against `origin/` so you get the latest remote commit). The resolved sha is written back to the lockfile. Omitting `--update` keeps the existing pin-and-sync behaviour.

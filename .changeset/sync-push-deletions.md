---
"@effect-app/cli": patch
---

`effa sync-push`: propagate locally-deleted synced files. Previously, files removed from the consuming project were silently skipped (the loop bailed when `destAbs` didn't exist). Now they're recorded as deletions, `git rm`'d in the cache branch, and listed in the PR body alongside modifications.

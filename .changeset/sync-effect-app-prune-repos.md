---
"@effect-app/cli": minor
---

Replace two-way `git subtree pull --squash` in `effa sync-effect-app` with clean pruned tree materialization (`git ls-tree` + `git mktree` + `git read-tree`): by default strip upstream's nested `repos/` directory and leave a `repos/README.md` pointer to the synced upstream commit URL, with `--include-repos` to opt in to keeping nested `repos/`.

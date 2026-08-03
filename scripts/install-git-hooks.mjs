#!/usr/bin/env node
/**
 * Points git at the repository's tracked hooks and generates the agent `gh`
 * policy shim. Runs from `prepare`.
 *
 * The shim is generated rather than committed because it embeds this checkout's
 * absolute path, which differs per clone and per worktree. `.envrc` puts the
 * directory on PATH, so it applies only while you are inside the repository.
 */
import { execFileSync } from "node:child_process"
import { chmodSync, mkdirSync, writeFileSync } from "node:fs"
import path from "node:path"
import process from "node:process"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

if (process.env["SKIP_PREPARE"]) {
  console.log("install-git-hooks: SKIP_PREPARE set, skipping")
  process.exit(0)
}

const installAgentGhShim = () => {
  const toolsBin = path.join(root, ".tools", "bin")
  mkdirSync(toolsBin, { recursive: true })
  const shimPath = path.join(toolsBin, "gh")
  writeFileSync(
    shimPath,
    `#!/usr/bin/env bash
# Installed by scripts/install-git-hooks.mjs — agent gh policy shim.
# Publishing a PR runs the ship gate first; only a failing gate stops it.
set -euo pipefail
exec node ${JSON.stringify(path.join(root, "scripts", "agent-gh.mjs"))} "$@"
`,
    { encoding: "utf8", mode: 0o755 }
  )
  try {
    chmodSync(shimPath, 0o755)
  } catch {
    // best-effort on platforms without chmod
  }
}

try {
  installAgentGhShim()
} catch (error) {
  console.error(`install-git-hooks: could not install agent gh shim: ${error?.message ?? error}`)
}

try {
  execFileSync("git", ["config", "core.hooksPath", ".githooks"], { cwd: root })
} catch (error) {
  const code = error?.code
  const message = String(error?.message ?? error ?? "")
  // Docker / tarball / no-git installs have nothing to configure. A real
  // worktree failure should still fail prepare.
  if (code === "ENOENT" || /not a git repository/iu.test(message) || /spawnSync git/iu.test(message)) {
    console.log("install-git-hooks: no git repository, skipping hooks")
    process.exit(0)
  }
  throw error
}

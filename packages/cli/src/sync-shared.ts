import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Path from "effect/Path"
import { RunCommandService } from "./os-command.js"

/**
 * Project-side lockfile shape (`.shared.json`).
 *
 * `artifacts` maps SOURCE path (inside the shared repo) to DEST path (inside the
 * consuming project). `exclude` lists source-relative paths to skip during sync.
 */
export interface SharedLockfile {
  readonly repo: string
  readonly ref: string
  readonly artifacts: Record<string, string>
  readonly exclude?: ReadonlyArray<string>
  readonly synced_at?: string
}

const sanitizeRepoSlug = (repo: string) => repo.replace(/[^A-Za-z0-9_.-]+/g, "_")

const repoCloneUrl = (repo: string) => {
  if (repo.startsWith("http") || repo.startsWith("git@")) return repo
  // "github.com/effect-app/shared" → "git@github.com:effect-app/shared.git"
  const m = repo.match(/^github\.com\/(.+?)\/(.+?)$/)
  if (m) return `git@github.com:${m[1]}/${m[2]}.git`
  return repo
}

const joinPosix = (a: string, b: string) => a.endsWith("/") ? a + b : a + "/" + b

const readLockfile = Effect.fnUntraced(function*(lockfilePath: string) {
  const fs = yield* FileSystem.FileSystem
  if (!(yield* fs.exists(lockfilePath))) {
    return yield* Effect.fail(new Error(`No ${lockfilePath} found in current directory.`))
  }
  const content = yield* fs.readFileString(lockfilePath)
  return { content, lockfile: JSON.parse(content) as SharedLockfile }
})

const ensureCache = Effect.fnUntraced(function*(lockfile: SharedLockfile) {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const { runGetExitCode } = yield* RunCommandService

  const home = process.env["HOME"] ?? process.env["USERPROFILE"]
  if (!home) return yield* Effect.fail(new Error("Cannot resolve home directory."))

  const cacheRoot = path.join(home, ".cache", "effa", "shared")
  const cachePath = path.join(cacheRoot, sanitizeRepoSlug(lockfile.repo))
  const cloneUrl = repoCloneUrl(lockfile.repo)

  if (!(yield* fs.exists(cachePath))) {
    yield* runGetExitCode(`mkdir -p ${JSON.stringify(cacheRoot)}`)
    yield* runGetExitCode(`git clone ${JSON.stringify(cloneUrl)} ${JSON.stringify(cachePath)}`)
  } else {
    yield* runGetExitCode("git fetch --all --tags --prune", cachePath)
  }

  yield* runGetExitCode(`git checkout ${JSON.stringify(lockfile.ref)}`, cachePath)

  return cachePath
})

/**
 * Walk artifact files. For each file in the artifact map (respecting excludes),
 * yields `{ srcRel, srcAbs, destAbs }`.
 */
const walkArtifacts = Effect.fnUntraced(function*(
  lockfile: SharedLockfile,
  cachePath: string
) {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const { runGetString } = yield* RunCommandService

  const excludeSet = new Set(lockfile.exclude ?? [])
  const results: Array<{ srcRel: string; srcAbs: string; destAbs: string; excluded: boolean }> = []

  for (const [srcRel, destRel] of Object.entries(lockfile.artifacts)) {
    const srcAbs = path.join(cachePath, srcRel)
    const destAbs = path.resolve(destRel)

    if (!(yield* fs.exists(srcAbs))) continue

    const stat = yield* fs.stat(srcAbs)

    if (stat.type === "File") {
      results.push({ srcRel, srcAbs, destAbs, excluded: excludeSet.has(srcRel) })
      continue
    }

    const fileList = yield* runGetString(`find ${JSON.stringify(srcAbs)} -type f`)
    for (const fileAbs of fileList.split("\n").filter((l) => l.trim() !== "")) {
      const relInArtifact = path.relative(srcAbs, fileAbs)
      const srcRelFull = joinPosix(srcRel, relInArtifact)
      const destFileAbs = path.join(destAbs, relInArtifact)
      results.push({
        srcRel: srcRelFull,
        srcAbs: fileAbs,
        destAbs: destFileAbs,
        excluded: excludeSet.has(srcRelFull)
      })
    }
  }

  return results
})

/**
 * Pull artifacts from the shared repo into the consuming project according to
 * `.shared.json`. Idempotent — running twice without changes is a no-op.
 *
 * MVP: overwrites destination files. Caller is expected to inspect `git status`
 * after sync to review local changes. Conflict handling lands in a follow-up.
 */
export const syncShared = Effect.fnUntraced(function*(opts: { lockfilePath?: string } = {}) {
  const fs = yield* FileSystem.FileSystem
  const path = yield* Path.Path
  const { runGetExitCode } = yield* RunCommandService

  const lockfilePath = opts.lockfilePath ?? ".shared.json"
  const { content: lockfileContent, lockfile } = yield* readLockfile(lockfilePath)

  yield* Effect.logInfo(`Syncing from ${lockfile.repo} @ ${lockfile.ref}`)

  const cachePath = yield* ensureCache(lockfile)
  yield* Effect.logInfo(`Cache: ${cachePath}`)

  const files = yield* walkArtifacts(lockfile, cachePath)

  let copied = 0
  let skipped = 0

  for (const { srcRel, srcAbs, destAbs, excluded } of files) {
    if (excluded) {
      yield* Effect.logInfo(`  exclude ${srcRel}`)
      skipped++
      continue
    }
    yield* runGetExitCode(`mkdir -p ${JSON.stringify(path.dirname(destAbs))}`)
    yield* runGetExitCode(`cp ${JSON.stringify(srcAbs)} ${JSON.stringify(destAbs)}`)
    copied++
  }

  const today = new Date().toISOString().slice(0, 10)
  const trailingNewline = lockfileContent.endsWith("\n") ? "\n" : ""
  const updated = { ...lockfile, synced_at: today }
  yield* fs.writeFileString(lockfilePath, JSON.stringify(updated, null, 2) + trailingNewline)

  yield* Effect.logInfo(`Sync complete: ${copied} copied, ${skipped} excluded.`)
  yield* Effect.logInfo("Review changes with: git status")
})

/**
 * Compare project files to cache files. Reports each file as one of:
 *   M  modified locally (project differs from cache)
 *   A  added locally (project has file, cache does not — for tracked artifacts)
 *   D  deleted locally (cache has file, project does not)
 *   E  excluded (skipped by lockfile)
 *
 * Files that match cache exactly are not listed.
 */
export const syncDiff = Effect.fnUntraced(function*(opts: { lockfilePath?: string } = {}) {
  const fs = yield* FileSystem.FileSystem
  const { runGetString } = yield* RunCommandService

  const lockfilePath = opts.lockfilePath ?? ".shared.json"
  const { lockfile } = yield* readLockfile(lockfilePath)

  yield* Effect.logInfo(`Diffing against ${lockfile.repo} @ ${lockfile.ref}`)

  const cachePath = yield* ensureCache(lockfile)
  const files = yield* walkArtifacts(lockfile, cachePath)

  const changes: Array<{ kind: "M" | "D" | "E"; srcRel: string; destPath: string }> = []

  for (const { srcRel, srcAbs, destAbs, excluded } of files) {
    if (excluded) {
      changes.push({ kind: "E", srcRel, destPath: destAbs })
      continue
    }

    if (!(yield* fs.exists(destAbs))) {
      changes.push({ kind: "D", srcRel, destPath: destAbs })
      continue
    }

    const srcHash = (yield* runGetString(`sha256sum ${JSON.stringify(srcAbs)}`)).split(" ")[0]
    const destHash = (yield* runGetString(`sha256sum ${JSON.stringify(destAbs)}`)).split(" ")[0]

    if (srcHash !== destHash) {
      changes.push({ kind: "M", srcRel, destPath: destAbs })
    }
  }

  if (changes.length === 0) {
    yield* Effect.logInfo("In sync. No diff.")
    return
  }

  for (const { kind, srcRel, destPath } of changes) {
    yield* Effect.logInfo(`${kind}  ${srcRel}  ->  ${destPath}`)
  }
  yield* Effect.logInfo("")
  yield* Effect.logInfo(
    `Summary: ${changes.filter((c) => c.kind === "M").length} modified, ${
      changes
        .filter((c) => c.kind === "D")
        .length
    } missing in project, ${changes.filter((c) => c.kind === "E").length} excluded.`
  )
})

/**
 * Push locally-modified synced files back to the shared repo on a new branch.
 * Optionally opens a PR via `gh pr create`.
 *
 * Workflow:
 *   1. Ensure cache fresh at pinned ref.
 *   2. Detect modified files via hash compare (project vs cache).
 *   3. Create new branch in cache, copy modified files in, commit, push.
 *   4. Optionally run `gh pr create` if `--pr` set.
 */
export const syncPush = Effect.fnUntraced(function*(opts: {
  lockfilePath?: string | undefined
  message?: string | undefined
  branch?: string | undefined
  pr?: boolean | undefined
} = {}) {
  const { runGetExitCode, runGetString } = yield* RunCommandService

  const lockfilePath = opts.lockfilePath ?? ".shared.json"
  const { lockfile } = yield* readLockfile(lockfilePath)

  const cachePath = yield* ensureCache(lockfile)
  const files = yield* walkArtifacts(lockfile, cachePath)

  const fs = yield* FileSystem.FileSystem
  const modified: Array<{ srcRel: string; srcAbs: string; destAbs: string }> = []
  const deleted: Array<{ srcRel: string; srcAbs: string }> = []

  for (const { srcRel, srcAbs, destAbs, excluded } of files) {
    if (excluded) continue
    if (!(yield* fs.exists(destAbs))) {
      deleted.push({ srcRel, srcAbs })
      continue
    }
    const srcHash = (yield* runGetString(`sha256sum ${JSON.stringify(srcAbs)}`)).split(" ")[0]
    const destHash = (yield* runGetString(`sha256sum ${JSON.stringify(destAbs)}`)).split(" ")[0]
    if (srcHash !== destHash) {
      modified.push({ srcRel, srcAbs, destAbs })
    }
  }

  if (modified.length === 0 && deleted.length === 0) {
    yield* Effect.logInfo("No local modifications to push.")
    return
  }

  yield* Effect.logInfo(`Pushing ${modified.length} modified, ${deleted.length} deleted file(s):`)
  for (const { srcRel } of modified) {
    yield* Effect.logInfo(`  M ${srcRel}`)
  }
  for (const { srcRel } of deleted) {
    yield* Effect.logInfo(`  D ${srcRel}`)
  }

  const branch = opts.branch
    ?? `sync/from-${sanitizeRepoSlug(process.cwd().split("/").pop() ?? "project")}-${
      new Date().toISOString().slice(0, 10)
    }`

  const message = opts.message ?? "sync: propagate local edits"

  // Stash anything in cache (defensive), create branch from pinned ref.
  yield* runGetExitCode(`git stash --include-untracked || true`, cachePath)
  yield* runGetExitCode(`git checkout -B ${JSON.stringify(branch)} ${JSON.stringify(lockfile.ref)}`, cachePath)

  for (const { srcAbs, destAbs } of modified) {
    yield* runGetExitCode(`cp ${JSON.stringify(destAbs)} ${JSON.stringify(srcAbs)}`)
  }
  for (const { srcAbs } of deleted) {
    yield* runGetExitCode(`git rm -f ${JSON.stringify(srcAbs)}`, cachePath)
  }

  yield* runGetExitCode(`git add -A`, cachePath)
  yield* runGetExitCode(
    `git -c commit.gpgsign=false commit -m ${JSON.stringify(message)}`,
    cachePath
  )
  yield* runGetExitCode(`git push -u origin ${JSON.stringify(branch)}`, cachePath)

  if (opts.pr) {
    yield* runGetExitCode(
      `gh pr create --title ${JSON.stringify(message)} --body ${
        JSON.stringify(`Propagated from project at ${process.cwd()}.\n\nFiles:\n${
          [
            ...modified.map((m) => `- M ${m.srcRel}`),
            ...deleted.map((d) => `- D ${d.srcRel}`)
          ].join("\n")
        }`)
      } --head ${JSON.stringify(branch)}`,
      cachePath
    )
  }

  yield* Effect.logInfo(`Pushed branch ${branch} to shared repo.`)
  yield* Effect.logInfo(opts.pr ? "PR opened." : "Open a PR with: gh pr create  (from the cache dir)")
})

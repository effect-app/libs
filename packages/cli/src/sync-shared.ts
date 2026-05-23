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
  const { runGetExitCode, runGetString } = yield* RunCommandService

  const lockfilePath = opts.lockfilePath ?? ".shared.json"

  if (!(yield* fs.exists(lockfilePath))) {
    return yield* Effect.fail(new Error(`No ${lockfilePath} found in current directory.`))
  }

  const lockfileContent = yield* fs.readFileString(lockfilePath)
  const lockfile = JSON.parse(lockfileContent) as SharedLockfile

  const home = process.env["HOME"] ?? process.env["USERPROFILE"]
  if (!home) return yield* Effect.fail(new Error("Cannot resolve home directory."))

  const cacheRoot = path.join(home, ".cache", "effa", "shared")
  const cachePath = path.join(cacheRoot, sanitizeRepoSlug(lockfile.repo))

  yield* Effect.logInfo(`Syncing from ${lockfile.repo} @ ${lockfile.ref}`)
  yield* Effect.logInfo(`Cache: ${cachePath}`)

  const cloneUrl = repoCloneUrl(lockfile.repo)

  if (!(yield* fs.exists(cachePath))) {
    yield* runGetExitCode(`mkdir -p ${JSON.stringify(cacheRoot)}`)
    yield* runGetExitCode(`git clone ${JSON.stringify(cloneUrl)} ${JSON.stringify(cachePath)}`)
  } else {
    yield* runGetExitCode("git fetch --all --tags --prune", cachePath)
  }

  yield* runGetExitCode(`git checkout ${JSON.stringify(lockfile.ref)}`, cachePath)

  const excludeSet = new Set(lockfile.exclude ?? [])

  let copied = 0
  let skipped = 0

  for (const [srcRel, destRel] of Object.entries(lockfile.artifacts)) {
    const srcAbs = path.join(cachePath, srcRel)
    const destAbs = path.resolve(destRel)

    if (!(yield* fs.exists(srcAbs))) {
      yield* Effect.logWarning(`Source missing in shared repo: ${srcRel} — skipping`)
      continue
    }

    const stat = yield* fs.stat(srcAbs)

    if (stat.type === "File") {
      if (excludeSet.has(srcRel)) {
        yield* Effect.logInfo(`  exclude ${srcRel}`)
        skipped++
        continue
      }
      yield* runGetExitCode(`mkdir -p ${JSON.stringify(path.dirname(destAbs))}`)
      yield* runGetExitCode(`cp ${JSON.stringify(srcAbs)} ${JSON.stringify(destAbs)}`)
      copied++
      continue
    }

    // Directory: walk and copy file-by-file so excludes apply.
    const fileList = yield* runGetString(
      `find ${JSON.stringify(srcAbs)} -type f`
    )

    yield* runGetExitCode(`mkdir -p ${JSON.stringify(destAbs)}`)

    for (const fileAbs of fileList.split("\n").filter((l) => l.trim() !== "")) {
      const relInArtifact = path.relative(srcAbs, fileAbs)
      const srcRelFull = srcRel.endsWith("/") ? srcRel + relInArtifact : srcRel + "/" + relInArtifact

      if (excludeSet.has(srcRelFull)) {
        yield* Effect.logInfo(`  exclude ${srcRelFull}`)
        skipped++
        continue
      }

      const destFileAbs = path.join(destAbs, relInArtifact)
      yield* runGetExitCode(`mkdir -p ${JSON.stringify(path.dirname(destFileAbs))}`)
      yield* runGetExitCode(`cp ${JSON.stringify(fileAbs)} ${JSON.stringify(destFileAbs)}`)
      copied++
    }
  }

  // Update synced_at in lockfile.
  const today = new Date().toISOString().slice(0, 10)
  const trailingNewline = lockfileContent.endsWith("\n") ? "\n" : ""
  const updated = { ...lockfile, synced_at: today }
  yield* fs.writeFileString(lockfilePath, JSON.stringify(updated, null, 2) + trailingNewline)

  yield* Effect.logInfo(`Sync complete: ${copied} copied, ${skipped} excluded.`)
  yield* Effect.logInfo("Review changes with: git status")
})

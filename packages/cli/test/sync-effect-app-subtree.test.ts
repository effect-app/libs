import { NodeServices } from "@effect/platform-node"
import * as Cause from "effect/Cause"
import * as Effect from "effect/Effect"
import * as Exit from "effect/Exit"
import * as Layer from "effect/Layer"
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { pathToFileURL } from "node:url"
import { afterEach, describe, expect, it } from "vitest"
import { RunCommandService } from "../src/os-command.js"
import {
  formatUpstreamReposUrl,
  normalizeSubtreePrefix,
  renderOmittedReposReadme,
  syncEffectAppSubtree
} from "../src/sync-effect-app-subtree.js"

const tempDirs: Array<string> = []

const makeTempDir = (prefix: string) => {
  const dir = mkdtempSync(path.join(os.tmpdir(), prefix))
  tempDirs.push(dir)
  return dir
}

const git = (cwd: string, ...args: ReadonlyArray<string>) => execFileSync("git", args, { cwd, encoding: "utf8" }).trim()

const initRepo = (dir: string) => {
  git(dir, "init", "-b", "main")
  git(dir, "config", "user.name", "Test User")
  git(dir, "config", "user.email", "test@example.com")
  git(dir, "config", "commit.gpgsign", "false")
}

const writeRepoFile = (repoDir: string, relativePath: string, content: string) => {
  const fullPath = path.join(repoDir, relativePath)
  mkdirSync(path.dirname(fullPath), { recursive: true })
  writeFileSync(fullPath, content, "utf8")
}

const withCwdSync = <A, E, R>(consumerDir: string, effect: Effect.Effect<A, E, R>) =>
  Effect.acquireUseRelease(
    Effect.sync(() => {
      const previousCwd = process.cwd()
      process.chdir(consumerDir)
      return previousCwd
    }),
    () => effect,
    (previousCwd) =>
      Effect.sync(() => {
        process.chdir(previousCwd)
      })
  )

const makeSyncEffect = (consumerDir: string, config: Parameters<typeof syncEffectAppSubtree>[0]) =>
  withCwdSync(
    consumerDir,
    syncEffectAppSubtree(config).pipe(Effect.provide(Layer.provideMerge(RunCommandService.Default, NodeServices.layer)))
  )

const runSync = (consumerDir: string, config: Parameters<typeof syncEffectAppSubtree>[0]) =>
  Effect.runPromise(makeSyncEffect(consumerDir, config))

const runSyncExpectFailure = async (consumerDir: string, config: Parameters<typeof syncEffectAppSubtree>[0]) => {
  const exit = await Effect.runPromiseExit(makeSyncEffect(consumerDir, config))
  expect(Exit.isFailure(exit)).toBe(true)
  if (Exit.isFailure(exit)) {
    return Cause.pretty(exit.cause)
  }
  return ""
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()
    if (dir) {
      rmSync(dir, { recursive: true, force: true })
    }
  }
})

describe("sync-effect-app helpers", () => {
  it("normalizes relative subtree prefixes and rejects invalid paths", () => {
    expect(normalizeSubtreePrefix("repos/effect-app")).toBe("repos/effect-app")
    expect(normalizeSubtreePrefix("repos/effect-app/")).toBe("repos/effect-app")
    expect(() => normalizeSubtreePrefix("")).toThrow()
    expect(() => normalizeSubtreePrefix("/repos/effect-app")).toThrow()
    expect(() => normalizeSubtreePrefix(".")).toThrow()
    expect(() => normalizeSubtreePrefix("repos/..")).toThrow()
    expect(() => normalizeSubtreePrefix("repos//effect-app")).toThrow()
  })

  it("formats GitHub HTTP/SSH URLs to exact commit repos/ trees and falls back for non-GitHub remotes", () => {
    const commit = "65ff0f476c2b0ed318d0de8016f321a3a1933dab"
    expect(formatUpstreamReposUrl("https://github.com/effect-app/libs.git", commit)).toBe(
      `https://github.com/effect-app/libs/tree/${commit}/repos`
    )
    expect(formatUpstreamReposUrl("https://github.com/effect-app/libs/", commit)).toBe(
      `https://github.com/effect-app/libs/tree/${commit}/repos`
    )
    expect(formatUpstreamReposUrl("git@github.com:effect-app/libs.git", commit)).toBe(
      `https://github.com/effect-app/libs/tree/${commit}/repos`
    )
    expect(formatUpstreamReposUrl("ssh://git@github.com/effect-app/libs.git", commit)).toBe(
      `https://github.com/effect-app/libs/tree/${commit}/repos`
    )
    expect(formatUpstreamReposUrl("file:///tmp/libs.git", commit)).toBe(
      `file:///tmp/libs.git (commit ${commit}, path repos/)`
    )
  })

  it("renders a README pointer referencing top-level repos/effect and exact upstream commit", () => {
    const commit = "65ff0f476c2b0ed318d0de8016f321a3a1933dab"
    const readme = renderOmittedReposReadme("https://github.com/effect-app/libs.git", commit)
    expect(readme).toContain("repos/effect/")
    expect(readme).toContain(commit)
    expect(readme).toContain(`https://github.com/effect-app/libs/tree/${commit}/repos`)
  })
})

describe("syncEffectAppSubtree", () => {
  const createFixtureRepos = () => {
    const upstream = makeTempDir("effa-sync-upstream-")
    initRepo(upstream)
    writeRepoFile(upstream, "README.md", "# Upstream libs\n")
    writeRepoFile(
      upstream,
      "packages/effect-app/package.json",
      JSON.stringify({ name: "effect-app", version: "4.2.0" })
    )
    writeRepoFile(upstream, "packages/effect-app/src/old.ts", "export const old = 1\n")
    writeRepoFile(
      upstream,
      "repos/effect/packages/effect/package.json",
      JSON.stringify({ name: "effect", version: "4.0.6" })
    )
    writeRepoFile(upstream, "repos/effect/packages/effect/src/index.ts", "export const v = '4.0.6'\n")
    git(upstream, "add", "-A")
    git(upstream, "commit", "-m", "v1")
    const commit1 = git(upstream, "rev-parse", "HEAD")

    const consumer = makeTempDir("effa-sync-consumer-")
    initRepo(consumer)
    writeRepoFile(
      consumer,
      "package.json",
      JSON.stringify({ name: "consumer", dependencies: { "effect-app": "4.2.0" } })
    )
    git(consumer, "add", "-A")
    git(consumer, "commit", "-m", "init consumer")

    return { upstream, upstreamUrl: pathToFileURL(upstream).href, consumer, commit1 }
  }

  it("omits nested repos/, leaves repos/README.md, updates without conflicts across deletions, and is idempotent", async () => {
    const { commit1, consumer, upstream, upstreamUrl } = createFixtureRepos()

    await runSync(consumer, {
      manifestPaths: ["package.json"],
      subtreePrefix: "repos/effect-app",
      url: upstreamUrl,
      ref: commit1
    })

    expect(existsSync(path.join(consumer, "repos/effect-app/repos/effect/packages/effect/package.json"))).toBe(false)
    expect(existsSync(path.join(consumer, "repos/effect-app/packages/effect-app/src/old.ts"))).toBe(true)
    const readme1 = readFileSync(path.join(consumer, "repos/effect-app/repos/README.md"), "utf8")
    expect(readme1).toContain(commit1)
    expect(readme1).toContain(`${upstreamUrl} (commit ${commit1}, path repos/)`)
    expect(git(consumer, "log", "-1", "--pretty=%B")).toContain(`effa-sync-commit: ${commit1}`)
    expect(git(consumer, "log", "-1", "--pretty=%B")).toContain("effa-sync-nested-repos: omitted")

    // Advance upstream: modify nested repos/effect (which would conflict if deleted naively with git subtree) and add/delete package files.
    rmSync(path.join(upstream, "packages/effect-app/src/old.ts"))
    writeRepoFile(upstream, "packages/effect-app/src/new.ts", "export const next = 2\n")
    writeRepoFile(upstream, "repos/effect/packages/effect/src/index.ts", "export const v = '4.1.0'\n")
    git(upstream, "add", "-A")
    git(upstream, "commit", "-m", "v2")
    const commit2 = git(upstream, "rev-parse", "HEAD")

    await runSync(consumer, {
      manifestPaths: ["package.json"],
      subtreePrefix: "repos/effect-app",
      url: upstreamUrl,
      ref: commit2
    })

    expect(existsSync(path.join(consumer, "repos/effect-app/packages/effect-app/src/old.ts"))).toBe(false)
    expect(existsSync(path.join(consumer, "repos/effect-app/packages/effect-app/src/new.ts"))).toBe(true)
    expect(existsSync(path.join(consumer, "repos/effect-app/repos/effect"))).toBe(false)
    expect(readFileSync(path.join(consumer, "repos/effect-app/repos/README.md"), "utf8")).toContain(commit2)
    expect(git(consumer, "status", "--porcelain")).toBe("")
    expect(git(consumer, "for-each-ref", "refs/effa-sync")).toBe("")

    // Re-running at the same commit is a no-op.
    const headBefore = git(consumer, "rev-parse", "HEAD")
    await runSync(consumer, {
      manifestPaths: ["package.json"],
      subtreePrefix: "repos/effect-app",
      url: upstreamUrl,
      ref: commit2
    })
    expect(git(consumer, "rev-parse", "HEAD")).toBe(headBefore)
  })

  it("resolves pinned package.json versions via tag match and via default-branch history scan when untagged", async () => {
    // 1. Tag match path
    const tagged = createFixtureRepos()
    git(tagged.upstream, "tag", "-a", "effect-app@4.2.0", "-m", "release 4.2.0")
    writeRepoFile(
      tagged.upstream,
      "packages/effect-app/package.json",
      JSON.stringify({ name: "effect-app", version: "4.3.0" })
    )
    git(tagged.upstream, "add", "-A")
    git(tagged.upstream, "commit", "-m", "bump 4.3.0")

    await runSync(tagged.consumer, {
      manifestPaths: ["package.json"],
      subtreePrefix: "repos/effect-app",
      url: tagged.upstreamUrl
    })

    expect(readFileSync(path.join(tagged.consumer, "repos/effect-app/repos/README.md"), "utf8")).toContain(
      tagged.commit1
    )
    expect(existsSync(path.join(tagged.consumer, "repos/effect-app/repos/effect"))).toBe(false)
    expect(git(tagged.consumer, "for-each-ref", "refs/effa-sync")).toBe("")
    expect(git(tagged.consumer, "tag", "-l")).toBe("")

    // 2. Bare-cache history scan fallback (no matching tag in upstream)
    const untagged = createFixtureRepos()
    writeRepoFile(
      untagged.upstream,
      "packages/effect-app/package.json",
      JSON.stringify({ name: "effect-app", version: "4.3.0" })
    )
    git(untagged.upstream, "add", "-A")
    git(untagged.upstream, "commit", "-m", "bump 4.3.0")

    await runSync(untagged.consumer, {
      manifestPaths: ["package.json"],
      subtreePrefix: "repos/effect-app",
      url: untagged.upstreamUrl
    })

    expect(readFileSync(path.join(untagged.consumer, "repos/effect-app/repos/README.md"), "utf8")).toContain(
      untagged.commit1
    )
    expect(existsSync(path.join(untagged.consumer, "repos/effect-app/repos/effect"))).toBe(false)
    expect(git(untagged.consumer, "for-each-ref", "refs/effa-sync")).toBe("")
  })

  it("keeps nested repos/ when includeRepos is true", async () => {
    const { commit1, consumer, upstreamUrl } = createFixtureRepos()

    await runSync(consumer, {
      manifestPaths: ["package.json"],
      subtreePrefix: "repos/effect-app",
      url: upstreamUrl,
      ref: commit1,
      includeRepos: true
    })

    expect(existsSync(path.join(consumer, "repos/effect-app/repos/effect/packages/effect/package.json"))).toBe(true)
    expect(existsSync(path.join(consumer, "repos/effect-app/repos/README.md"))).toBe(false)
    expect(git(consumer, "log", "-1", "--pretty=%B")).toContain("effa-sync-nested-repos: included")
  })

  it("fails closed when the consumer working tree has tracked modifications or untracked files under prefix", async () => {
    const { commit1, consumer, upstreamUrl } = createFixtureRepos()

    await runSync(consumer, {
      manifestPaths: ["package.json"],
      subtreePrefix: "repos/effect-app",
      url: upstreamUrl,
      ref: commit1
    })

    const headBefore = git(consumer, "rev-parse", "HEAD")
    writeRepoFile(consumer, "repos/effect-app/stray.txt", "untracked\n")

    const err1 = await runSyncExpectFailure(consumer, {
      manifestPaths: ["package.json"],
      subtreePrefix: "repos/effect-app",
      url: upstreamUrl,
      ref: commit1
    })
    expect(err1).toContain("uncommitted or untracked changes")
    expect(git(consumer, "rev-parse", "HEAD")).toBe(headBefore)

    rmSync(path.join(consumer, "repos/effect-app/stray.txt"))
    writeRepoFile(consumer, "package.json", "{}\n")

    const err2 = await runSyncExpectFailure(consumer, {
      manifestPaths: ["package.json"],
      subtreePrefix: "repos/effect-app",
      url: upstreamUrl,
      ref: commit1
    })
    expect(err2).toContain("uncommitted changes")
    expect(git(consumer, "rev-parse", "HEAD")).toBe(headBefore)
  })
})

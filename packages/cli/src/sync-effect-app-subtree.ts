import * as Arr from "effect/Array"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Option from "effect/Option"
import * as Path from "node:path"
import { RunCommandService } from "./os-command.ts"

export interface SyncEffectAppConfig {
  readonly manifestPaths: ReadonlyArray<string>
  readonly subtreePrefix: string
  readonly url: string
  readonly ref?: string
  readonly includeRepos?: boolean
}

interface VersionMention {
  readonly manifestPath: string
  readonly section: string
  readonly name: string
  readonly range: string
  readonly normalized: string
}

interface ResolvedUpstream {
  readonly commit: string
  readonly label: string
}

const depSections = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"] as const

const packageManifestPaths: Record<string, string> = {
  "effect-app": "packages/effect-app/package.json",
  "@effect-app/infra": "packages/infra/package.json",
  "@effect-app/vue": "packages/vue/package.json",
  "@effect-app/vue-components": "packages/vue-components/package.json",
  "@effect-app/cli": "packages/cli/package.json",
  "@effect-app/eslint-codegen-model": "packages/eslint-codegen-model/package.json",
  "@effect-app/eslint-shared-config": "packages/eslint-shared-config/package.json"
}

const packagePreference = Object.keys(packageManifestPaths)

const githubUrlPatterns = [
  /^https?:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/i,
  /^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/i,
  /^ssh:\/\/git@github\.com\/([^/]+)\/([^/]+?)(?:\.git)?$/i
] as const

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const isEffectAppPackage = (name: string) => name === "effect-app" || name.startsWith("@effect-app/")

const isNonEmptyString = (value: string) => value !== ""

const shellQuote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`

const toError = (cause: unknown) => (cause instanceof Error ? cause : new Error(String(cause)))

const normalizeVersion = (range: string) => {
  const match = range.match(/\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?/)
  return match?.[0]
}

const isFullSha = (ref: string) => /^[0-9a-f]{40}$/i.test(ref)

const resolveRequestedRef = (ref: string) => (ref === "latest" ? "main" : ref)

/** Normalize and validate a relative repository prefix passed to `--prefix`. */
export const normalizeSubtreePrefix = (prefix: string): string => {
  if (prefix.startsWith("/")) {
    throw new Error(`Subtree prefix must be relative, got '${prefix}'`)
  }
  const trimmed = prefix.replace(/\/+$/, "")
  if (trimmed === "") {
    throw new Error(`Subtree prefix must not be empty, got '${prefix}'`)
  }
  const segments = trimmed.split("/")
  if (segments.some((segment) => segment === "" || segment === "." || segment === "..")) {
    throw new Error(`Subtree prefix contains invalid path segments: '${prefix}'`)
  }
  return trimmed
}

/** Format an exact-commit GitHub tree URL for an upstream repo's `repos/` folder when recognizable. */
export const formatUpstreamReposUrl = (url: string, commit: string): string => {
  const trimmed = url.trim().replace(/\/+$/, "")
  for (const pattern of githubUrlPatterns) {
    const match = trimmed.match(pattern)
    if (match?.[1] && match[2]) {
      return `https://github.com/${match[1]}/${match[2]}/tree/${commit}/repos`
    }
  }
  return `${url} (commit ${commit}, path repos/)`
}

/** Render the stub `repos/README.md` left in place of nested `repos/effect*` directories. */
export const renderOmittedReposReadme = (url: string, commit: string): string =>
  [
    "# Nested `repos/` omitted",
    "",
    "Stripped by `effa sync-effect-app` to avoid duplicating `repos/effect` and version skew in consumer repositories.",
    "",
    "- Use the workspace's top-level `repos/effect/` for this repo's pinned Effect version.",
    `- Upstream \`effect-app/libs\` \`repos/\` at the synced commit (\`${commit}\`):`,
    `  ${formatUpstreamReposUrl(url, commit)}`,
    ""
  ].join("\n")

const parsePackageVersion = (source: string, packagePath: string) => {
  const parsed: unknown = JSON.parse(source)
  if (!isRecord(parsed) || typeof parsed["version"] !== "string") {
    throw new Error(`Could not read version from ${packagePath}`)
  }
  return parsed["version"]
}

const parseDefaultBranch = (source: string) => {
  const line = source.split("\n").find((line) => line.startsWith("ref: refs/heads/") && line.endsWith("\tHEAD"))

  if (!line) {
    throw new Error("Could not resolve default branch for effect-app libs repository")
  }

  return line.slice("ref: refs/heads/".length, -"\tHEAD".length)
}

const selectVersionMentions = (mentions: Arr.NonEmptyArray<VersionMention>) => {
  for (const packageName of packagePreference) {
    const selected = mentions.filter((mention) => mention.name === packageName)
    if (Arr.isArrayNonEmpty(selected)) return selected
  }

  return mentions
}

const describeMentions = (mentions: ReadonlyArray<VersionMention>) =>
  mentions.map((mention) => `${mention.manifestPath} (${mention.section}) ${mention.name}: ${mention.range}`).join("\n")

const entryName = (entry: string) => {
  const tabIndex = entry.indexOf("\t")
  return tabIndex === -1 ? "" : entry.slice(tabIndex + 1)
}

const exitMarker = "__EFFA_EXIT_CODE__="

/** Sync a consumer repository's vendored `effect-app` directory to the upstream commit or pinned version. */
export const syncEffectAppSubtree = Effect.fnUntraced(function* (config: SyncEffectAppConfig) {
  const fs = yield* FileSystem.FileSystem
  const { runGetExitCode, runGetString } = yield* RunCommandService

  const run = Effect.fnUntraced(function* (command: string) {
    const exitCode = yield* runGetExitCode(command)
    if (exitCode !== 0) {
      return yield* Effect.fail(new Error(`Command failed with exit code ${exitCode}: ${command}`))
    }
  })

  // Effect 4 `ChildProcessSpawner.string` resolves stdout even on non-zero exit codes,
  // so capture the shell exit status explicitly for commands whose exit status matters.
  const runCapture = Effect.fnUntraced(function* (command: string) {
    const raw = yield* runGetString(`( ${command} ); printf '\\n${exitMarker}%d' "$?"`)
    const idx = raw.lastIndexOf(`\n${exitMarker}`)
    if (idx === -1) {
      return yield* Effect.fail(new Error(`Failed to capture exit status for command: ${command}`))
    }
    const stdout = raw.slice(0, idx)
    const exitCode = Number(raw.slice(idx + exitMarker.length + 1).trim())
    return { stdout, exitCode }
  })

  const runCheckedString = Effect.fnUntraced(function* (command: string) {
    const { exitCode, stdout } = yield* runCapture(command)
    if (exitCode !== 0) {
      return yield* Effect.fail(new Error(`Command failed with exit code ${exitCode}: ${command}`))
    }
    return stdout
  })

  const runOptionalString = Effect.fnUntraced(function* (command: string) {
    const { exitCode, stdout } = yield* runCapture(`${command} 2>/dev/null`)
    return exitCode === 0 ? Option.some(stdout) : Option.none<string>()
  })

  const prefix = yield* Effect.try({
    try: () => normalizeSubtreePrefix(config.subtreePrefix),
    catch: toError
  })

  const dirtyTracked = (yield* runCheckedString("git status --porcelain --untracked-files=no")).trim()
  if (dirtyTracked !== "") {
    return yield* Effect.fail(
      new Error("Working tree or index has uncommitted changes. Commit or stash them before syncing.")
    )
  }

  const dirtyPrefix = (yield* runCheckedString(`git status --porcelain -- ${shellQuote(prefix)}`)).trim()
  if (dirtyPrefix !== "") {
    return yield* Effect.fail(
      new Error(`Target prefix '${prefix}' has uncommitted or untracked changes:\n${dirtyPrefix}`)
    )
  }

  const tempRefs: Array<string> = []

  const fetchRemoteCommit = Effect.fnUntraced(function* (remoteRef: string, tempRef: string) {
    tempRefs.push(tempRef)
    yield* run(`git fetch --no-tags ${shellQuote(config.url)} ${shellQuote(`+${remoteRef}:${tempRef}`)}`)
    return (yield* runCheckedString(`git rev-parse --verify ${shellQuote(`${tempRef}^{commit}`)}`)).trim()
  })

  const resolveRequestedUpstream = Effect.fnUntraced(function* (
    requestedRef: string
  ): Effect.fn.Return<ResolvedUpstream, Error> {
    const ref = resolveRequestedRef(requestedRef)
    yield* Effect.logInfo(`Using effect-app subtree ref: ${ref}`)
    yield* Effect.logInfo(`Using effect-app subtree url: ${config.url}`)

    if (isFullSha(ref)) {
      const localCommit = yield* runOptionalString(`git rev-parse --verify ${shellQuote(`${ref}^{commit}`)}`)
      if (Option.isSome(localCommit)) {
        return { commit: localCommit.value.trim(), label: ref }
      }
    }

    const remoteRefs = ref.startsWith("refs/") ? [ref] : [`refs/heads/${ref}`, `refs/tags/${ref}`, ref]
    for (const remoteRef of remoteRefs) {
      const exists = yield* runOptionalString(
        `git ls-remote --exit-code ${shellQuote(config.url)} ${shellQuote(remoteRef)}`
      )

      if (Option.isSome(exists)) {
        const commit = yield* fetchRemoteCommit(remoteRef, "refs/effa-sync/effect-app-requested")
        return { commit, label: ref }
      }
    }

    if (isFullSha(ref)) {
      const commit = yield* fetchRemoteCommit(ref, "refs/effa-sync/effect-app-requested").pipe(Effect.option)
      if (Option.isSome(commit)) {
        return { commit: commit.value, label: ref }
      }
    }

    return yield* Effect.fail(new Error(`Could not resolve effect-app ref: ${ref}`))
  })

  const resolvePinnedUpstream = Effect.fnUntraced(function* (): Effect.fn.Return<ResolvedUpstream, Error> {
    const versionMentions: Array<VersionMention> = []

    for (const manifestPath of config.manifestPaths) {
      if (!(yield* fs.exists(manifestPath))) continue

      const manifest: unknown = JSON.parse(yield* fs.readFileString(manifestPath))
      if (!isRecord(manifest)) continue

      for (const section of depSections) {
        const deps = manifest[section]
        if (!isRecord(deps)) continue

        for (const [name, range] of Object.entries(deps)) {
          if (!isEffectAppPackage(name) || typeof range !== "string") continue

          const normalized = normalizeVersion(range)
          if (!normalized) continue

          versionMentions.push({ manifestPath, section, name, range, normalized })
        }
      }
    }

    if (!Arr.isArrayNonEmpty(versionMentions)) {
      return yield* Effect.fail(new Error("Could not find any effect-app/@effect-app dependency versions in manifests"))
    }

    const selectedMentions = selectVersionMentions(versionMentions)
    const versions = [...new Set(selectedMentions.map((mention) => mention.normalized))]

    if (Arr.isArrayNonEmpty(versions.slice(1))) {
      return yield* Effect.fail(
        new Error(`Found multiple Effect App versions. Please align first:\n${describeMentions(selectedMentions)}`)
      )
    }

    const version = selectedMentions[0].normalized
    const packageName = selectedMentions[0].name
    const packagePath = packageManifestPaths[packageName]

    if (!packagePath) {
      return yield* Effect.fail(new Error(`No effect-app libs package manifest mapping for ${packageName}`))
    }

    const tagCandidates = [`${packageName}@${version}`, `v${version}`, version]
    let matchedTag: string | undefined
    for (const candidate of tagCandidates) {
      const tagResult = yield* runOptionalString(
        `git ls-remote --exit-code --tags ${shellQuote(config.url)} ${shellQuote(`refs/tags/${candidate}`)}`
      )

      if (Option.isSome(tagResult)) {
        matchedTag = candidate
        break
      }
    }

    if (matchedTag) {
      yield* Effect.logInfo(`Using effect-app package: ${packageName}@${version}`)
      yield* Effect.logInfo(`Using effect-app subtree ref: ${matchedTag}`)
      yield* Effect.logInfo(`Using effect-app subtree url: ${config.url}`)
      const commit = yield* fetchRemoteCommit(`refs/tags/${matchedTag}`, "refs/effa-sync/effect-app-tag")
      return { commit, label: matchedTag }
    }

    const defaultBranchOutput = yield* runCheckedString(`git ls-remote --symref ${shellQuote(config.url)} HEAD`)
    const defaultBranch = yield* Effect.try({
      try: () => parseDefaultBranch(defaultBranchOutput),
      catch: toError
    })

    const cachePath = (yield* runCheckedString("git rev-parse --git-path effa-sync/effect-app-libs.git")).trim()
    yield* run(`mkdir -p ${shellQuote(Path.dirname(cachePath))}`)

    if (!(yield* fs.exists(cachePath))) {
      yield* run(`git init --bare ${shellQuote(cachePath)}`)
    }

    yield* run(
      `git --git-dir=${shellQuote(cachePath)} fetch --no-tags --prune ${shellQuote(config.url)} ${shellQuote(
        `+refs/heads/${defaultBranch}:refs/heads/${defaultBranch}`
      )}`
    )

    const commits = (yield* runCheckedString(
      `git --git-dir=${shellQuote(cachePath)} rev-list ${shellQuote(`refs/heads/${defaultBranch}`)}`
    ))
      .trim()
      .split("\n")
      .filter(isNonEmptyString)

    if (!Arr.isArrayNonEmpty(commits)) {
      return yield* Effect.fail(new Error(`No commits found on ${defaultBranch} for ${config.url}`))
    }

    let commit: string | undefined
    for (const candidate of commits) {
      const packageJsonResult = yield* runOptionalString(
        `git --git-dir=${shellQuote(cachePath)} show ${shellQuote(`${candidate}:${packagePath}`)}`
      )

      if (Option.isNone(packageJsonResult)) continue

      const candidateVersion = yield* Effect.try({
        try: () => parsePackageVersion(packageJsonResult.value, packagePath),
        catch: toError
      })

      if (candidateVersion === version) {
        commit = candidate
        break
      }
    }

    if (!commit) {
      return yield* Effect.fail(
        new Error(
          `No commit found on ${defaultBranch} where ${packagePath} has version ${version}. Tried tags: ${tagCandidates.join(
            ", "
          )}`
        )
      )
    }

    const syncRef = "refs/effa-sync/effect-app-selected"
    tempRefs.push(syncRef)
    yield* run(`git --git-dir=${shellQuote(cachePath)} update-ref ${shellQuote(syncRef)} ${shellQuote(commit)}`)
    yield* run(`git fetch --no-tags ${shellQuote(cachePath)} ${shellQuote(`+${syncRef}:${syncRef}`)}`)

    yield* Effect.logInfo(`Using effect-app package: ${packageName}@${version}`)
    yield* Effect.logInfo(`Using effect-app subtree commit: ${commit}`)
    yield* Effect.logInfo(`Using effect-app subtree url: ${config.url}`)

    return { commit, label: `${packageName}@${version}` }
  })

  const cleanupTempRefs = Effect.forEach(
    tempRefs,
    (ref) => runGetExitCode(`git update-ref -d ${shellQuote(ref)} >/dev/null 2>&1`).pipe(Effect.ignore),
    { discard: true }
  )

  return yield* Effect.gen(function* () {
    const { commit, label } = config.ref ? yield* resolveRequestedUpstream(config.ref) : yield* resolvePinnedUpstream()

    const includeRepos = config.includeRepos ?? false
    const rootEntriesRaw = yield* runCheckedString(`git ls-tree -z ${shellQuote(commit)}`)
    const rootEntries = rootEntriesRaw.split("\0").filter(isNonEmptyString)
    const hasReposEntry = rootEntries.some((entry) => entryName(entry) === "repos")

    yield* Effect.scoped(
      Effect.gen(function* () {
        const tmpDir = yield* fs.makeTempDirectoryScoped()
        let targetTree: string
        let nestedReposStatus: "omitted" | "included" | "absent"

        if (!includeRepos && hasReposEntry) {
          const readmePath = Path.join(tmpDir, "README.md")
          const reposTreePath = Path.join(tmpDir, "repos.tree")
          const rootTreePath = Path.join(tmpDir, "root.tree")

          yield* fs.writeFileString(readmePath, renderOmittedReposReadme(config.url, commit))
          const readmeBlob = (yield* runCheckedString(`git hash-object -w -- ${shellQuote(readmePath)}`)).trim()

          yield* fs.writeFileString(reposTreePath, `100644 blob ${readmeBlob}\tREADME.md\0`)
          const reposStubTree = (yield* runCheckedString(`git mktree -z < ${shellQuote(reposTreePath)}`)).trim()

          const prunedEntries = rootEntries.map((entry) =>
            entryName(entry) === "repos" ? `040000 tree ${reposStubTree}\trepos` : entry
          )
          yield* fs.writeFileString(rootTreePath, `${prunedEntries.join("\0")}\0`)
          targetTree = (yield* runCheckedString(`git mktree -z < ${shellQuote(rootTreePath)}`)).trim()
          nestedReposStatus = "omitted"
        } else {
          targetTree = (yield* runCheckedString(`git rev-parse --verify ${shellQuote(`${commit}^{tree}`)}`)).trim()
          nestedReposStatus = hasReposEntry ? "included" : "absent"
        }

        const currentTree = yield* runOptionalString(`git rev-parse --verify --quiet ${shellQuote(`HEAD:${prefix}`)}`)
        if (Option.isSome(currentTree) && currentTree.value.trim() === targetTree) {
          yield* Effect.logInfo(`${prefix} is already up to date at ${commit} (${nestedReposStatus})`)
          return
        }

        const msgPath = Path.join(tmpDir, "commit-msg.txt")
        const shortCommit = commit.slice(0, 7)
        const commitMessage = [
          `chore(repos): sync ${prefix} to ${label} (${shortCommit})`,
          "",
          `Synced from ${config.url}`,
          `effa-sync-dir: ${prefix}`,
          `effa-sync-commit: ${commit}`,
          `effa-sync-nested-repos: ${nestedReposStatus}`,
          ""
        ].join("\n")
        yield* fs.writeFileString(msgPath, commitMessage)

        yield* run(`git rm -rf --quiet --ignore-unmatch -- ${shellQuote(prefix)}`)
        yield* run(`git read-tree --prefix=${shellQuote(`${prefix}/`)} -u ${shellQuote(targetTree)}`)
        yield* run(`git commit -F ${shellQuote(msgPath)}`)
      })
    )
  }).pipe(Effect.ensuring(cleanupTempRefs))
})

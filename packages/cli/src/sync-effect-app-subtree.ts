import * as Arr from "effect/Array"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Option from "effect/Option"
import * as Path from "node:path"
import { RunCommandService } from "./os-command.js"

export interface SyncEffectAppConfig {
  readonly manifestPaths: ReadonlyArray<string>
  readonly subtreePrefix: string
  readonly url: string
  readonly ref?: string
}

interface VersionMention {
  readonly manifestPath: string
  readonly section: string
  readonly name: string
  readonly range: string
  readonly normalized: string
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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

const isEffectAppPackage = (name: string) => name === "effect-app" || name.startsWith("@effect-app/")

const isNonEmptyString = (value: string) => value !== ""

const shellQuote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`

const normalizeVersion = (range: string) => {
  const match = range.match(/\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?/)
  return match?.[0]
}

const isFullSha = (ref: string) => /^[0-9a-f]{40}$/i.test(ref)

const resolveRequestedRef = (ref: string) => ref === "latest" ? "main" : ref

const parsePackageVersion = (source: string, packagePath: string) => {
  const parsed: unknown = JSON.parse(source)
  if (!isRecord(parsed) || typeof parsed["version"] !== "string") {
    throw new Error(`Could not read version from ${packagePath}`)
  }
  return parsed["version"]
}

const parseDefaultBranch = (source: string) => {
  const line = source
    .split("\n")
    .find((line) => line.startsWith("ref: refs/heads/") && line.endsWith("\tHEAD"))

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
  mentions
    .map((mention) => `${mention.manifestPath} (${mention.section}) ${mention.name}: ${mention.range}`)
    .join("\n")

export const syncEffectAppSubtree = Effect.fnUntraced(function*(config: SyncEffectAppConfig) {
  const fs = yield* FileSystem.FileSystem
  const { runGetExitCode, runGetString } = yield* RunCommandService

  const run = Effect.fnUntraced(function*(command: string) {
    const exitCode = yield* runGetExitCode(command)
    if (exitCode !== 0) {
      return yield* Effect.fail(new Error(`Command failed with exit code ${exitCode}: ${command}`))
    }
  })

  const fetchRemoteRef = Effect.fnUntraced(function*(remoteRef: string, localRef: string) {
    const rawRef = `${localRef}-raw`

    yield* run(
      `git fetch --no-tags ${shellQuote(config.url)} ${shellQuote(`+${remoteRef}:${rawRef}`)}`
    )

    const commit = (yield* runGetString(`git rev-list -n1 ${shellQuote(rawRef)}`)).trim()
    yield* run(`git update-ref ${shellQuote(localRef)} ${shellQuote(commit)}`)
  })

  const fetchRequestedRef = Effect.fnUntraced(function*(requestedRef: string, localRef: string) {
    if (isFullSha(requestedRef)) {
      const localCommit = yield* runGetString(
        `git rev-parse --verify ${shellQuote(`${requestedRef}^{commit}`)}`
      )
        .pipe(Effect.option)

      if (Option.isSome(localCommit)) {
        return yield* run(`git update-ref ${shellQuote(localRef)} ${shellQuote(localCommit.value.trim())}`)
      }
    }

    const remoteRefs = requestedRef.startsWith("refs/")
      ? [requestedRef]
      : [`refs/heads/${requestedRef}`, `refs/tags/${requestedRef}`, requestedRef]

    for (const remoteRef of remoteRefs) {
      const exists = yield* runGetString(
        `git ls-remote --exit-code ${shellQuote(config.url)} ${shellQuote(remoteRef)}`
      )
        .pipe(Effect.option)

      if (Option.isSome(exists)) {
        return yield* fetchRemoteRef(remoteRef, localRef)
      }
    }

    return yield* Effect.fail(new Error(`Could not resolve effect-app ref: ${requestedRef}`))
  })

  if (config.ref) {
    const ref = resolveRequestedRef(config.ref)
    const syncRef = "refs/effa-sync/effect-app-requested"
    yield* Effect.logInfo(`Using effect-app subtree ref: ${ref}`)
    yield* Effect.logInfo(`Using effect-app subtree url: ${config.url}`)
    yield* fetchRequestedRef(ref, syncRef)
    return yield* run(
      `git -c status.showUntrackedFiles=no subtree pull --prefix=${shellQuote(config.subtreePrefix)} . ${
        shellQuote(syncRef)
      } --squash`
    )
  }

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
    return yield* Effect.fail(
      new Error("Could not find any effect-app/@effect-app dependency versions in manifests")
    )
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
    return yield* Effect.fail(
      new Error(`No effect-app libs package manifest mapping for ${packageName}`)
    )
  }

  const tagCandidates = [
    `${packageName}@${version}`,
    `v${version}`,
    version
  ]

  let remoteRef: string | undefined
  for (const candidate of tagCandidates) {
    const tagResult = yield* runGetString(
      `git ls-remote --exit-code --tags ${shellQuote(config.url)} ${shellQuote(`refs/tags/${candidate}`)}`
    )
      .pipe(Effect.option)

    if (Option.isSome(tagResult)) {
      remoteRef = candidate
      break
    }
  }

  if (remoteRef) {
    const syncRef = "refs/effa-sync/effect-app-tag"
    yield* Effect.logInfo(`Using effect-app package: ${packageName}@${version}`)
    yield* Effect.logInfo(`Using effect-app subtree ref: ${remoteRef}`)
    yield* Effect.logInfo(`Using effect-app subtree url: ${config.url}`)
    yield* fetchRemoteRef(`refs/tags/${remoteRef}`, syncRef)
    return yield* run(
      `git -c status.showUntrackedFiles=no subtree pull --prefix=${shellQuote(config.subtreePrefix)} . ${
        shellQuote(syncRef)
      } --squash`
    )
  }

  const defaultBranchOutput = yield* runGetString(`git ls-remote --symref ${shellQuote(config.url)} HEAD`)
  const defaultBranch = yield* Effect.try({
    try: () => parseDefaultBranch(defaultBranchOutput),
    catch: (cause) => cause instanceof Error ? cause : new Error(String(cause))
  })

  const cachePath = (yield* runGetString("git rev-parse --git-path effa-sync/effect-app-libs.git")).trim()
  yield* run(`mkdir -p ${shellQuote(Path.dirname(cachePath))}`)

  if (!(yield* fs.exists(cachePath))) {
    yield* run(`git init --bare ${shellQuote(cachePath)}`)
  }

  yield* run(
    `git --git-dir=${shellQuote(cachePath)} fetch --no-tags --prune ${shellQuote(config.url)} ${
      shellQuote(`+refs/heads/${defaultBranch}:refs/heads/${defaultBranch}`)
    }`
  )

  const commits = (yield* runGetString(
    `git --git-dir=${shellQuote(cachePath)} rev-list ${shellQuote(`refs/heads/${defaultBranch}`)}`
  ))
    .trim()
    .split("\n")
    .filter(isNonEmptyString)

  if (!Arr.isArrayNonEmpty(commits)) {
    return yield* Effect.fail(
      new Error(`No commits found on ${defaultBranch} for ${config.url}`)
    )
  }

  let commit: string | undefined
  for (const candidate of commits) {
    const packageJsonResult = yield* runGetString(
      `git --git-dir=${shellQuote(cachePath)} show ${shellQuote(`${candidate}:${packagePath}`)}`
    )
      .pipe(Effect.option)

    if (Option.isNone(packageJsonResult)) continue

    const candidateVersion = yield* Effect.try({
      try: () => parsePackageVersion(packageJsonResult.value, packagePath),
      catch: (cause) => cause instanceof Error ? cause : new Error(String(cause))
    })

    if (candidateVersion === version) {
      commit = candidate
      break
    }
  }

  if (!commit) {
    return yield* Effect.fail(
      new Error(
        `No commit found on ${defaultBranch} where ${packagePath} has version ${version}. Tried tags: ${
          tagCandidates.join(", ")
        }`
      )
    )
  }

  const syncRef = "refs/effa-sync/effect-app-selected"
  yield* run(`git --git-dir=${shellQuote(cachePath)} update-ref ${shellQuote(syncRef)} ${shellQuote(commit)}`)

  yield* Effect.logInfo(`Using effect-app package: ${packageName}@${version}`)
  yield* Effect.logInfo(`Using effect-app subtree commit: ${commit}`)
  yield* Effect.logInfo(`Using effect-app subtree url: ${config.url}`)
  yield* run(
    `git -c status.showUntrackedFiles=no subtree pull --prefix=${shellQuote(config.subtreePrefix)} ${
      shellQuote(cachePath)
    } ${shellQuote(syncRef)} --squash`
  )
})

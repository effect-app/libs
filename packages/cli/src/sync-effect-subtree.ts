import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Option from "effect/Option"
import { RunCommandService } from "./os-command.js"

export interface SyncEffectConfig {
  readonly manifestPaths: ReadonlyArray<string>
  readonly subtreePrefix: string
  readonly url: string
}

const depSections = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"] as const

const shellQuote = (value: string) => `'${value.replaceAll("'", "'\\''")}'`

const normalizeVersion = (range: string) => {
  const match = range.match(/\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?/)
  return match?.[0]
}

export const syncEffectSubtree = Effect.fnUntraced(function*(config: SyncEffectConfig) {
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

  const versionMentions: Array<{
    manifestPath: string
    section: string
    name: string
    range: string
    normalized: string
  }> = []

  for (const manifestPath of config.manifestPaths) {
    if (!(yield* fs.exists(manifestPath))) continue

    const manifest = JSON.parse(yield* fs.readFileString(manifestPath))

    for (const section of depSections) {
      const deps = (manifest[section] ?? {}) as Record<string, string>

      for (const [name, range] of Object.entries(deps)) {
        if (name !== "effect" && !name.startsWith("@effect/")) continue

        const normalized = normalizeVersion(String(range))
        if (!normalized) continue

        versionMentions.push({ manifestPath, section, name, range: String(range), normalized })
      }
    }
  }

  const effectPackageMentions = versionMentions.filter((e) => e.name === "effect")

  const versionsFromEffectPackage = [...new Set(effectPackageMentions.map((e) => e.normalized))]

  const versionsFromEffectScope = [
    ...new Set(
      versionMentions
        .filter((e) => e.name.startsWith("@effect/") && e.normalized.startsWith("4."))
        .map((e) => e.normalized)
    )
  ]

  const versions = versionsFromEffectPackage.length > 0
    ? versionsFromEffectPackage
    : versionsFromEffectScope

  if (versions.length === 0) {
    return yield* Effect.fail(
      new Error("Could not find any effect/@effect dependency versions in manifests")
    )
  }

  if (versions.length > 1) {
    const details = (effectPackageMentions.length > 0 ? effectPackageMentions : versionMentions)
      .map((e) => `${e.manifestPath} (${e.section}) ${e.name}: ${e.range}`)
      .join("\n")

    return yield* Effect.fail(
      new Error(`Found multiple Effect versions. Please align first:\n${details}`)
    )
  }

  const version = versions[0]
  const candidateRefs = [
    `effect@${version}`,
    `@effect/effect@${version}`,
    `@effect/ai-anthropic@${version}`
  ]

  const url = shellQuote(config.url)

  let ref: string | undefined
  for (const candidate of candidateRefs) {
    const tagResult = yield* runGetString(
      `git ls-remote --exit-code --tags ${url} ${shellQuote(`refs/tags/${candidate}`)}`
    )
      .pipe(Effect.option)

    if (Option.isSome(tagResult)) {
      ref = candidate
      break
    }
  }

  if (!ref) {
    return yield* Effect.fail(
      new Error(`No matching tag found for version ${version}. Tried: ${candidateRefs.join(", ")}`)
    )
  }

  yield* Effect.logInfo(`Using effect version: ${version}`)
  yield* Effect.logInfo(`Using subtree ref: ${ref}`)
  yield* Effect.logInfo(`Using subtree url: ${config.url}`)
  const syncRef = "refs/effa-sync/effect-selected"
  yield* fetchRemoteRef(`refs/tags/${ref}`, syncRef)
  yield* run(
    `git -c status.showUntrackedFiles=no subtree pull --prefix=${shellQuote(config.subtreePrefix)} . ${
      shellQuote(syncRef)
    } --squash`
  )
})

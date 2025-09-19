/* eslint-disable no-constant-binary-expression */
/* eslint-disable no-empty-pattern */
// import necessary modules from the libraries
import { FileSystem, Path } from "@effect/platform"

import { Array, Config, Data, Effect, Option, ParseResult, pipe, Redacted, Schema, SynchronizedRef } from "effect"

import * as yaml from "js-yaml"
import path from "path"
import { RunCommandService } from "./os-command.js"

//
//
// Schemas
//

export class GistEntry extends Schema.Class<GistEntry>("GistEntry")({
  description: Schema.String,
  public: Schema.Boolean,
  files: Schema.Array(Schema.String)
}) {}

/**
 * Extended gist entry that validates file_name uniqueness and extracts base filenames.
 *
 * GitHub Gists have a flat file structure and do not support directories/folders.
 * All files within a gist must exist in the same namespace, meaning that files
 * with identical names will collide, even if they originate from different local
 * directories. When multiple files share the same basename, GitHub will either:
 * - Reject the gist creation
 * - Silently overwrite files (last one wins)
 * - Display unpredictable behavior
 *
 * This validation prevents such collisions by detecting when multiple file paths
 * would result in the same file_name when flattened to the gist structure.
 *
 * @example
 * // These paths would collide in a gist
 * ["src/config.json", "dist/config.json"] // Both become "config.json"
 *
 * @see {@link https://docs.github.com/articles/creating-gists | GitHub Gist Documentation}
 * @see {@link https://github.com/orgs/community/discussions/29584 | Community Discussion on Gist Folder Support}
 */
export class GistEntryDecoded extends GistEntry.transformOrFail<GistEntryDecoded>("GistEntryDecoded")({
  files_with_name: Schema.Array(Schema.Struct({
    path: Schema.String,
    name: Schema.String
  }))
}, {
  decode: Effect.fnUntraced(function*(entry, _, ast) {
    const files_with_name = entry.files.map((file) => ({
      path: file,
      name: path.basename(file) // <-- I'm using Node's path module here so that this schema works without requirements on Effect's Path module
    }))

    // check for duplicate file names
    const nameMap = new Map<string, string[]>()
    for (const { name, path: filePath } of files_with_name) {
      if (!nameMap.has(name)) {
        nameMap.set(name, [])
      }
      nameMap.get(name)!.push(filePath)
    }

    // find duplicates and collect all collisions
    const collisions: ParseResult.ParseIssue[] = []
    for (const [fileName, paths] of nameMap.entries()) {
      if (paths.length > 1) {
        collisions.push(
          new ParseResult.Type(
            ast,
            paths,
            `Duplicate file name detected: "${fileName}". Colliding paths: ${paths.join(", ")}`
          )
        )
      }
    }

    // if there are any collisions, fail with all of them
    if (Array.isNonEmptyArray(collisions)) {
      return yield* Effect.fail(
        new ParseResult.Composite(
          ast,
          entry.files,
          collisions
        )
      )
    }

    return yield* Effect.succeed({
      ...entry,
      files_with_name
    })
  }),
  encode: (({ files_with_name, ...entry }) => ParseResult.succeed(entry))
}) {}

export class GistYAML extends Schema.Class<GistYAML>("GistYAML")({
  gists: Schema.Record({
    key: Schema.String,
    value: GistEntryDecoded
  }),
  settings: Schema.Struct({
    token_env: Schema.String,
    base_directory: Schema.String
  })
}) {}

export class GistCacheEntry extends Schema.Class<GistCacheEntry>("GistCacheEntry")({
  name: Schema.String,
  id: Schema.String
}) {}

export const GistCacheEntries = Schema.Array(GistCacheEntry)
export interface GistCacheEntries extends Schema.Schema.Type<typeof GistCacheEntries> {}

/**
 * Gist cache mapping YAML configuration names to GitHub gist IDs.
 *
 * Since GitHub gists don't have user-defined names, we maintain a cache
 * that maps the human-readable names from our YAML config to actual gist IDs.
 * This allows us to:
 * - Update existing gists instead of creating duplicates
 * - Clean up obsolete entries when gists are removed from config
 * - Persist the name->ID mapping across CLI runs
 *
 * The cache itself is stored as a secret GitHub gist for persistence.
 */
export class GistCache {
  entries: GistCacheEntries
  gist_id: string

  constructor({ entries, gist_id }: { entries: GistCacheEntries; gist_id: string }) {
    this.entries = entries
    this.gist_id = gist_id
  }
}

//
//
// Errors
//
class GistCacheNotFound extends Data.TaggedError("GistCacheNotFound")<{
  readonly reason: string
}> {}

class GistYAMLError extends Data.TaggedError("GistYAMLError")<{
  readonly reason: string
}> {}

//
//
// Services
//

class GHGistService extends Effect.Service<GHGistService>()("GHGistService", {
  dependencies: [RunCommandService.Default],
  effect: Effect.gen(function*() {
    const CACHE_GIST_DESCRIPTION = "GIST_CACHE_DO_NOT_EDIT_effa_cli_internal"
    const { runGetExitCode, runGetString } = yield* RunCommandService

    // the client cannot recover from PlatformErrors, so we convert failures into defects to clean up the signatures
    const runGetExitCodeSuppressed = (...args: Parameters<typeof runGetExitCode>) => {
      return runGetExitCode(...args).pipe(
        Effect.catchAll((e) => Effect.dieMessage(`Command failed: ${args.join(" ")}\nError: ${e.message}`)),
        Effect.asVoid
      )
    }

    // the client cannot recover from PlatformErrors, so we convert failures into defects to clean up the signatures
    const runGetStringSuppressed = (...args: Parameters<typeof runGetString>) => {
      return runGetString(...args).pipe(
        Effect.catchAll((e) => Effect.dieMessage(`Command failed: ${args.join(" ")}\nError: ${e.message}`))
      )
    }

    /**
     * Extracts the Gist ID from a given GitHub Gist URL: https://gist.github.com/user/ID
     * @param url - The full URL of the GitHub Gist.
     * @returns An Option containing the Gist ID if extraction is successful, otherwise None.
     */
    function extractGistIdFromUrl(url: string) {
      const gist_id = url.trim().split("/").pop()
      return gist_id && gist_id.length > 0 ? Option.some(gist_id) : Option.none()
    }

    const loadGistCache = Effect
      .fn("effa-cli.gist.loadGistCache")(
        function*() {
          // search for existing cache gist
          const output = yield* runGetStringSuppressed(`gh gist list --filter "${CACHE_GIST_DESCRIPTION}"`)
            .pipe(Effect.orElse(() => Effect.succeed("")))

          const lines = output.trim().split("\n").filter((line: string) => line.trim())

          // extract first gist ID (should be our cache gist)
          const firstLine = lines[0]
          if (!firstLine) {
            return yield* new GistCacheNotFound({ reason: "Empty gist list output" })
          }

          const parts = firstLine.split(/\s+/)
          const gist_id = parts[0]?.trim()

          if (!gist_id) {
            return yield* new GistCacheNotFound({ reason: "No gist ID found in output" })
          } else {
            yield* Effect.logInfo(`Found existing cache gist with ID ${gist_id}`)
          }

          // read cache gist content
          const cacheContent = yield* runGetStringSuppressed(`gh gist view ${gist_id}`)
            .pipe(Effect.orElse(() => Effect.succeed("")))

          const entries = yield* pipe(
            cacheContent.split(CACHE_GIST_DESCRIPTION)[1]?.trim(),
            pipe(Schema.parseJson(GistCacheEntries), Schema.decodeUnknown),
            Effect.orElse(() => new GistCacheNotFound({ reason: "Failed to parse cache JSON" }))
          )

          return { entries, gist_id }
        },
        Effect.catchTag("GistCacheNotFound", () =>
          Effect.gen(function*() {
            // cache doesn't exist, create it
            yield* Effect.logInfo("Cache gist not found, creating new cache...")

            const cacheJson = yield* pipe(
              [],
              pipe(Schema.parseJson(GistCacheEntries), Schema.encodeUnknown),
              // cannot recover from parse errors in any case, better to die here instead of cluttering the signature
              Effect.orDie
            )

            const gistUrl = yield* runGetStringSuppressed(
              `echo '${cacheJson}' | gh gist create --desc="${CACHE_GIST_DESCRIPTION}" -`
            )

            const gist_id = yield* pipe(
              gistUrl,
              extractGistIdFromUrl,
              Option.match({
                onNone: () => Effect.dieMessage(`Could not extract cache's gist ID from URL: ${gistUrl}`),
                onSome: (id) =>
                  Effect.succeed(id).pipe(Effect.tap(Effect.logInfo(`Created new cache gist with ID ${id}`)))
              })
            )

            return { entries: [], gist_id }
          })),
        Effect.map(({ entries, gist_id }) => new GistCache({ entries, gist_id }))
      )

    const saveGistCache = Effect.fn("effa-cli.gist.saveGistCache")(
      function*(cache: GistCache) {
        const cacheJson = yield* pipe(
          cache.entries,
          pipe(Schema.parseJson(GistCacheEntries), Schema.encodeUnknown),
          // cannot recover from parse errors in any case, better to die here instead of cluttering the signature
          Effect.orDie
        )

        yield* runGetExitCodeSuppressed(`echo '${cacheJson}' | gh gist edit ${cache.gist_id} -`)
      }
    )

    const createGistWithFiles = Effect.fn("GHGistService.createGistWithFiles")(
      function*({ cache, description, files, gist_name, is_public }: {
        gist_name: string
        description: string
        files: string[]
        is_public: boolean
        cache: GistCache
      }) {
        yield* Effect.logInfo(`Creating gist ${gist_name} with ${files.length} file(s)`)

        const ghCommand = [
          "gh",
          "gist",
          "create",
          `--desc="${description}"`,
          is_public ? "--public" : "",
          ...files.map((filePath) => `"${filePath}"`)
        ]
          .filter((x) => !!x)
          .join(" ")

        // create and capture the created gist URL
        const gistUrl = yield* runGetStringSuppressed(ghCommand)

        // extract ID from URL
        return yield* pipe(
          gistUrl,
          extractGistIdFromUrl,
          Option.match({
            onNone: () => Effect.dieMessage(`Failed to extract gist ID from URL: ${gistUrl}`),
            onSome: (id) =>
              Effect
                .succeed(
                  new GistCache({
                    gist_id: cache.gist_id,
                    entries: [...cache.entries, { name: gist_name, id }]
                  })
                )
                .pipe(Effect.tap(Effect.logInfo(`Created gist with ID ${id}`)))
          })
        )
      }
    )

    const getGistFileNames = Effect.fn("getGistFileNames")(
      function*({ gist_id, gist_name }: {
        gist_id: string
        gist_name: string
      }) {
        yield* Effect.logInfo(`Retrieving file names from gist ${gist_name} with ID ${gist_id}`)
        const output = yield* runGetStringSuppressed(`gh gist view ${gist_id} --files`)
        return output
          .trim()
          .split("\n")
          .filter((line: string) => line.trim())
      }
    )

    const removeFileFromGist = Effect.fn("removeFileFromGist")(
      function*({ file_name, gist_id, gist_name }: {
        gist_id: string
        gist_name: string
        file_name: string
      }) {
        yield* Effect.logInfo(`Removing file ${file_name} from gist ${gist_name}`)
        return yield* runGetExitCodeSuppressed(`gh gist edit ${gist_id} --remove "${file_name}"`)
      }
    )

    const updateFileOfGist = Effect.fn("updateFileOfGist")(
      function*({ file_name, file_path, gist_id, gist_name }: {
        gist_id: string
        gist_name: string
        file_name: string
        file_path: string
      }) {
        yield* Effect.logInfo(`Updating file ${file_name} located at ${file_path} of gist ${gist_name}`)
        const editCommand = [
          "gh",
          "gist",
          "edit",
          gist_id,
          "-f",
          file_name,
          `"${file_path}"`
        ]
          .join(" ")

        return yield* runGetExitCodeSuppressed(editCommand)
      }
    )

    const addFileToGist = Effect.fn("addFileToGist")(
      function*({ file_path, gist_id, gist_name }: {
        gist_id: string
        gist_name: string
        file_path: string
      }) {
        yield* Effect.logInfo(`Adding file ${file_path} to gist ${gist_name}`)
        const editCommand = [
          "gh",
          "gist",
          "edit",
          gist_id,
          "-a",
          `"${file_path}"`
        ]
          .join(" ")

        return yield* runGetExitCodeSuppressed(editCommand)
      }
    )

    const login = Effect.fn("GHGistService.login")(function*(token: string) {
      if ((yield* runGetExitCode("gh --version").pipe(Effect.orDie)) !== 0) {
        return yield* Effect.dieMessage(
          "GitHub CLI (gh) is not installed or not found in PATH. Please install it to use the gist command."
        )
      }

      const isLogged = yield* runGetExitCode(`echo ${token} | gh auth login --with-token`).pipe(Effect.orDie)
      if (isLogged !== 0) {
        return yield* Effect.fail(new Error("Failed to log in to GitHub CLI with provided token"))
      } else {
        yield* Effect.logInfo("Successfully logged in to GitHub CLI")
      }
    })

    return {
      /** Logs into GitHub using the GitHub CLI.
       * This is a prerequisite for other gist operations.
       * @param token - The GitHub personal access token with gist permissions
       *
       * @returns An Effect that succeeds when login is successful
       */
      login,

      /**
       * Loads the gist cache from GitHub, containing mappings of YAML configuration names to gist IDs.
       * If no cache exists, creates a new empty cache gist.
       *
       * @returns An Effect that yields a GistCache containing the loaded cache entries and cache gist ID
       */
      loadGistCache,

      /**
       * Saves the current gist cache state to the GitHub cache gist.
       * Updates the existing cache gist with the current mappings of names to gist IDs.
       *
       * @param cache - The GistCache instance to save
       * @returns An Effect that succeeds when the cache is successfully saved
       */
      saveGistCache,

      /**
       * Creates a new GitHub gist with the specified files and updates the local cache.
       * Generates a GitHub CLI command to create the gist and extracts the resulting gist ID.
       *
       * @param cache - The current GistCache instance
       * @param name - The human-readable name for this gist (used in cache mapping)
       * @param description - The description for the GitHub gist
       * @param files - Array of file paths to include in the gist
       * @param is_public - Whether the gist should be public or private
       * @returns An Effect that yields an updated GistCache with the new gist entry
       */
      createGistWithFiles,

      /**
       * Retrieves file names from a GitHub gist.
       * Fetches the list of files contained in the specified gist.
       *
       * @param gist_id - The GitHub gist ID to retrieve file names from
       * @param gist_name - The human-readable name of the gist (for logging purposes)
       * @returns An Effect that yields an array of file names
       */
      getGistFileNames,

      /**
       * Removes a file from a specified GitHub gist.
       * @param gist_id - The ID of the gist to modify
       * @param gist_name - The human-readable name of the gist (for logging purposes)
       * @param file_name - The name of the file to remove from the gist
       * @returns An Effect that succeeds when the file is removed
       */
      removeFileFromGist,

      /**
       * Updates a file in a specified GitHub gist.
       * @param gist_id - The ID of the gist to modify
       * @param gist_name - The human-readable name of the gist (for logging purposes)
       * @param file_name - The name of the file to remove from the gist
       * @param file_path - The local path of the file to update in the gist
       * @returns An Effect that succeeds when the file is updated
       */
      updateFileOfGist,

      /**
       * Adds a new file to a specified GitHub gist.
       * @param gist_id - The ID of the gist to modify
       * @param gist_name - The human-readable name of the gist (for logging purposes)
       * @param file_path - The local path of the file to add to the gist
       * @returns An Effect that succeeds when the file is added
       */
      addFileToGist
    }
  })
}) {}

// @effect-diagnostics-next-line missingEffectServiceDependency:off
export class GistHandler extends Effect.Service<GistHandler>()("GistHandler", {
  accessors: true,
  dependencies: [GHGistService.Default],
  effect: Effect.gen(function*() {
    const GH = yield* GHGistService

    // I prefer to provide these two only once during the main CLI pipeline setup
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path

    return {
      handler: Effect.fn("effa-cli.gist.GistHandler")(function*({ YAMLPath }: { YAMLPath: string }) {
        yield* Effect.logInfo(`Reading configuration from ${YAMLPath}`)

        const configExists = yield* fs.exists(YAMLPath)
        if (!configExists) {
          return yield* Effect.fail(new Error(`Configuration file not found: ${YAMLPath}`))
        }

        const config = yield* pipe(
          YAMLPath,
          fs.readFileString,
          Effect.andThen((content) =>
            Effect.try({
              try: () => yaml.load(content),
              catch(error) {
                return new GistYAMLError({ reason: `Failed to parse YAML: ${(error as Error).message}` })
              }
            })
          ),
          Effect.andThen(Schema.decodeUnknown(GistYAML))
        )

        // load GitHub token securely from environment variable
        const redactedToken = yield* Config.redacted(config.settings.token_env)

        yield* Effect.logInfo(`Using GitHub token from environment variable: ${config.settings.token_env}`)
        yield* Effect.logInfo(`Token loaded: ${redactedToken}`) // this will show <redacted> in logs

        yield* GH.login(Redacted.value(redactedToken))

        const cache = yield* SynchronizedRef.make<GistCache>(yield* GH.loadGistCache())

        // handle each gist entry in the configuration
        for (const [name, gistConfig] of Object.entries(config.gists)) {
          const { description, files_with_name, public: is_public } = gistConfig

          yield* Effect.logInfo(`Processing gist ${name}`)

          const filesOnDiskWithFullPath = yield* Effect
            .all(
              files_with_name.map((f) =>
                Effect.gen(function*() {
                  const fullPath = path.join(config.settings.base_directory, f.path)
                  const fileExists = yield* fs.exists(fullPath)

                  if (!fileExists) {
                    yield* Effect.logWarning(`File not found: ${fullPath}, skipping...`)
                    return Option.none()
                  }

                  return Option.some({
                    path: fullPath,
                    name: f.name
                  })
                })
              ),
              {
                concurrency: "unbounded"
              }
            )
            .pipe(Effect.map(Array.getSomes))

          const gistFromCache = (yield* SynchronizedRef.get(cache)).entries.find((_) => _.name === name)

          // if the gist's name exists in cache, update the existing gist
          // otherwise, create a new gist and update the local cache
          if (gistFromCache) {
            yield* Effect.logInfo(`Updating existing gist ${gistFromCache.name} with ID ${gistFromCache.id}`)

            // get current files in the gist to detect removed files
            const gistFileNames = new Set(
              yield* GH.getGistFileNames({
                gist_id: gistFromCache.id,
                gist_name: gistFromCache.name
              })
            )

            const expectedFiles = new Set(filesOnDiskWithFullPath.map(({ name }) => name))

            // remove files that are no longer in YAML configuration
            for (const gf of gistFileNames) {
              if (!expectedFiles.has(gf)) {
                yield* GH.removeFileFromGist({
                  gist_id: gistFromCache.id,
                  gist_name: gistFromCache.name,
                  file_name: gf
                })
              }
            }

            // update/add files from configuration
            for (const f of filesOnDiskWithFullPath) {
              if (gistFileNames.has(f.name)) {
                yield* GH.updateFileOfGist({
                  gist_id: gistFromCache.id,
                  gist_name: gistFromCache.name,
                  file_name: f.name,
                  file_path: f.path
                })
              } else {
                yield* GH.addFileToGist({
                  gist_id: gistFromCache.id,
                  gist_name: gistFromCache.name,
                  file_path: f.path
                })
              }
            }
          } else {
            if (filesOnDiskWithFullPath.length !== 0) {
              yield* SynchronizedRef.getAndUpdateEffect(cache, (cache) => {
                return GH.createGistWithFiles({
                  gist_name: name,
                  description,
                  is_public,
                  cache,
                  files: filesOnDiskWithFullPath.map((f) => f.path)
                })
              })
            } else {
              yield* Effect.logWarning(`No valid files found for gist ${name}, skipping creation...`)
            }
          }

          // here the local cache has been updated, but not yet saved to GitHub
          // we still want to remove gists from cache that are no longer in the configuration

          const configGistNames = new Set(Object.entries(config.gists).map(([name]) => name))

          const newCache = yield* SynchronizedRef.updateAndGetEffect(
            cache,
            Effect.fnUntraced(function*(cache) {
              const newEntries = [...cache.entries]

              for (let i = newEntries.length - 1; i >= 0; i--) {
                const cacheEntry = newEntries[i]
                if (cacheEntry && !configGistNames.has(cacheEntry.name)) {
                  yield* Effect.logInfo(
                    `Obsolete gist ${cacheEntry.name} with ID ${cacheEntry.id}) will be removed from cache`
                  )
                  newEntries.splice(i, 1)
                }
              }

              return { ...cache, entries: newEntries }
            })
          )

          yield* GH.saveGistCache(newCache)

          yield* Effect.logInfo("Gist operations completed")
        }
      })
    }
  })
}) {}

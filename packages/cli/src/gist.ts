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
  company: Schema.String,
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
  gists: Schema
    .Record({
      key: Schema.String,
      value: GistEntryDecoded
    })
    .pipe(Schema.optionalWith({
      default: () => ({}),
      nullable: true,
      exact: true
    })),
  settings: Schema.Struct({
    token_env: Schema.String,
    base_directory: Schema.String
  })
}) {}

/**
 * Cache entry representing a gist mapping with company association.
 * Each entry contains the gist's human-readable name, GitHub ID, and company context.
 * Company field enables multi-tenant cache management where different companies
 * can maintain separate gist namespaces within the same cache.
 */
export class GistCacheEntry extends Schema.Class<GistCacheEntry>("GistCacheEntry")({
  name: Schema.String,
  id: Schema.String,
  company: Schema.String
}) {}

export const GistCacheEntries = Schema.Array(GistCacheEntry)
export interface GistCacheEntries extends Schema.Schema.Type<typeof GistCacheEntries> {}

/**
 * Gist cache mapping YAML configuration names to GitHub gist IDs with company awareness.
 *
 * Since GitHub gists don't have user-defined names, we maintain a cache
 * that maps the human-readable names from our YAML config to actual gist IDs.
 * Each cache entry is associated with a company, enabling multi-tenant operations.
 * This allows us to:
 * - Update existing gists instead of creating duplicates
 * - Clean up obsolete entries when gists are removed from config
 * - Persist the name->ID mapping across CLI runs
 * - Isolate gist operations by company context
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
  readonly message: string
}> {}

class GistYAMLError extends Data.TaggedError("GistYAMLError")<{
  readonly message: string
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
            return yield* new GistCacheNotFound({ message: "Empty gist list output" })
          }

          const parts = firstLine.split(/\s+/)
          const gist_id = parts[0]?.trim()

          if (!gist_id) {
            return yield* new GistCacheNotFound({ message: "No gist ID found in output" })
          } else {
            yield* Effect.logInfo(`Found existing cache gist with ID ${gist_id}`)
          }

          // read cache gist content
          const cacheContent = yield* runGetStringSuppressed(`gh gist view ${gist_id}`)
            .pipe(Effect.orElse(() => Effect.succeed("")))

          const entries = yield* pipe(
            cacheContent.split(CACHE_GIST_DESCRIPTION)[1]?.trim(),
            pipe(Schema.parseJson(GistCacheEntries), Schema.decodeUnknown),
            Effect.orElse(() => new GistCacheNotFound({ message: "Failed to parse cache JSON" }))
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
      function*({ description, env, files, gist_name, is_public }: {
        gist_name: string
        description: string
        files: {
          path: string
          name: string
        }[]
        is_public: boolean
        env: string
      }) {
        yield* Effect.logInfo(`Creating gist ${gist_name} with ${files.length} file(s)`)

        const ghCommand = [
          "gh",
          "gist",
          "create",
          `--desc="${description}"`,
          is_public ? "--public" : "",
          ...files.map((file) => `"${file.path}"`)
        ]
          .filter((x) => !!x)
          .join(" ")

        // create and capture the created gist URL
        const gistUrl = yield* runGetStringSuppressed(ghCommand)

        // extract ID from URL
        const gistNameId = yield* pipe(
          gistUrl,
          extractGistIdFromUrl,
          Option.match({
            onNone: () => Effect.dieMessage(`Failed to extract gist ID from URL: ${gistUrl}`),
            onSome: (id) =>
              Effect
                .succeed(
                  { name: gist_name, id }
                )
                .pipe(Effect.tap(Effect.logInfo(`Created gist with ID ${id}`)))
          })
        )

        // rename all files to include environment prefix for multi-environment support
        for (const file of files) {
          const originalName = file.name
          const name_with_env = `${env}.${originalName}`
          const ghRenameCommand = [
            "gh",
            "gist",
            "rename",
            gistNameId.id,
            originalName,
            name_with_env
          ]
            .join(" ")

          yield* Effect.logInfo(`Renaming file ${originalName} to ${name_with_env} in gist ${gist_name}`)
          yield* runGetStringSuppressed(ghRenameCommand)
        }

        return gistNameId
      }
    )

    const getGistFileNames = Effect.fn("getGistFileNames")(
      function*({ env, gist_id, gist_name }: {
        gist_id: string
        gist_name: string
        env: string
      }) {
        yield* Effect.logInfo(`Retrieving file names from gist ${gist_name} with ID ${gist_id}`)
        const output = yield* runGetStringSuppressed(`gh gist view ${gist_id} --files`)

        // filter file names by environment prefix and remove the prefix
        // files in gists are prefixed with "env." to support multiple environments
        return Array.filterMap(
          output
            .trim()
            .split("\n"),
          (fn) => {
            const fnTrimmed = fn.trim()
            if (!fnTrimmed.startsWith(env + ".")) {
              return Option.none()
            }
            return Option.some(
              fnTrimmed.substring(env.length + 1) // remove env prefix and dot
            )
          }
        )
      }
    )

    const removeFileFromGist = Effect.fn("removeFileFromGist")(
      function*({ env, file_name, gist_id, gist_name }: {
        gist_id: string
        gist_name: string
        file_name: string
        env: string
      }) {
        const name_with_env = `${env}.${file_name}`
        yield* Effect.logInfo(`Removing file ${name_with_env} from gist ${gist_name}`)
        return yield* runGetExitCodeSuppressed(`gh gist edit ${gist_id} --remove "${name_with_env}"`)
      }
    )

    const updateFileOfGist = Effect.fn("updateFileOfGist")(
      function*({ env, file_name, file_path, gist_id, gist_name }: {
        gist_id: string
        gist_name: string
        file_name: string
        file_path: string
        env: string
      }) {
        const name_with_env = `${env}.${file_name}`
        yield* Effect.logInfo(`Updating file ${name_with_env} located at ${file_path} of gist ${gist_name}`)

        // it seems this does not require renaming the file
        const editCommand = [
          "gh",
          "gist",
          "edit",
          gist_id,
          "-f",
          name_with_env,
          `"${file_path}"`
        ]
          .join(" ")

        return yield* runGetExitCodeSuppressed(editCommand)
      }
    )

    const addFileToGist = Effect.fn("addFileToGist")(
      function*({ env, file, gist_id, gist_name }: {
        gist_id: string
        gist_name: string
        file: {
          path: string
          name: string
        }
        env: string
      }) {
        yield* Effect.logInfo(`Adding file ${file.path} to gist ${gist_name}`)
        const editCommand = [
          "gh",
          "gist",
          "edit",
          gist_id,
          "-a",
          `"${file.path}"`
        ]
          .join(" ")

        yield* runGetExitCodeSuppressed(editCommand)

        const renameCommand = [
          "gh",
          "gist",
          "rename",
          gist_id,
          file.name,
          `${env}.${file.name}`
        ]
          .join(" ")

        yield* Effect.logInfo(`Renaming file ${file.name} to ${env}.${file.name} in gist ${gist_name}`)
        return yield* runGetExitCodeSuppressed(renameCommand)
      }
    )

    const deleteGist = Effect.fn("deleteGist")(
      function*({ gist_id, gist_name }: { gist_id: string; gist_name: string }) {
        yield* Effect.logInfo(`Deleting gist ${gist_name} with ID ${gist_id}`)
        return yield* runGetExitCodeSuppressed(`gh gist delete ${gist_id}`)
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
       * Creates a new GitHub gist with the specified files and renames them with environment prefixes.
       * Generates a GitHub CLI command to create the gist, extracts the resulting gist ID,
       * and renames all files with environment prefixes for multi-environment support.
       *
       * @param gist_name - The human-readable name for this gist (used in cache mapping)
       * @param description - The description for the GitHub gist
       * @param files - Array of file objects with path and name properties to include in the gist
       * @param is_public - Whether the gist should be public or private
       * @param env - Environment prefix to prepend to file names (e.g., "local-dev", "prod")
       * @returns An Effect that yields a gist entry object with name and id properties
       */
      createGistWithFiles,

      /**
       * Retrieves file names from a GitHub gist, filtered by environment prefix.
       * Fetches the list of files contained in the specified gist and returns only
       * those that match the current environment, with the environment prefix removed.
       *
       * @param gist_id - The GitHub gist ID to retrieve file names from
       * @param gist_name - The human-readable name of the gist (for logging purposes)
       * @param env - Environment prefix to filter files by (e.g., "local-dev", "prod")
       * @returns An Effect that yields an array of file names with environment prefix removed
       */
      getGistFileNames,

      /**
       * Removes a file from a specified GitHub gist.
       * The file name is automatically prefixed with the environment when removing.
       * @param gist_id - The ID of the gist to modify
       * @param gist_name - The human-readable name of the gist (for logging purposes)
       * @param file_name - The base name of the file to remove (without environment prefix)
       * @param env - Environment prefix that was used when the file was added
       * @returns An Effect that succeeds when the file is removed
       */
      removeFileFromGist,

      /**
       * Updates a file in a specified GitHub gist.
       * The file name is automatically prefixed with the environment when updating.
       * @param gist_id - The ID of the gist to modify
       * @param gist_name - The human-readable name of the gist (for logging purposes)
       * @param file_name - The base name of the file to update (without environment prefix)
       * @param file_path - The local path of the file to update in the gist
       * @param env - Environment prefix that was used when the file was added
       * @returns An Effect that succeeds when the file is updated
       */
      updateFileOfGist,

      /**
       * Adds a new file to a specified GitHub gist.
       * The file is automatically renamed with an environment prefix for multi-environment support.
       * @param gist_id - The ID of the gist to modify
       * @param gist_name - The human-readable name of the gist (for logging purposes)
       * @param file - The file object containing path and name properties
       * @param env - Environment prefix to prepend to the file name
       * @returns An Effect that succeeds when the file is added and renamed
       */
      addFileToGist,

      /**
       * Deletes a specified GitHub gist by its ID.
       * @param gist_id - The ID of the gist to delete
       * @param gist_name - The human-readable name of the gist (for logging purposes)
       * @returns An Effect that succeeds when the gist is deleted
       */
      deleteGist
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
        // load company and environment from environment variables
        const CONFIG = yield* Effect.all({
          company: Config.string("COMPANY"),
          env: Config.string("ENV").pipe(Config.withDefault("local-dev"))
        })

        yield* Effect.logInfo(`Company: ${CONFIG.company}, ENV: ${CONFIG.env}`)

        yield* Effect.logInfo(`Reading configuration from ${YAMLPath}`)

        const configExists = yield* fs.exists(YAMLPath)
        if (!configExists) {
          return yield* Effect.fail(new Error(`Configuration file not found: ${YAMLPath}`))
        }

        const configFromYaml = yield* pipe(
          YAMLPath,
          fs.readFileString,
          Effect.andThen((content) =>
            Effect.try({
              try: () => yaml.load(content),
              catch(error) {
                return new GistYAMLError({ message: `Failed to parse YAML: ${(error as Error).message}` })
              }
            })
          ),
          Effect.andThen(Schema.decodeUnknown(GistYAML))
        )

        // load GitHub token securely from environment variable
        const redactedToken = yield* Config.redacted(configFromYaml.settings.token_env)

        yield* Effect.logInfo(`Using GitHub token from environment variable: ${configFromYaml.settings.token_env}`)
        yield* Effect.logInfo(`Token loaded: ${redactedToken}`) // this will show <redacted> in logs

        yield* GH.login(Redacted.value(redactedToken))

        const cache = yield* SynchronizedRef.make<GistCache>(yield* GH.loadGistCache())

        // filter YAML gists by company to ensure isolation between different organizations
        // this prevents cross-company gist operations and maintains data separation
        const thisCompanyGistsFromYaml = Object
          .entries(configFromYaml.gists)
          .filter(([, v]) => v.company === CONFIG.company)

        for (
          const [name, gistConfig] of thisCompanyGistsFromYaml
        ) {
          const { description, files_with_name, public: is_public } = gistConfig

          yield* Effect.logInfo(`Processing gist ${name}`)

          const filesOnDiskWithFullPath = yield* Effect
            .all(
              files_with_name.map((f) =>
                Effect.gen(function*() {
                  const fullPath = path.join(configFromYaml.settings.base_directory, f.path)
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
                gist_name: gistFromCache.name,
                env: CONFIG.env
              })
            )

            const expectedFiles = new Set(filesOnDiskWithFullPath.map(({ name }) => name))

            // remove files that are no longer in YAML configuration
            for (const gf of gistFileNames) {
              if (!expectedFiles.has(gf)) {
                yield* GH.removeFileFromGist({
                  gist_id: gistFromCache.id,
                  gist_name: gistFromCache.name,
                  file_name: gf,
                  env: CONFIG.env
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
                  file_path: f.path,
                  env: CONFIG.env
                })
              } else {
                yield* GH.addFileToGist({
                  gist_id: gistFromCache.id,
                  gist_name: gistFromCache.name,
                  file: f,
                  env: CONFIG.env
                })
              }
            }
          } else {
            if (filesOnDiskWithFullPath.length !== 0) {
              yield* SynchronizedRef.getAndUpdateEffect(
                cache,
                Effect.fnUntraced(function*(cache) {
                  return new GistCache({
                    gist_id: cache.gist_id,
                    entries: [
                      ...cache.entries,
                      {
                        ...(yield* GH.createGistWithFiles({
                          gist_name: name,
                          description,
                          is_public,

                          files: filesOnDiskWithFullPath,
                          env: CONFIG.env
                        })),
                        company: CONFIG.company
                      }
                    ]
                  })
                })
              )
            } else {
              yield* Effect.logWarning(`No valid files found for gist ${name}, skipping creation...`)
            }
          }
        }

        // cache cleanup: remove gists that are no longer in YAML configuration
        // only affects entries for the current company to maintain isolation
        const configGistNames = new Set(
          thisCompanyGistsFromYaml
            .map(([name]) => name)
        )

        const newCache = yield* SynchronizedRef.updateAndGetEffect(
          cache,
          Effect.fnUntraced(function*(cache) {
            const newEntries = [...cache.entries]

            // remove obsolete cache entries for current company only
            // this ensures gists from other companies remain untouched
            for (let i = newEntries.length - 1; i >= 0; i--) {
              const cacheEntry = newEntries[i]
              if (cacheEntry && cacheEntry.company === CONFIG.company && !configGistNames.has(cacheEntry.name)) {
                // delete the actual gist from GitHub
                yield* GH.deleteGist({
                  gist_id: cacheEntry.id,
                  gist_name: cacheEntry.name
                })
                yield* Effect.logInfo(
                  `Obsolete gist ${cacheEntry.name} of company ${cacheEntry.company} with ID ${cacheEntry.id}) will be removed from cache`
                )
                newEntries.splice(i, 1)
              }
            }

            return { ...cache, entries: newEntries }
          })
        )

        yield* GH.saveGistCache(newCache)

        yield* Effect.logInfo("Gist operations completed")
      })
    }
  })
}) {}

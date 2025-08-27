/* eslint-disable no-empty-pattern */
// Import necessary modules from the libraries
import { Args, Command, Options, Prompt } from "@effect/cli"
import { Command as NodeCommand, FileSystem } from "@effect/platform"
import { NodeContext, NodeRuntime } from "@effect/platform-node"
import { Effect, Stream } from "effect"
import { packages } from "./shared.js"

/**
 * Executes a shell command using Node.js Command API with inherited stdio streams.
 * The command is run through the system shell (/bin/sh) for proper command parsing.
 *
 * @param cmd - The shell command to execute
 * @returns An Effect that succeeds with the exit code or fails with a PlatformError
 */
const runNodeCommand = (cmd: string) =>
  NodeCommand
    .make("sh", "-c", cmd)
    .pipe(
      NodeCommand.stdout("inherit"),
      NodeCommand.stderr("inherit"),
      NodeCommand.exitCode
    )

/**
 * Creates a file if it doesn't exist or updates the access and modification times of an existing file.
 * This is the effectful equivalent of the Unix `touch` command.
 *
 * @param path - The path to the file to touch
 * @returns An Effect that succeeds with void or fails with a FileSystem error
 */
const touch = Effect.fn("touch")(function*(path: string) {
  const time = new Date()
  const fs = yield* FileSystem.FileSystem

  yield* fs.utimes(path, time, time).pipe(
    Effect.catchTag("SystemError", (err) =>
      err.reason === "NotFound"
        ? fs.writeFileString(path, "")
        : Effect.fail(err))
  )
})

/**
 * Updates effect-app packages to their latest versions using npm-check-updates.
 * Runs both at workspace root and recursively in all workspace packages.
 */
const updateEffectAppPackages = Effect.fn("effa-cli.ue.updateEffectAppPackages")(function*() {
  const filters = ["effect-app", "@effect-app/*"]
  for (const filter of filters) {
    yield* runNodeCommand(`pnpm exec ncu -u --filter "${filter}"`)
    yield* runNodeCommand(`pnpm -r exec ncu -u --filter "${filter}"`)
  }
})()

/**
 * Updates Effect ecosystem packages to their latest versions using npm-check-updates.
 * Covers core Effect packages, Effect ecosystem packages, and Effect Atom packages.
 * Runs both at workspace root and recursively in all workspace packages.
 */
const updateEffectPackages = Effect.fn("effa-cli.ue.updateEffectPackages")(function*() {
  const effectFilters = ["effect", "@effect/*", "@effect-atom/*"]
  for (const filter of effectFilters) {
    yield* runNodeCommand(`pnpm exec ncu -u --filter "${filter}"`)
    yield* runNodeCommand(`pnpm -r exec ncu -u --filter "${filter}"`)
  }
})()

/**
 * Links local effect-app packages by adding file resolutions to package.json.
 * Updates the package.json with file: protocol paths pointing to the local effect-app-libs directory,
 * then runs pnpm install to apply the changes.
 *
 * @param effectAppLibsPath - Path to the local effect-app-libs directory
 * @returns An Effect that succeeds when linking is complete
 */
const linkPackages = Effect.fnUntraced(function*(effectAppLibsPath: string) {
  yield* Effect.log("Linking local effect-app packages...")

  const fs = yield* FileSystem.FileSystem

  const packageJsonPath = "./package.json"
  const packageJsonContent = yield* fs.readFileString(packageJsonPath)
  const pj = JSON.parse(packageJsonContent)

  const resolutions = {
    ...pj.resolutions,
    "@effect-app/eslint-codegen-model": "file:" + effectAppLibsPath + "/packages/eslint-codegen-model",
    "effect-app": "file:" + effectAppLibsPath + "/packages/effect-app",
    "@effect-app/infra": "file:" + effectAppLibsPath + "/packages/infra",
    "@effect-app/vue": "file:" + effectAppLibsPath + "/packages/vue",
    "@effect-app/vue-components": "file:" + effectAppLibsPath + "/packages/vue-components",
    ...packages.reduce((acc, p) => ({ ...acc, [p]: `file:${effectAppLibsPath}/node_modules/${p}` }), {})
  }

  pj.resolutions = resolutions

  yield* fs.writeFileString(packageJsonPath, JSON.stringify(pj, null, 2))
  yield* Effect.log("Updated package.json with local file resolutions")

  yield* runNodeCommand("pnpm i")

  yield* Effect.log("Successfully linked local packages")
})

/**
 * Unlinks local effect-app packages by removing file resolutions from package.json.
 * Filters out all effect-app related file: protocol resolutions from package.json,
 * then runs pnpm install to restore registry packages.
 *
 * @returns An Effect that succeeds when unlinking is complete
 */
const unlinkPackages = Effect.fnUntraced(function*() {
  yield* Effect.log("Unlinking local effect-app packages...")

  const fs = yield* FileSystem.FileSystem

  const packageJsonPath = "./package.json"
  const packageJsonContent = yield* fs.readFileString(packageJsonPath)
  const pj = JSON.parse(packageJsonContent)

  const filteredResolutions = Object.entries(pj.resolutions as Record<string, string>).reduce(
    (acc, [k, v]) => {
      if (k.startsWith("@effect-app/") || k === "effect-app" || packages.includes(k)) return acc
      acc[k] = v
      return acc
    },
    {} as Record<string, string>
  )

  pj.resolutions = filteredResolutions

  yield* fs.writeFileString(packageJsonPath, JSON.stringify(pj, null, 2))
  yield* Effect.log("Removed effect-app file resolutions from package.json")

  yield* runNodeCommand("pnpm i")
  yield* Effect.log("Successfully unlinked local packages")
})()

/**
 * Monitors controller files for changes and runs eslint on related controllers.ts/routes.ts files.
 * Watches for .controllers. files and triggers eslint fixes on parent directory's controller files.
 *
 * @param watchPath - The path to watch for controller changes
 * @param debug - Whether to enable debug logging
 * @returns An Effect that sets up controller file monitoring
 */
const monitorChildIndexes = Effect.fn("effa-cli.index-multi.monitorChildIndexes")(
  function*(watchPath: string, debug: boolean) {
    const fileSystem = yield* FileSystem.FileSystem

    if (debug) {
      yield* Effect.logInfo(`Starting controller monitoring for: ${watchPath}`)
    }

    const watchStream = fileSystem.watch(watchPath, { recursive: true })

    yield* watchStream.pipe(
      Stream.runForEach(
        Effect.fn("effa-cli.monitorChildIndexes.handleEvent")(function*(event) {
          const pathParts = event.path.split("/")
          const fileName = pathParts[pathParts.length - 1]
          const isController = fileName?.toLowerCase().includes(".controllers.")

          if (!isController) return

          let i = 1
          const reversedParts = pathParts.toReversed()

          while (i < reversedParts.length) {
            const candidateFiles = ["controllers.ts", "routes.ts"]
              .map((f) => [...pathParts.slice(0, pathParts.length - i), f].join("/"))

            const existingFiles: string[] = []
            for (const file of candidateFiles) {
              const exists = yield* fileSystem.exists(file)
              if (exists) existingFiles.push(file)
            }

            if (existingFiles.length > 0) {
              if (debug) {
                yield* Effect.logInfo(
                  `Controller change detected: ${event.path}, fixing files: ${existingFiles.join(", ")}`
                )
              }

              const eslintArgs = existingFiles.map((f) => `"../${f}"`).join(" ")
              yield* runNodeCommand(`cd api && pnpm eslint --fix ${eslintArgs}`)
              break
            }
            i++
          }
        })
      )
    )
  }
)

/**
 * Monitors a directory for changes and runs eslint on the specified index file.
 * Triggers eslint fixes when any file in the directory changes (except the index file itself).
 *
 * @param watchPath - The path to watch for changes
 * @param indexFile - The index file to run eslint on when changes occur
 * @param debug - Whether to enable debug logging
 * @returns An Effect that sets up root index monitoring
 */
const monitorRootIndexes = Effect.fn("effa-cli.index-multi.monitorRootIndexes")(
  function*(watchPath: string, indexFile: string, debug: boolean) {
    const fileSystem = yield* FileSystem.FileSystem

    if (debug) {
      yield* Effect.logInfo(`Starting root index monitoring for: ${watchPath} -> ${indexFile}`)
    }

    const watchStream = fileSystem.watch(watchPath)

    yield* watchStream.pipe(
      Stream.runForEach(
        Effect.fn("effa-cli.index-multi.monitorRootIndexes.handleEvent")(function*(event) {
          if (event.path.endsWith(indexFile)) return

          if (debug) {
            yield* Effect.logInfo(`Root change detected: ${event.path}, fixing: ${indexFile}`)
          }

          yield* runNodeCommand(`pnpm eslint --fix "${indexFile}"`)
        })
      )
    )
  }
)

/**
 * Sets up comprehensive index monitoring for a given path.
 * Combines both child controller monitoring and root index monitoring.
 *
 * @param watchPath - The path to monitor
 * @param debug - Whether to enable debug logging
 * @returns An Effect that sets up all index monitoring for the path
 */
const monitorIndexes = Effect.fn("effa-cli.index-multi.monitorIndexes")(function*(watchPath: string, debug: boolean) {
  const fileSystem = yield* FileSystem.FileSystem

  if (debug) {
    yield* Effect.logInfo(`Setting up index monitoring for path: ${watchPath}`)
  }

  const indexFile = watchPath + "/index.ts"

  const monitors = [monitorChildIndexes(watchPath, debug)]

  if (yield* fileSystem.exists(indexFile)) {
    monitors.push(monitorRootIndexes(watchPath, indexFile, debug))
  } else {
    yield* Effect.logInfo(`Index file ${indexFile} does not exist`)
  }

  if (debug) {
    yield* Effect.logInfo(`Starting ${monitors.length} monitor(s) for ${watchPath}`)
  }

  yield* Effect.all(monitors, { concurrency: monitors.length })
})

/**
 * Watches directories for file changes and updates tsconfig.json and vite.config.ts accordingly.
 * Monitors API resources and models directories for changes using Effect's native file watching.
 *
 * @returns An Effect that sets up file watching streams
 */
const watcher = Effect.fn("watch")(function*(debug: boolean) {
  yield* Effect.log("Watch API resources and models for changes")

  const dirs = ["../api/src/resources", "../api/src/models"]
  const viteConfigFile = "./vite.config.ts"
  const fileSystem = yield* FileSystem.FileSystem

  const viteConfigExists = yield* fileSystem.exists(viteConfigFile)

  if (debug) {
    yield* Effect.logInfo("watcher debug mode is enabled")
  }

  // Validate directories and filter out non-existing ones
  const existingDirs: string[] = []
  for (const dir of dirs) {
    const dirExists = yield* fileSystem.exists(dir)
    if (dirExists) {
      existingDirs.push(dir)
    } else {
      yield* Effect.logWarning(`Directory ${dir} does not exist - skipping`)
    }
  }

  if (existingDirs.length === 0) {
    return yield* Effect.logWarning("No directories to watch - exiting")
  }

  // Start watching all existing directories concurrently
  const watchStreams = existingDirs.map((dir) =>
    Effect.gen(function*() {
      if (debug) {
        yield* Effect.logInfo(`Starting to watch directory: ${dir}`)
      }

      const files: string[] = []
      const watchStream = fileSystem.watch(dir, { recursive: true })

      yield* watchStream.pipe(
        Stream.runForEach(
          Effect.fn("effa-cli.watch.handleEvent")(function*(event) {
            if (debug) {
              yield* Effect.logInfo(`File ${event._tag.toLowerCase()}: ${event.path}`)
            }

            // Touch tsconfig.json on any file change
            yield* touch("./tsconfig.json")
            if (debug) {
              yield* Effect.logInfo("Updated tsconfig.json")
            }

            // Touch vite config only on file updates (not creates/deletes)
            if (
              viteConfigExists
              && event._tag === "Update"
              && !files.includes(event.path)
            ) {
              yield* touch(viteConfigFile)
              if (debug) {
                yield* Effect.logInfo("Updated vite.config.ts")
              }
              files.push(event.path)
            }
          })
        )
      )
    })
  )

  // Run all watch streams concurrently
  yield* Effect.all(watchStreams, { concurrency: existingDirs.length })
})

/*
 * CLI
 */

const EffectAppLibsPath = Args
  .directory({
    exists: "yes",
    name: "effect-app-libs-path"
  })
  .pipe(
    Args.withDefault("../../effect-app/libs"),
    Args.withDescription("Path to the effect-app-libs directory")
  )

const link = Command
  .make(
    "link",
    { effectAppLibsPath: EffectAppLibsPath },
    Effect.fn("effa-cli.link")(function*({ effectAppLibsPath }) {
      return yield* linkPackages(effectAppLibsPath)
    })
  )
  .pipe(Command.withDescription("Link local effect-app packages using file resolutions"))

const unlink = Command
  .make(
    "unlink",
    {},
    Effect.fn("effa-cli.unlink")(function*({}) {
      return yield* unlinkPackages
    })
  )
  .pipe(Command.withDescription("Remove effect-app file resolutions and restore npm registry packages"))

const ue = Command
  .make(
    "ue",
    {},
    Effect.fn("effa-cli.ue")(function*({}) {
      yield* Effect.log("Update effect-app and/or effect packages")

      const prompted = yield* Prompt.select({
        choices: [
          {
            title: "effect-app",
            description: "Update only effect-app packages",
            value: "effect-app"
          },
          {
            title: "effect",
            description: "Update only effect packages",
            value: "effect"
          },
          {
            title: "both",
            description: "Update both effect-app and effect packages",
            value: "both"
          }
        ],
        message: "Select an option"
      })

      switch (prompted) {
        case "effect-app":
          return yield* updateEffectAppPackages.pipe(
            Effect.andThen(runNodeCommand("pnpm i"))
          )

        case "effect":
          return yield* updateEffectPackages.pipe(
            Effect.andThen(runNodeCommand("pnpm i"))
          )
        case "both":
          return yield* updateEffectPackages.pipe(
            Effect.andThen(updateEffectAppPackages),
            Effect.andThen(runNodeCommand("pnpm i"))
          )
      }
    })
  )
  .pipe(Command.withDescription("Update effect-app and/or effect packages"))

const DebugOption = Options.boolean("debug").pipe(
  Options.withAlias("d"),
  Options.withDescription("Enable debug logging")
)

const watch = Command
  .make(
    "watch",
    { debug: DebugOption },
    Effect.fn("effa-cli.watch")(function*({ debug }) {
      return yield* watcher(debug)
    })
  )
  .pipe(
    Command.withDescription(
      "Watch API resources and models for changes and update tsconfig.json and vite.config.ts accordingly"
    )
  )

const indexMulti = Command
  .make(
    "index-multi",
    { debug: DebugOption },
    Effect.fn("effa-cli.index-multi")(function*({ debug }) {
      yield* Effect.log("Starting multi-index monitoring")

      const dirs = ["./api/src"]
      const fileSystem = yield* FileSystem.FileSystem

      const existingDirs: string[] = []
      for (const dir of dirs) {
        const dirExists = yield* fileSystem.exists(dir)
        if (dirExists) {
          existingDirs.push(dir)
        } else {
          yield* Effect.logWarning(`Directory ${dir} does not exist - skipping`)
        }
      }

      if (existingDirs.length === 0) {
        return yield* Effect.logWarning("No directories to monitor - exiting")
      }

      const monitors = existingDirs.map((dir) => monitorIndexes(dir, debug))
      yield* Effect.all(monitors, { concurrency: monitors.length })
    })
  )
  .pipe(
    Command.withDescription(
      "Monitor multiple directories for index and controller file changes"
    )
  )

// Configure CLI
const cli = Command.run(
  Command
    .make("effa")
    .pipe(Command.withSubcommands([
      ue,
      link,
      unlink,
      watch,
      indexMulti
    ])),
  {
    name: "Effect-App CLI by jfet97 ❤️",
    version: "v1.0.0"
  }
)

cli(process.argv)
  .pipe(
    Effect.provide(NodeContext.layer),
    NodeRuntime.runMain
  )

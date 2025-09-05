/* eslint-disable no-constant-binary-expression */
/* eslint-disable no-empty-pattern */
// import necessary modules from the libraries
import { Args, Command, Options, Prompt } from "@effect/cli"
import { Command as NodeCommand, FileSystem, Path } from "@effect/platform"
import { NodeContext, NodeRuntime } from "@effect/platform-node"

import { type CommandExecutor } from "@effect/platform/CommandExecutor"
import { type PlatformError } from "@effect/platform/Error"
import { Effect, identity, Option, Stream, type Types } from "effect"
import { ExtractExportMappingsService } from "./extract.js"
import { packages } from "./shared.js"

Effect
  .fn("effa-cli")(function*() {
    const fs = yield* FileSystem.FileSystem
    const path = yield* Path.Path
    const extractExportMappings = yield* ExtractExportMappingsService

    yield* Effect.addFinalizer(() => Effect.logInfo(`CLI has finished executing`))

    /**
     * Executes a shell command using Node.js Command API with inherited stdio streams.
     * The command is run through the system shell (/bin/sh) for proper command parsing.
     *
     * @param cmd - The shell command to execute
     * @param cwd - Optional working directory to execute the command in
     * @returns An Effect that succeeds with the exit code or fails with a PlatformError
     */
    const runNodeCommand = (cmd: string, cwd?: string) =>
      NodeCommand
        .make("sh", "-c", cmd)
        .pipe(
          NodeCommand.stdout("inherit"),
          NodeCommand.stderr("inherit"),
          cwd ? NodeCommand.workingDirectory(cwd) : identity,
          NodeCommand.exitCode
        )

    /**
     * Executes a bash script file using Node.js Command API with inherited stdio streams.
     * The script file is executed directly through the shell (/bin/sh).
     *
     * @param file - The path to the bash script file to execute
     * @param cwd - Optional working directory to execute the script in
     * @returns An Effect that succeeds with the output or fails with a PlatformError
     */
    // const runBashFile = (file: string, cwd?: string) =>
    //   NodeCommand
    //     .make("sh", file)
    //     .pipe(
    //       NodeCommand.stdout("inherit"),
    //       NodeCommand.stderr("inherit"),
    //       cwd ? NodeCommand.workingDirectory(cwd) : identity,
    //       NodeCommand.string
    //     )

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
      yield* Effect.logInfo("Linking local effect-app packages...")

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
      yield* Effect.logInfo("Updated package.json with local file resolutions")

      yield* runNodeCommand("pnpm i")

      yield* Effect.logInfo("Successfully linked local packages")
    })

    /**
     * Unlinks local effect-app packages by removing file resolutions from package.json.
     * Filters out all effect-app related file: protocol resolutions from package.json,
     * then runs pnpm install to restore registry packages.
     *
     * @returns An Effect that succeeds when unlinking is complete
     */
    const unlinkPackages = Effect.fnUntraced(function*() {
      yield* Effect.logInfo("Unlinking local effect-app packages...")

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
      yield* Effect.logInfo("Removed effect-app file resolutions from package.json")

      yield* runNodeCommand("pnpm i")
      yield* Effect.logInfo("Successfully unlinked local packages")
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
      function*(watchPath: string) {
        yield* Effect.logInfo(`Starting controller monitoring for: ${watchPath}`)

        const watchStream = fs.watch(watchPath, { recursive: true })

        yield* watchStream
          .pipe(
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
                    const exists = yield* fs.exists(file)
                    if (exists) existingFiles.push(file)
                  }

                  if (existingFiles.length > 0) {
                    yield* Effect.logInfo(
                      `Controller change detected: ${event.path}, fixing files: ${existingFiles.join(", ")}`
                    )

                    const eslintArgs = existingFiles.map((f) => `"../${f}"`).join(" ")
                    yield* runNodeCommand(`cd api && pnpm eslint --fix ${eslintArgs}`)
                    break
                  }
                  i++
                }
              })
            )
          )
          .pipe(
            Effect.andThen(
              Effect.addFinalizer(() => Effect.logInfo(`Stopped monitoring child indexes in: ${watchPath}`))
            ),
            Effect.forkScoped
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
      function*(watchPath: string, indexFile: string) {
        yield* Effect.logInfo(`Starting root index monitoring for: ${watchPath} -> ${indexFile}`)

        const watchStream = fs.watch(watchPath)

        yield* watchStream
          .pipe(
            Stream.runForEach(
              Effect.fn("effa-cli.index-multi.monitorRootIndexes.handleEvent")(function*(event) {
                if (event.path.endsWith(indexFile)) return

                yield* Effect.logInfo(`Root change detected: ${event.path}, fixing: ${indexFile}`)

                yield* runNodeCommand(`pnpm eslint --fix "${indexFile}"`)
              })
            )
          )
          .pipe(
            Effect.andThen(
              Effect.addFinalizer(() =>
                Effect.logInfo(`Stopped monitoring root indexes in: ${watchPath} -> ${indexFile}`)
              )
            ),
            Effect.forkScoped
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
    const monitorIndexes = Effect.fn("effa-cli.index-multi.monitorIndexes")(
      function*(watchPath: string) {
        yield* Effect.logInfo(`Setting up index monitoring for path: ${watchPath}`)

        const indexFile = watchPath + "/index.ts"

        const monitors = [monitorChildIndexes(watchPath)]

        if (yield* fs.exists(indexFile)) {
          monitors.push(monitorRootIndexes(watchPath, indexFile))
        } else {
          yield* Effect.logWarning(`Index file ${indexFile} does not exist`)
        }

        yield* Effect.logInfo(`Starting ${monitors.length} monitor(s) for ${watchPath}`)

        yield* Effect.all(monitors, { concurrency: monitors.length })
      }
    )

    /**
     * Updates a package.json file with generated exports mappings for TypeScript modules.
     * Scans TypeScript source files and creates export entries that map module paths
     * to their compiled JavaScript and TypeScript declaration files.
     *
     * @param startDir - The starting directory path for resolving relative paths
     * @param p - The package directory path to process
     * @param levels - Optional depth limit for export filtering (0 = no limit)
     * @returns An Effect that succeeds when the package.json is updated
     */
    const packagejsonUpdater = Effect.fn("effa-cli.packagejsonUpdater")(
      function*(startDir: string, p: string, levels = 0) {
        yield* Effect.logInfo(`Generating exports for ${p}`)

        const exportMappings = yield* extractExportMappings(path.resolve(startDir, p))

        // if exportMappings is empty skip export generation
        if (exportMappings === "") {
          yield* Effect.logInfo(`No src directory found for ${p}, skipping export generation`)
          return
        }

        const sortedExportEntries = JSON.parse(
          `{ ${exportMappings} }`
        ) as Record<
          string,
          unknown
        >

        const filteredExportEntries = levels
          ? Object
            .keys(sortedExportEntries)
            // filter exports by directory depth - only include paths up to specified levels deep
            .filter((_) => _.split("/").length <= (levels + 1 /* `./` */))
            .reduce(
              (prev, cur) => ({ ...prev, [cur]: sortedExportEntries[cur] }),
              {} as Record<string, unknown>
            )
          : sortedExportEntries

        const packageExports = {
          ...((yield* fs.exists(p + "/src/index.ts"))
            && {
              ".": {
                "types": "./dist/index.d.ts",
                "default": "./dist/index.js"
              }
            }),
          ...Object
            .keys(filteredExportEntries)
            .reduce(
              (prev, cur) => ({
                ...prev,
                // exclude index files and internal modules from package exports:
                // - skip "./index" to avoid conflicts with the main "." export
                // - skip "/internal/" paths to keep internal modules private
                ...cur !== "./index" && !cur.includes("/internal/") && { [cur]: filteredExportEntries[cur] }
              }),
              {} as Record<string, unknown>
            )
        }

        const pkgJson = JSON.parse(yield* fs.readFileString(p + "/package.json", "utf-8"))
        pkgJson.exports = packageExports

        yield* Effect.logInfo(`Writing updated package.json for ${p}`)

        return yield* fs.writeFileString(
          p + "/package.json",
          JSON.stringify(pkgJson, null, 2)
        )
      }
    )

    /**
     * Monitors a directory for TypeScript file changes and automatically updates package.json exports.
     * Generates initial package.json exports, then watches the src directory for changes to regenerate exports.
     *
     * @param watchPath - The directory path containing the package.json and src to monitor
     * @param levels - Optional depth limit for export filtering (0 = no limit)
     * @returns An Effect that sets up package.json monitoring
     */
    const monitorPackageJson = Effect.fn("effa-cli.monitorPackageJson")(
      function*(startDir: string, watchPath: string, levels = 0) {
        yield* packagejsonUpdater(startDir, watchPath, levels)

        const srcPath = watchPath === "." ? "./src" : `${watchPath}/src`

        if (!(yield* fs.exists(srcPath))) {
          yield* Effect.logWarning(`Source directory ${srcPath} does not exist - skipping monitoring`)
          return
        }

        const watchStream = fs.watch(srcPath, { recursive: true })

        yield* watchStream.pipe(
          Stream.runForEach(
            Effect.fn("effa-cli.monitorPackageJson.handleEvent")(function*(_) {
              yield* packagejsonUpdater(startDir, watchPath, levels)
            })
          ),
          Effect.andThen(
            Effect.addFinalizer(() => Effect.logInfo(`Stopped monitoring package.json for: ${watchPath}`))
          ),
          Effect.forkScoped
        )
      }
    )

    /*
     * CLI
     */

    const WrapAsOption = Options.text("wrap").pipe(
      Options.withAlias("w"),
      Options.optional,
      Options.withDescription(
        "Wrap child bash command: the lifetime of the CLI command will be tied to the child process"
      )
    )

    // has prio over WrapAsOption
    const WrapAsArg = Args
      .text({
        name: "wrap"
      })
      .pipe(
        Args.atLeast(1),
        Args.optional,
        Args.withDescription(
          "Wrap child bash command: the lifetime of the CLI command will be tied to the child process"
        )
      )

    /**
     * Creates a command that automatically includes wrap functionality for executing child bash commands.
     * Combines both option-based (--wrap) and argument-based wrap parameters, giving priority to arguments.
     * If a wrap command is provided, it will be executed **after** the main command handler.
     *
     * @param name - The command name
     * @param config - The command configuration (options, args, etc.)
     * @param handler - The main command handler function
     * @param completionMessage - Optional message to log when the command completes
     * @returns A Command with integrated wrap functionality
     */
    const makeCommandWithWrap = <Name extends string, const Config extends Command.Command.Config, R, E>(
      name: Name,
      config: Config,
      handler: (_: Types.Simplify<Command.Command.ParseConfig<Config>>) => Effect.Effect<void, E, R>,
      completionMessage?: string
    ): Command.Command<
      Name,
      CommandExecutor | R,
      PlatformError | E,
      Types.Simplify<Command.Command.ParseConfig<Config>>
    > =>
      Command.make(
        name,
        { ...config, wo: WrapAsOption, wa: WrapAsArg },
        Effect.fn("effa-cli.withWrapHandler")(function*(_) {
          const { wa, wo, ...cfg } = _ as unknown as {
            wo: Option.Option<string>
            wa: Option.Option<[string, ...string[]]>
          } & Types.Simplify<Command.Command.ParseConfig<Config>>

          if (completionMessage) {
            yield* Effect.addFinalizer(() => Effect.logInfo(completionMessage))
          }

          const wrapOption = Option.orElse(wa, () => wo)

          yield* handler(cfg as any)

          if (Option.isSome(wrapOption)) {
            const val = Array.isArray(wrapOption.value)
              ? wrapOption.value.join(" ")
              : wrapOption.value

            yield* Effect.logInfo(`Spawning child command: ${val}`)
            yield* runNodeCommand(val)
          }

          return
        }, (_) => Effect.scoped(_))
      )

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
          yield* Effect.logInfo("Update effect-app and/or effect packages")

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

    const indexMulti = makeCommandWithWrap(
      "index-multi",
      {},
      Effect.fn("effa-cli.index-multi")(function*({}) {
        yield* Effect.logInfo("Starting multi-index monitoring")

        const dirs = ["./api/src"]

        const existingDirs: string[] = []
        for (const dir of dirs) {
          const dirExists = yield* fs.exists(dir)
          if (dirExists) {
            existingDirs.push(dir)
          } else {
            yield* Effect.logWarning(`Directory ${dir} does not exist - skipping`)
          }
        }

        const monitors = existingDirs.map((dir) => monitorIndexes(dir))
        yield* Effect.all(monitors, { concurrency: monitors.length })
      }),
      "Stopped multi-index monitoring"
    )
      .pipe(
        Command.withDescription(
          "Monitor multiple directories for index and controller file changes"
        )
      )

    const packagejson = makeCommandWithWrap(
      "packagejson",
      {},
      Effect.fn("effa-cli.packagejson")(function*({}) {
        // https://nodejs.org/api/path.html#pathresolvepaths
        const startDir = path.resolve()

        return yield* monitorPackageJson(startDir, ".")
      }),
      "Stopped monitoring root package.json exports"
    )
      .pipe(
        Command.withDescription("Generate and update root-level package.json exports mappings for TypeScript modules")
      )

    const packagejsonPackages = makeCommandWithWrap(
      "packagejson-packages",
      {},
      Effect.fn("effa-cli.packagejson-packages")(function*({}) {
        // https://nodejs.org/api/path.html#pathresolvepaths
        const startDir = path.resolve()

        const packagesDir = path.join(startDir, "packages")

        const packagesExists = yield* fs.exists(packagesDir)
        if (!packagesExists) {
          return yield* Effect.logWarning("No packages directory found")
        }

        // get all package directories
        const packageDirs = yield* fs.readDirectory(packagesDir)

        const validPackages: string[] = []

        // filter packages that have package.json and src directory
        for (const packageName of packageDirs) {
          const packagePath = path.join(packagesDir, packageName)
          const packageJsonExists = yield* fs.exists(path.join(packagePath, "package.json"))
          const srcExists = yield* fs.exists(path.join(packagePath, "src"))

          const shouldExclude = false
            || packageName.endsWith("eslint-codegen-model")
            || packageName.endsWith("vue-components")

          if (packageJsonExists && srcExists && !shouldExclude) {
            validPackages.push(packagePath)
          }
        }

        yield* Effect.logInfo(`Found ${validPackages.length} packages to update`)

        // update each package sequentially
        yield* Effect.all(
          validPackages.map(
            Effect.fnUntraced(function*(packagePath) {
              const relativePackagePath = path.relative(startDir, packagePath)
              yield* Effect.logInfo(`Updating ${relativePackagePath}`)
              return yield* monitorPackageJson(startDir, relativePackagePath)
            })
          )
        )

        yield* Effect.logInfo("All packages updated successfully")
      }),
      "Stopped monitoring package.json exports for all packages"
    )
      .pipe(
        Command.withDescription("Generate and update package.json exports mappings for all packages in monorepo")
      )

    const wiki = Command
      .make(
        "wiki",
        {
          sync: Args.text({ name: "action" }).pipe(
            Args.withDefault("sync"),
            Args.withDescription("Wiki action to perform (default: sync)")
          )
        },
        Effect.fn("effa-cli.wiki")(function*({ sync: action }) {
          if (action !== "sync") {
            return yield* Effect.fail(`Unknown wiki action: ${action}. Available actions: sync`)
          }

          yield* Effect.logInfo("Initializing/updating git submodule for documentation...")
          return yield* runNodeCommand("git submodule update --init --recursive doc")
        })
      )
      .pipe(Command.withDescription(
        `Manage the documentation wiki git submodule.

Available actions:
- sync: Initialize and update the documentation submodule (default)`
      ))

    const DryRunOption = Options.boolean("dry-run").pipe(
      Options.withDescription("Show what would be done without making changes")
    )

    const PruneStoreOption = Options.boolean("store-prune").pipe(
      Options.withDescription("Prune the package manager store")
    )

    const nuke = Command
      .make(
        "nuke",
        { dryRun: DryRunOption, storePrune: PruneStoreOption },
        Effect.fn("effa-cli.nuke")(function*({ dryRun, storePrune }) {
          yield* Effect.logInfo(dryRun ? "Performing dry run cleanup..." : "Performing nuclear cleanup...")

          if (dryRun) {
            yield* runNodeCommand(
              "find . -depth \\( -type d \\( -name 'node_modules' -o -name '.nuxt' -o -name 'dist' -o -name '.output' -o -name '.nitro' -o -name '.cache' -o -name 'test-results' -o -name 'test-out' -o -name 'coverage' \\) -print \\) -o \\( -type f \\( -name '*.log' -o -name '*.tsbuildinfo' \\) -print \\)"
            )
          } else {
            yield* runNodeCommand(
              "find . -depth \\( -type d \\( -name 'node_modules' -o -name '.nuxt' -o -name 'dist' -o -name '.output' -o -name '.nitro' -o -name '.cache' -o -name 'test-results' -o -name 'test-out' -o -name 'coverage' \\) -exec rm -rf -- {} + \\) -o \\( -type f \\( -name '*.log' -o -name '*.tsbuildinfo' \\) -delete \\)"
            )

            if (storePrune) {
              yield* runNodeCommand(
                "pnpm store prune"
              )
            }
          }

          yield* Effect.logInfo("Cleanup operation completed")
        })
      )
      .pipe(Command.withDescription("Nuclear cleanup command: removes all generated files and cleans the workspace"))

    // configure CLI
    const cli = Command.run(
      Command
        .make("effa")
        .pipe(Command.withSubcommands([
          ue,
          link,
          unlink,
          indexMulti,
          packagejson,
          packagejsonPackages,
          wiki,
          nuke
        ])),
      {
        name: "Effect-App CLI by jfet97 ❤️",
        version: "v1.0.0"
      }
    )

    return yield* cli(process.argv)
  })()
  .pipe(
    Effect.scoped,
    Effect.provide(NodeContext.layer),
    NodeRuntime.runMain
  )

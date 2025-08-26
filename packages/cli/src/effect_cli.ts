/* eslint-disable no-empty-pattern */
// Import necessary modules from the libraries
import { Args, Command, Prompt } from "@effect/cli"
import { Command as NodeCommand, FileSystem } from "@effect/platform"
import { NodeContext, NodeRuntime } from "@effect/platform-node"
import { Effect } from "effect"
import { packages } from "./shared.js"

const runNodeCommand = (cmd: string) =>
  NodeCommand
    .make("sh", "-c", cmd)
    .pipe(
      NodeCommand.stdout("inherit"),
      NodeCommand.stderr("inherit"),
      NodeCommand.exitCode
    )

const updateEffectAppPackages = Effect.fn("effa-cli.ue.updateEffectAppPackages")(function*() {
  const filters = ["effect-app", "@effect-app/*"]
  for (const filter of filters) {
    yield* runNodeCommand(`pnpm exec ncu -u --filter "${filter}"`)
    yield* runNodeCommand(`pnpm -r exec ncu -u --filter "${filter}"`)
  }
})()

const updateEffectPackages = Effect.fn("effa-cli.ue.updateEffectPackages")(function*() {
  const effectFilters = ["effect", "@effect/*", "@effect-atom/*"]
  for (const filter of effectFilters) {
    yield* runNodeCommand(`pnpm exec ncu -u --filter "${filter}"`)
    yield* runNodeCommand(`pnpm -r exec ncu -u --filter "${filter}"`)
  }
})()

const EffectAppLibsPath = Args
  .directory({
    exists: "yes",
    name: "effect-app-libs-path"
  })
  .pipe(
    Args.withDefault("../../effect-app/libs"),
    Args.withDescription("Path to the effect-app-libs directory")
  )

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

const link = Command
  .make(
    "link",
    { effectAppLibsPath: EffectAppLibsPath },
    Effect.fn("effa-cli.link")(function*({ effectAppLibsPath }) {
      return yield* linkPackages(effectAppLibsPath)
    })
  )
  .pipe(Command.withDescription("Link local effect-app packages using file resolutions"))

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

const command = Command.make("effa").pipe(Command.withSubcommands([ue, link]))

// Configure and initialize the CLI application
const cli = Command.run(command, {
  name: "Effect-App CLI by jfet97 ❤️",
  version: "v1.0.0"
})

// Prepare and run the CLI application
cli(process.argv).pipe(Effect.provide(NodeContext.layer), NodeRuntime.runMain)

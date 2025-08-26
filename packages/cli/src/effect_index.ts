/* eslint-disable no-empty-pattern */
// Import necessary modules from the libraries
import { Command, Prompt } from "@effect/cli"
import { Command as NodeCommand } from "@effect/platform"
import { NodeContext, NodeRuntime } from "@effect/platform-node"
import { Effect } from "effect"

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

const command = Command.make("effa").pipe(Command.withSubcommands([ue]))

// Configure and initialize the CLI application
const cli = Command.run(command, {
  name: "Effect-App CLI by jfet97 ❤️",
  version: "v1.0.0"
})

// Prepare and run the CLI application
cli(process.argv).pipe(Effect.provide(NodeContext.layer), NodeRuntime.runMain)

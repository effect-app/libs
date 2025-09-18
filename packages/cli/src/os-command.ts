/* eslint-disable no-constant-binary-expression */
/* eslint-disable no-empty-pattern */
// import necessary modules from the libraries
import { Command } from "@effect/platform"

import { CommandExecutor } from "@effect/platform/CommandExecutor"
import { Effect, identity } from "effect"

/**
 * Service for executing shell commands using the Effect platform's Command API.
 * Provides methods to run shell commands with different output handling strategies.
 * All commands are executed through the system shell (/bin/sh) for proper command parsing.
 */
// @effect-diagnostics-next-line missingEffectServiceDependency:off
export class RunCommandService extends Effect.Service<RunCommandService>()("RunCommandService", {
  dependencies: [],
  effect: Effect.gen(function*() {
    // will be provided by the main CLI pipeline setup
    const commandExecutor = yield* CommandExecutor

    /**
     * Executes a shell command using Command API with inherited stdio streams.
     * The command is rn through the system shell (/bin/sh) for proper command parsing.
     *
     * @param cmd - The shell command to execute
     * @param cwd - Optional working directory to execute the command in
     * @returns An Effect that succeeds with the exit code or fails with a PlatformError
     */
    const runGetExitCode = (cmd: string, cwd?: string) =>
      Command
        .make("sh", "-c", cmd)
        .pipe(
          Command.stdout("inherit"),
          Command.stderr("inherit"),
          cwd ? Command.workingDirectory(cwd) : identity,
          Command.exitCode,
          Effect.provideService(CommandExecutor, commandExecutor)
        )

    /**
     * Executes a shell command using Command API and returns the output as a string.
     * The command is run through the system shell (/bin/sh) for proper command parsing.
     *
     * @param cmd - The shell command to execute
     * @param cwd - Optional working directory to execute the command in
     * @returns An Effect that succeeds with the command's stdout output as string or fails with a PlatformError
     */
    const runGetString = (cmd: string, cwd?: string) =>
      Command
        .make("sh", "-c", cmd)
        .pipe(
          cwd ? Command.workingDirectory(cwd) : identity,
          Command.string,
          Effect.provideService(CommandExecutor, commandExecutor)
        )

    return {
      runGetExitCode,
      runGetString
    }
  })
}) {
}

/* eslint-disable no-constant-binary-expression */
/* eslint-disable no-empty-pattern */
import { Context, Effect, Layer } from "effect"
import { ChildProcess } from "effect/unstable/process"
import { ChildProcessSpawner } from "effect/unstable/process/ChildProcessSpawner"

/**
 * Service for executing shell commands using the Effect platform's Command API.
 * Provides methods to run shell commands with different output handling strategies.
 * All commands are executed through the system shell (/bin/sh) for proper command parsing.
 */
export class RunCommandService extends Context.Service<RunCommandService>()("RunCommandService", {
  make: Effect.gen(function*() {
    // will be provided by the main CLI pipeline setup
    const spawner = yield* ChildProcessSpawner

    /**
     * Executes a shell command using Command API with inherited stdio streams.
     * The command is run through the system shell (/bin/sh) for proper command parsing.
     *
     * @param cmd - The shell command to execute
     * @param cwd - Optional working directory to execute the command in
     * @returns An Effect that succeeds with the exit code or fails with a PlatformError
     */
    const runGetExitCode = (cmd: string, cwd?: string) =>
      spawner
        .exitCode(
          ChildProcess.make("sh", ["-c", cmd], { stdout: "inherit", stderr: "inherit", cwd })
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
      spawner
        .string(
          ChildProcess.make("sh", ["-c", cmd], { cwd })
        )

    return {
      runGetExitCode,
      runGetString
    }
  })
}) {
  static Default = Layer.effect(this, this.make)
}

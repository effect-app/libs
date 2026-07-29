import { Effect, Layer } from "effect"
import { describe, expect, it } from "vitest"
import { GHGistService } from "../src/gist.js"
import { RunCommandService } from "../src/os-command.js"

describe("GHGistService.loadGistCache", () => {
  it("loads the company cache from the configured Gist ID without discovery", async () => {
    const commands: Array<string> = []
    const runCommand = Layer.succeed(RunCommandService)({
      runGetExitCode: (command) => {
        commands.push(command)
        return Effect.die(`Unexpected command: ${command}`)
      },
      runGetString: (command) => {
        commands.push(command)

        switch (command) {
          case "gh gist view configured-cache-id --files":
            return Effect.succeed("effa-gist.cache\nmako.json\n")
          case "gh gist view configured-cache-id -f \"mako.json\"":
            return Effect.succeed("[{\"name\":\"mako\",\"id\":\"content-gist-id\"}]")
          default:
            return Effect.die(`Unexpected command: ${command}`)
        }
      }
    })

    const cache = await Effect.runPromise(
      Effect
        .gen(function*() {
          const gh = yield* GHGistService
          return yield* gh.loadGistCache("configured-cache-id", "mako")
        })
        .pipe(
          Effect.provide(GHGistService.DefaultWithoutDependencies),
          Effect.provide(runCommand)
        )
    )

    expect(cache.gist_id).toBe("configured-cache-id")
    expect(cache.company).toBe("mako")
    expect(cache.entries.map(({ id, name }) => ({ id, name }))).toEqual([
      { id: "content-gist-id", name: "mako" }
    ])
    expect(commands).toEqual([
      "gh gist view configured-cache-id --files",
      "gh gist view configured-cache-id -f \"mako.json\""
    ])
  })

  it("creates a missing company cache file once without retrying", async () => {
    const commands: Array<string> = []
    const runCommand = Layer.succeed(RunCommandService)({
      runGetExitCode: (command) => {
        commands.push(command)
        return Effect.die(`Unexpected command: ${command}`)
      },
      runGetString: (command) => {
        commands.push(command)

        switch (command) {
          case "gh gist view configured-cache-id --files":
            return Effect.succeed("effa-gist.cache\n")
          case "echo \"[]\" | gh gist edit configured-cache-id -a mako.json -":
            return Effect.succeed("")
          default:
            return Effect.die(`Unexpected command: ${command}`)
        }
      }
    })

    const cache = await Effect.runPromise(
      Effect
        .gen(function*() {
          const gh = yield* GHGistService
          return yield* gh.loadGistCache("configured-cache-id", "mako")
        })
        .pipe(
          Effect.provide(GHGistService.DefaultWithoutDependencies),
          Effect.provide(runCommand)
        )
    )

    expect(cache.gist_id).toBe("configured-cache-id")
    expect(cache.company).toBe("mako")
    expect(cache.entries).toEqual([])
    expect(commands).toEqual([
      "gh gist view configured-cache-id --files",
      "echo \"[]\" | gh gist edit configured-cache-id -a mako.json -"
    ])
  })
})

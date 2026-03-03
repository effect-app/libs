import { describe, expect, it } from "vitest"
import { patchArgvForWrapCommands } from "../src/argv-patch.js"

describe("patchArgvForWrapCommands", () => {
  const make = (...args: Array<string>) => ["node", "effect-app-cli", ...args]

  describe("inserts -- for wrap-enabled subcommands", () => {
    it("index-multi with tsc --build", () => {
      const argv = make("index-multi", "tsc", "--build")
      patchArgvForWrapCommands(argv)
      expect(argv).toEqual(make("index-multi", "--", "tsc", "--build"))
    })

    it("packagejson with tsc --build and tsconfig path", () => {
      const argv = make("packagejson", "tsc", "--build", "./tsconfig.src.json")
      patchArgvForWrapCommands(argv)
      expect(argv).toEqual(make("packagejson", "--", "tsc", "--build", "./tsconfig.src.json"))
    })

    it("packagejson-packages with pnpm check", () => {
      const argv = make("packagejson-packages", "pnpm", "check")
      patchArgvForWrapCommands(argv)
      expect(argv).toEqual(make("packagejson-packages", "--", "pnpm", "check"))
    })

    it("wrap args without flags", () => {
      const argv = make("packagejson", "pnpm", "check")
      patchArgvForWrapCommands(argv)
      expect(argv).toEqual(make("packagejson", "--", "pnpm", "check"))
    })

    it("single wrap arg", () => {
      const argv = make("index-multi", "tsc")
      patchArgvForWrapCommands(argv)
      expect(argv).toEqual(make("index-multi", "--", "tsc"))
    })

    it("wrap arg with multiple --flags", () => {
      const argv = make("index-multi", "tsc", "--build", "--watch", "--verbose")
      patchArgvForWrapCommands(argv)
      expect(argv).toEqual(make("index-multi", "--", "tsc", "--build", "--watch", "--verbose"))
    })

    it("wrap arg with short flags", () => {
      const argv = make("packagejson", "pnpm", "-r", "check")
      patchArgvForWrapCommands(argv)
      expect(argv).toEqual(make("packagejson", "--", "pnpm", "-r", "check"))
    })

    it("wrap arg with --flag=value syntax", () => {
      const argv = make("index-multi", "tsc", "--build=./tsconfig.json")
      patchArgvForWrapCommands(argv)
      expect(argv).toEqual(make("index-multi", "--", "tsc", "--build=./tsconfig.json"))
    })
  })

  describe("does not insert -- when already present", () => {
    it("-- immediately after subcommand", () => {
      const argv = make("index-multi", "--", "tsc", "--build")
      patchArgvForWrapCommands(argv)
      expect(argv).toEqual(make("index-multi", "--", "tsc", "--build"))
    })

    it("-- somewhere later in argv", () => {
      const argv = make("index-multi", "tsc", "--", "--build")
      patchArgvForWrapCommands(argv)
      expect(argv).toEqual(make("index-multi", "tsc", "--", "--build"))
    })
  })

  describe("does nothing for non-wrap subcommands", () => {
    it("nuke with flags", () => {
      const argv = make("nuke", "--dry-run")
      patchArgvForWrapCommands(argv)
      expect(argv).toEqual(make("nuke", "--dry-run"))
    })

    it("gist with --config flag", () => {
      const argv = make("gist", "--config", "gists.yaml")
      patchArgvForWrapCommands(argv)
      expect(argv).toEqual(make("gist", "--config", "gists.yaml"))
    })

    it("ue", () => {
      const argv = make("ue")
      patchArgvForWrapCommands(argv)
      expect(argv).toEqual(make("ue"))
    })

    it("link with path arg", () => {
      const argv = make("link", "../../effect-app/libs")
      patchArgvForWrapCommands(argv)
      expect(argv).toEqual(make("link", "../../effect-app/libs"))
    })

    it("unrecognized command", () => {
      const argv = make("unknown", "tsc", "--build")
      patchArgvForWrapCommands(argv)
      expect(argv).toEqual(make("unknown", "tsc", "--build"))
    })
  })

  describe("edge cases", () => {
    it("argv with only node and script (no subcommand)", () => {
      const argv = ["node", "effect-app-cli"]
      patchArgvForWrapCommands(argv)
      expect(argv).toEqual(["node", "effect-app-cli"])
    })

    it("subcommand with no trailing args", () => {
      const argv = make("index-multi")
      patchArgvForWrapCommands(argv)
      expect(argv).toEqual(make("index-multi"))
    })

    it("empty argv", () => {
      const argv: Array<string> = []
      patchArgvForWrapCommands(argv)
      expect(argv).toEqual([])
    })

    it("single element argv", () => {
      const argv = ["node"]
      patchArgvForWrapCommands(argv)
      expect(argv).toEqual(["node"])
    })

    it("wrap subcommand name found at later position still triggers patch", () => {
      const argv = make("nuke", "index-multi", "--build")
      patchArgvForWrapCommands(argv)
      // index-multi at position 3 is still >= 2, so it matches
      expect(argv).toEqual(make("nuke", "index-multi", "--", "--build"))
    })

    it("mutates the original array", () => {
      const argv = make("index-multi", "tsc", "--build")
      const ref = argv
      patchArgvForWrapCommands(argv)
      expect(ref).toBe(argv)
      expect(ref).toEqual(make("index-multi", "--", "tsc", "--build"))
    })

    it("different node/script paths", () => {
      const argv = ["/usr/local/bin/node", "/home/user/.npm/bin/effa", "packagejson", "pnpm", "check"]
      patchArgvForWrapCommands(argv)
      expect(argv).toEqual(["/usr/local/bin/node", "/home/user/.npm/bin/effa", "packagejson", "--", "pnpm", "check"])
    })
  })
})

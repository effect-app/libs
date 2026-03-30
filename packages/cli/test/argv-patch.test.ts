import { execFileSync } from "node:child_process"
import path from "node:path"
import url from "node:url"
import { describe, expect, it } from "vitest"
import { patchArgvForWrapCommands } from "../src/argv-patch.js"

describe("patchArgvForWrapCommands", () => {
  const make = (...args: Array<string>) => ["node", "effect-app-cli", ...args]

  describe("joins wrap args into a single element", () => {
    it("index-multi with tsc --build", () => {
      const argv = make("index-multi", "tsc", "--build")
      patchArgvForWrapCommands(argv)
      expect(argv).toEqual(make("index-multi", "tsc --build"))
    })

    it("packagejson with tsc --build and tsconfig path", () => {
      const argv = make("packagejson", "tsc", "--build", "./tsconfig.src.json")
      patchArgvForWrapCommands(argv)
      expect(argv).toEqual(make("packagejson", "tsc --build ./tsconfig.src.json"))
    })

    it("packagejson-packages with pnpm check", () => {
      const argv = make("packagejson-packages", "pnpm", "check")
      patchArgvForWrapCommands(argv)
      expect(argv).toEqual(make("packagejson-packages", "pnpm check"))
    })

    it("single wrap arg stays as-is", () => {
      const argv = make("index-multi", "tsc")
      patchArgvForWrapCommands(argv)
      expect(argv).toEqual(make("index-multi", "tsc"))
    })

    it("wrap args with multiple --flags", () => {
      const argv = make("index-multi", "tsc", "--build", "--watch", "--verbose")
      patchArgvForWrapCommands(argv)
      expect(argv).toEqual(make("index-multi", "tsc --build --watch --verbose"))
    })

    it("wrap args with short flags", () => {
      const argv = make("packagejson", "pnpm", "-r", "check")
      patchArgvForWrapCommands(argv)
      expect(argv).toEqual(make("packagejson", "pnpm -r check"))
    })

    it("wrap args with --flag=value syntax", () => {
      const argv = make("index-multi", "tsc", "--build=./tsconfig.json")
      patchArgvForWrapCommands(argv)
      expect(argv).toEqual(make("index-multi", "tsc --build=./tsconfig.json"))
    })

    it("wrap args with --flag=\"quoted value\" syntax", () => {
      const argv = make("index-multi", "tsc", "--outDir=\"dist/build\"")
      patchArgvForWrapCommands(argv)
      expect(argv).toEqual(make("index-multi", "tsc --outDir=\"dist/build\""))
    })

    it("wrap args with mixed quoted and unquoted flags", () => {
      const argv = make("packagejson", "cmd", "--x=\"abc\"", "--y", "plain")
      patchArgvForWrapCommands(argv)
      expect(argv).toEqual(make("packagejson", "cmd --x=\"abc\" --y plain"))
    })

    it("wrap args with single-quoted value in flag", () => {
      const argv = make("index-multi", "cmd", "--config='my config.json'")
      patchArgvForWrapCommands(argv)
      expect(argv).toEqual(make("index-multi", "cmd --config='my config.json'"))
    })

    it("wrap args with spaces inside quoted flag value", () => {
      const argv = make("packagejson-packages", "cmd", "--msg=\"hello world\"", "--verbose")
      patchArgvForWrapCommands(argv)
      expect(argv).toEqual(make("packagejson-packages", "cmd --msg=\"hello world\" --verbose"))
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
    it("no subcommand", () => {
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

    it("mutates the original array", () => {
      const argv = make("index-multi", "tsc", "--build")
      const ref = argv
      patchArgvForWrapCommands(argv)
      expect(ref).toBe(argv)
      expect(ref).toEqual(make("index-multi", "tsc --build"))
    })

    it("different node/script paths", () => {
      const argv = ["/usr/local/bin/node", "/home/user/.npm/bin/effa", "packagejson", "pnpm", "check"]
      patchArgvForWrapCommands(argv)
      expect(argv).toEqual(["/usr/local/bin/node", "/home/user/.npm/bin/effa", "packagejson", "pnpm check"])
    })
  })
})

describe.skip("e2e: CLI spawns wrap command correctly", () => {
  const binPath = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), "../bin.js")

  const run = (...args: Array<string>) =>
    execFileSync("node", [binPath, ...args], {
      encoding: "utf-8",
      timeout: 10_000,
      env: { ...process.env, NO_COLOR: "1" }
    })

  it("packagejson spawns 'echo hello' and captures output", () => {
    const out = run("packagejson", "echo", "hello")
    expect(out).toContain("Spawning child command: echo hello")
    expect(out).toContain("hello")
  })

  it("packagejson spawns command with --flags without quoting", () => {
    const out = run("packagejson", "echo", "--build-test", "extra")
    expect(out).toContain("Spawning child command: echo --build-test extra")
    expect(out).toContain("--build-test extra")
  })

  it("packagejson with single quoted arg still works", () => {
    const out = run("packagejson", "echo from-quoted")
    expect(out).toContain("Spawning child command: echo from-quoted")
    expect(out).toContain("from-quoted")
  })

  it("propagates non-zero exit code", () => {
    try {
      run("packagejson", "exit 42")
      expect.unreachable("should have thrown")
    } catch (e: any) {
      expect(e.status).toBe(42)
    }
  })

  it("index-multi spawns wrap command with --flags", () => {
    const out = run("index-multi", "echo", "--build", "done")
    expect(out).toContain("Spawning child command: echo --build done")
    expect(out).toContain("--build done")
  })

  it("packagejson spawns command with --flag=\"value\" syntax", () => {
    const out = run("packagejson", "echo", "--x=\"abc\"", "--y")
    expect(out).toContain("Spawning child command: echo --x=\"abc\" --y")
  })
})

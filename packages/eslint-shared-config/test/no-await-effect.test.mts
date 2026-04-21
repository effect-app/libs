import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { ESLint } from "eslint"
import path from "node:path"
import fs from "node:fs"
import os from "node:os"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const fixtureDir = path.resolve(__dirname, "_fixture")

function setup() {
  fs.mkdirSync(fixtureDir, { recursive: true })
  // tsconfig that includes fixture files and can resolve `effect`
  fs.writeFileSync(
    path.join(fixtureDir, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        strict: true,
        target: "ESNext",
        module: "ESNext",
        moduleResolution: "bundler",
        skipLibCheck: true
      },
      include: ["./*.ts"]
    })
  )
}

function cleanup() {
  fs.rmSync(fixtureDir, { recursive: true, force: true })
}

async function lintCode(code: string): Promise<ESLint.LintResult[]> {
  const filePath = path.join(fixtureDir, "test-file.ts")
  fs.writeFileSync(filePath, code)

  const eslint = new ESLint({
    overrideConfigFile: true,
    overrideConfig: [
      {
        files: ["**/*.ts"],
        languageOptions: {
          parser: await import("@typescript-eslint/parser").then((m) => m.default ?? m),
          parserOptions: {
            projectService: true,
            tsconfigRootDir: fixtureDir
          }
        },
        plugins: {
          "@effect-app": (await import("../src/plugin-effect-app.mjs")).default
        },
        rules: {
          "@effect-app/no-await-effect": "error"
        }
      }
    ],
    cwd: fixtureDir
  })

  return eslint.lintFiles([filePath])
}

function getErrors(results: ESLint.LintResult[]) {
  return results.flatMap((r) => r.messages.filter((m) => m.ruleId === "@effect-app/no-await-effect"))
}

describe("no-await-effect", () => {
  beforeAll(setup)
  afterAll(cleanup)

  it("reports error when awaiting Effect.succeed", async () => {
    const results = await lintCode(`
import { Effect } from "effect"
async function bad() {
  return await Effect.succeed(1)
}
`)
    const errors = getErrors(results)
    expect(errors).toHaveLength(1)
    expect(errors[0]!.message).toContain("Effect")
  })

  it("reports error when awaiting Option.some", async () => {
    const results = await lintCode(`
import { Option } from "effect"
async function bad() {
  return await Option.some(1)
}
`)
    const errors = getErrors(results)
    expect(errors).toHaveLength(1)
    expect(errors[0]!.message).toContain("Option")
  })

  it("reports error when awaiting Effect.gen", async () => {
    const results = await lintCode(`
import { Effect } from "effect"
async function bad() {
  return await Effect.gen(function*() { return 1 })
}
`)
    const errors = getErrors(results)
    expect(errors).toHaveLength(1)
    expect(errors[0]!.message).toContain("Effect")
  })

  it("does not report error when awaiting a Promise", async () => {
    const results = await lintCode(`
async function ok() {
  return await Promise.resolve(1)
}
`)
    const errors = getErrors(results)
    expect(errors).toHaveLength(0)
  })

  it("does not report error when awaiting a fetch call", async () => {
    const results = await lintCode(`
async function ok() {
  return await fetch("http://example.com")
}
`)
    const errors = getErrors(results)
    expect(errors).toHaveLength(0)
  })

  it("reports error when assigning awaited Effect to a variable", async () => {
    const results = await lintCode(`
import { Effect } from "effect"
async function bad() {
  const result = await Effect.succeed("hello")
  console.log(result)
}
`)
    const errors = getErrors(results)
    expect(errors).toHaveLength(1)
    expect(errors[0]!.message).toContain("Effect")
  })

  it("reports error when assigning awaited Option to a variable", async () => {
    const results = await lintCode(`
import { Option } from "effect"
async function bad() {
  const val = await Option.some(42)
  console.log(val)
}
`)
    const errors = getErrors(results)
    expect(errors).toHaveLength(1)
    expect(errors[0]!.message).toContain("Option")
  })

  it("reports error when awaiting Effect typed variable", async () => {
    const results = await lintCode(`
import { Effect } from "effect"
async function bad() {
  const eff = Effect.succeed(1)
  const result = await eff
  console.log(result)
}
`)
    const errors = getErrors(results)
    expect(errors).toHaveLength(1)
    expect(errors[0]!.message).toContain("Effect")
  })

  it("reports error when awaiting Option typed variable", async () => {
    const results = await lintCode(`
import { Option } from "effect"
async function bad() {
  const opt = Option.some("x")
  const result = await opt
  console.log(result)
}
`)
    const errors = getErrors(results)
    expect(errors).toHaveLength(1)
    expect(errors[0]!.message).toContain("Option")
  })

  it("reports error when awaiting Effect passed as function parameter", async () => {
    const results = await lintCode(`
import { Effect } from "effect"
async function run(eff: Effect.Effect<number>) {
  const result = await eff
  return result
}
`)
    const errors = getErrors(results)
    expect(errors).toHaveLength(1)
    expect(errors[0]!.message).toContain("Effect")
  })

  it("does not report error when assigning awaited Promise to a variable", async () => {
    const results = await lintCode(`
async function ok() {
  const result = await Promise.resolve(42)
  console.log(result)
}
`)
    const errors = getErrors(results)
    expect(errors).toHaveLength(0)
  })
})

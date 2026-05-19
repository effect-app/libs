#!/usr/bin/env node
import * as fs from "node:fs"
import * as path from "node:path"

import glob from "glob"

import { applyDefaults, blockRe, type CodegenDefaults, indentBlock, normaliseGeneratedContent, parseBlockOptions, renderPreset, trimTrailingNewline } from "./shared/codegen-block.js"

const CONFIG_FILENAMES = ["codegen.config.json"]

function loadConfig(cwd: string, explicit?: string): CodegenDefaults | undefined {
  const candidates = explicit ? [path.resolve(cwd, explicit)] : CONFIG_FILENAMES.map((f) => path.join(cwd, f))
  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      const parsed = JSON.parse(fs.readFileSync(candidate, "utf8"))
      return parsed as CodegenDefaults
    }
  }
  if (explicit) {
    throw new Error(`Config not found: ${explicit}`)
  }
  return undefined
}

function updateFile(filePath: string, source: string, defaults?: CodegenDefaults): boolean {
  let changed = false

  const next = source.replace(
    blockRe,
    (_match, indent: string, rawOptions: string, body: string, endIndent: string) => {
      const options = applyDefaults(parseBlockOptions(rawOptions), defaults)
      const existingContent = trimTrailingNewline(body)
      const generatedContent = trimTrailingNewline(
        normaliseGeneratedContent(
          options,
          filePath,
          renderPreset(options, { filename: filePath, existingContent }, source)
        )
      )

      const nextBody = generatedContent.length > 0 ? `${indentBlock(generatedContent, indent)}\n` : ""
      const replacement = `${indent}// codegen:start ${rawOptions}\n${nextBody}${endIndent}// codegen:end`

      if (replacement !== _match) {
        changed = true
      }

      return replacement
    }
  )

  if (next !== source) {
    fs.writeFileSync(filePath, next)
  }

  return changed
}

function parseArgs(args: ReadonlyArray<string>): { files: Array<string>; help: boolean; config?: string } {
  const files: Array<string> = []
  let config: string | undefined

  for (let index = 0; index < args.length; index++) {
    const part = args[index]!
    if (part === "--help" || part === "-h") {
      return { files, help: true }
    }
    if (part === "--file") {
      const next = args[index + 1]
      if (!next) {
        throw new Error("Missing value for --file")
      }
      files.push(path.resolve(process.cwd(), next))
      index++
      continue
    }
    if (part === "--config") {
      const next = args[index + 1]
      if (!next) {
        throw new Error("Missing value for --config")
      }
      config = next
      index++
      continue
    }
    throw new Error(`Unknown argument: ${part}`)
  }

  return config === undefined ? { files, help: false } : { files, help: false, config }
}

function defaultFiles(): Array<string> {
  return glob
    .sync("**/*.{ts,tsx,mts,cts}", {
      cwd: process.cwd(),
      nodir: true,
      ignore: [
        "**/node_modules/**",
        "**/dist/**",
        "**/build/**",
        "**/.git/**"
      ]
    })
    .map((filePath) => path.resolve(process.cwd(), filePath))
}

function run() {
  const { files, help, config } = parseArgs(process.argv.slice(2))

  if (help) {
    console.log("Usage: effect-app-codegen [--file <path>]... [--config <path>]")
    console.log("Runs codegen blocks in the given files, or scans the current working tree when omitted.")
    console.log(`Loads ${CONFIG_FILENAMES.join(", ")} from cwd when present; --config overrides.`)
    return
  }

  const defaults = loadConfig(process.cwd(), config)
  const targetFiles = files.length > 0 ? files : defaultFiles()
  const updated: Array<string> = []
  const untouched: Array<string> = []

  for (const filePath of targetFiles) {
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      throw new Error(`File not found: ${filePath}`)
    }

    const source = fs.readFileSync(filePath, "utf8")
    if (!source.includes("// codegen:start")) {
      continue
    }

    if (updateFile(filePath, source, defaults)) {
      updated.push(path.relative(process.cwd(), filePath))
    } else {
      untouched.push(path.relative(process.cwd(), filePath))
    }
  }

  console.log(`codegen: ${updated.length} updated, ${untouched.length} unchanged`)
  for (const filePath of updated) {
    console.log(`updated ${filePath}`)
  }
}

try {
  run()
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  console.error(message)
  process.exitCode = 1
}

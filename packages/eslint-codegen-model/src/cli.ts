#!/usr/bin/env node
import * as fs from "node:fs"
import * as path from "node:path"

import glob from "glob"

import { applyDefaults, blockRe, type CodegenDefaults, indentBlock, normaliseGeneratedContent, parseBlockOptions, renderPreset, trimTrailingNewline } from "./shared/codegen-block.js"
import { getExportedModelNames } from "./presets/model.js"
import { createModelTypeResolver, type ModelTypeResolver } from "./shared/type-resolver.js"

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

const modelBlockRe = /\/\/ codegen:start[ \t]*\{[^}]*\bpreset:\s*model\b/
const staticTypeModelBlockRe = /\/\/ codegen:start[ \t]*\{[^}]*\bpreset:\s*model\b[^}]*\bstatic:\s*true\b[^}]*\btype:\s*true\b/
const staticMakeModelBlockRe = /\/\/ codegen:start[ \t]*\{[^}]*\bpreset:\s*model\b[^}]*\bstatic:\s*true\b[^}]*\bmake:\s*true\b/

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

type CtorMode = "plain" | "type" | "make"

/**
 * Keep each model's `Opaque` base-class clause in sync with the block mode (idempotent):
 * - make → `S.OpaqueShape<X.Type, X.Encoded, X.Make>`
 * - type → `S.OpaqueType<X.Type, X.Encoded>`
 * - plain → `S.Opaque<X, X.Encoded>` (revert)
 *
 * Only `Opaque`-family clauses for the model's own `Self`/`Encoded` are touched (matches
 * `<X|X.Type, X.Encoded[, X.Make]>`); `Class`/`TaggedClass` models are left untouched.
 */
function syncCtor(source: string, modelNames: ReadonlyArray<string>, mode: CtorMode): string {
  let out = source
  for (const name of modelNames) {
    const n = escapeRe(name)
    const re = new RegExp(
      `((?:[A-Za-z_$][\\w$]*\\.)?)(?:Opaque|OpaqueType|OpaqueShape)<\\s*${n}(?:\\.Type)?\\s*,\\s*${n}\\.Encoded(?:\\s*,\\s*${n}\\.Make)?\\s*>`,
      "g"
    )
    const target = mode === "make"
      ? `$1OpaqueShape<${name}.Type, ${name}.Encoded, ${name}.Make>`
      : mode === "type"
      ? `$1OpaqueType<${name}.Type, ${name}.Encoded>`
      : `$1Opaque<${name}, ${name}.Encoded>`
    out = out.replace(re, target)
  }
  return out
}

function updateFile(filePath: string, source: string, defaults?: CodegenDefaults, resolver?: ModelTypeResolver): boolean {
  let changed = false

  // Sync each model's Opaque ctor to the block mode (make → OpaqueShape, type → OpaqueType,
  // else plain Opaque). Done outside codegen blocks, on the class declarations. Only for files
  // that actually contain a model codegen block, so manual OpaqueType/Shape usage is untouched.
  if (modelBlockRe.test(source)) {
    const mode: CtorMode = staticMakeModelBlockRe.test(source)
      ? "make"
      : staticTypeModelBlockRe.test(source)
      ? "type"
      : "plain"
    const synced = syncCtor(source, getExportedModelNames(source), mode)
    if (synced !== source) {
      changed = true
      source = synced
    }
  }

  const next = source.replace(
    blockRe,
    (_match, indent: string, rawOptions: string, body: string, endIndent: string) => {
      const options = applyDefaults(parseBlockOptions(rawOptions), defaults)
      const existingContent = trimTrailingNewline(body)
      const generatedContent = trimTrailingNewline(
        normaliseGeneratedContent(
          options,
          filePath,
          renderPreset(options, { filename: filePath, existingContent }, source, resolver)
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

interface ParsedArgs {
  files: Array<string>
  help: boolean
  config?: string
  tsconfig?: string
}

function parseArgs(args: ReadonlyArray<string>): ParsedArgs {
  const files: Array<string> = []
  let config: string | undefined
  let tsconfig: string | undefined

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
    if (part === "--tsconfig") {
      const next = args[index + 1]
      if (!next) {
        throw new Error("Missing value for --tsconfig")
      }
      tsconfig = path.resolve(process.cwd(), next)
      index++
      continue
    }
    throw new Error(`Unknown argument: ${part}`)
  }

  const result: ParsedArgs = { files, help: false }
  if (config !== undefined) result.config = config
  if (tsconfig !== undefined) result.tsconfig = tsconfig
  return result
}

// A model block requests static literal interfaces via `static: true`.
const staticModelBlockRe = /\/\/ codegen:start[ \t]*\{[^}]*\bpreset:\s*model\b[^}]*\bstatic:\s*true\b/

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

function findNearestTsconfig(fromDir: string): string | undefined {
  let dir = fromDir
  for (;;) {
    const candidate = path.join(dir, "tsconfig.json")
    if (fs.existsSync(candidate)) return candidate
    const parent = path.dirname(dir)
    if (parent === dir) return undefined
    dir = parent
  }
}

function run() {
  const { files, help, config, tsconfig } = parseArgs(process.argv.slice(2))

  if (help) {
    console.log("Usage: effect-app-codegen [--file <path>]... [--config <path>] [--tsconfig <path>]")
    console.log("Runs codegen blocks in the given files, or scans the current working tree when omitted.")
    console.log(`Loads ${CONFIG_FILENAMES.join(", ")} from cwd when present; --config overrides.`)
    console.log("--tsconfig enables `static` model blocks (type-checker-backed literal Encoded/Type).")
    return
  }

  const defaults = loadConfig(process.cwd(), config)
  const targetFiles = files.length > 0 ? files : defaultFiles()
  const updated: Array<string> = []
  const untouched: Array<string> = []

  // Build the type resolver lazily, only if some target file requests static model blocks.
  const candidateFiles = targetFiles.filter((f) => fs.existsSync(f) && fs.statSync(f).isFile())
  const staticFiles = candidateFiles.filter((f) => staticModelBlockRe.test(fs.readFileSync(f, "utf8")))
  let resolver: ModelTypeResolver | undefined
  if (staticFiles.length > 0) {
    const tsconfigPath = tsconfig ?? findNearestTsconfig(path.dirname(staticFiles[0]!))
    if (!tsconfigPath) {
      throw new Error("static model blocks require a tsconfig; pass --tsconfig <path>")
    }
    resolver = createModelTypeResolver({ tsconfigPath, files: staticFiles })
  }

  for (const filePath of targetFiles) {
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
      throw new Error(`File not found: ${filePath}`)
    }

    const source = fs.readFileSync(filePath, "utf8")
    if (!source.includes("// codegen:start")) {
      continue
    }

    if (updateFile(filePath, source, defaults, resolver)) {
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
